import { parse } from '../../vendor/acorn.mjs';
/** Small capability interpreter, not a host-JS eval sandbox.
 * Only explicit AST forms and explicit native capabilities can execute.
 * Each AST visit/call is metered; arrays, strings and recursion have bounds.
 */
class Scope {
    constructor(parent = null) { this.parent = parent; this.values = new Map(); this.constants = new Set(); }
    declare(k, v, c = false) { if (this.values.has(k))
        throw new Error(`重複した変数: ${k}`); this.values.set(k, v); if (c)
        this.constants.add(k); return v; }
    get(k) { if (this.values.has(k))
        return this.values.get(k); if (this.parent)
        return this.parent.get(k); throw new ReferenceError(`利用できない名前: ${k}`); }
    set(k, v) { if (this.values.has(k)) {
        if (this.constants.has(k))
            throw new Error(`const は再代入できません: ${k}`);
        this.values.set(k, v);
        return v;
    } if (this.parent)
        return this.parent.set(k, v); throw new Error(`未定義の変数: ${k}`); }
}
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor', 'caller', 'callee', 'arguments']);
export class RuntimeLimit extends Error {
    constructor(s) { super(s); this.name = 'RuntimeLimit'; }
}
export class Interpreter {
    constructor({ maxOps = 2000000, maxCells = 200000, maxDepth = 64 } = {}) {
        this.maxOps = maxOps;
        this.maxCells = maxCells;
        this.maxDepth = maxDepth;
        this.ops = 0;
        this.cells = 0;
        this.depth = 0;
        this.functions = new WeakMap();
        this.global = new Scope();
        const math = Object.create(null);
        for (const name of ['abs', 'acos', 'asin', 'atan', 'atan2', 'ceil', 'cos', 'exp', 'floor', 'hypot', 'log', 'log10', 'log2', 'max', 'min', 'pow', 'round', 'sign', 'sin', 'sqrt', 'tan', 'tanh', 'trunc'])
            math[name] = this.native(args => Math[name](...args));
        Object.assign(math, { PI: Math.PI, E: Math.E, SQRT2: Math.SQRT2 });
        this.global.declare('Math', math, true);
        for (const [k, v] of [['undefined', undefined], ['Infinity', Infinity], ['NaN', NaN]])
            this.global.declare(k, v, true);
        this.arrayFn = this.native(args => { if (args.length === 1 && typeof args[0] === 'number') {
            const n = args[0];
            this.allocate(n);
            return new Array(n).fill(undefined);
        } this.allocate(args.length); return [...args]; });
        this.global.declare('Array', this.arrayFn, true);
        this.global.declare('Number', this.native(a => Number(a[0])), true);
        this.global.declare('Boolean', this.native(a => Boolean(a[0])), true);
        this.global.declare('String', this.native(a => this.checked(String(a[0]))), true);
        this.global.declare('isFinite', this.native(a => Number.isFinite(a[0])), true);
        this.global.declare('Error', this.native(a => ({ message: String(a[0]).slice(0, 1000) })), true);
    }
    tick() { if (++this.ops > this.maxOps)
        throw new RuntimeLimit('命令予算を超過しました (operation budget)。'); }
    allocate(n) { if (!Number.isSafeInteger(n) || n < 0 || n > 10000 || (this.cells += n) > this.maxCells)
        throw new RuntimeLimit('配列・データ量の上限 (allocation limit) を超えました。'); }
    checked(v) { if (typeof v === 'string' && v.length > 20000)
        throw new RuntimeLimit('文字列の上限を超えました。'); return v; }
    native(fn) { const token = Object.create(null); this.functions.set(token, { native: fn }); return token; }
    isCallable(v) { return !!v && typeof v === 'object' && this.functions.has(v); }
    run(code, bindings = {}) {
        if (typeof code !== 'string' || code.length > 20000)
            throw new Error('コードは20,000文字以内です。');
        for (const [k, v] of Object.entries(bindings))
            this.global.declare(k, v, true);
        const tree = parse(code, { ecmaVersion: 2022, sourceType: 'script' });
        this.block(tree.body, this.global, false);
        return this;
    }
    has(name) { return this.global.values.has(name); }
    call(name, args = []) { return this.invoke(this.global.get(name), args); }
    functionValue(node, env) { if (node.async || node.generator)
        throw new Error('async / generator は未対応です。'); const token = Object.create(null); this.functions.set(token, { node, env }); return token; }
    invoke(fn, args) {
        this.tick();
        const def = fn && this.functions.get(fn);
        if (!def)
            throw new Error('呼び出せる関数ではありません。');
        if (++this.depth > this.maxDepth) {
            this.depth--;
            throw new RuntimeLimit('関数の再帰が深すぎます (recursion)。');
        }
        try {
            if (def.native)
                return this.checked(def.native(args));
            let e = new Scope(def.env);
            def.node.params.forEach((p, i) => this.bind(p, p.type === 'RestElement' ? args.slice(i) : args[i], e));
            if (def.node.body.type === 'BlockStatement') {
                const r = this.block(def.node.body.body, e, false);
                return r?.kind === 'return' ? r.value : undefined;
            }
            return this.expr(def.node.body, e);
        }
        finally {
            this.depth--;
        }
    }
    bind(p, v, e, isConst = false) { this.tick(); switch (p.type) {
        case 'Identifier': return e.declare(p.name, v, isConst);
        case 'AssignmentPattern': return this.bind(p.left, v === undefined ? this.expr(p.right, e) : v, e, isConst);
        case 'RestElement': return this.bind(p.argument, v, e, isConst);
        case 'ArrayPattern':
            p.elements.forEach((q, i) => q && this.bind(q, q.type === 'RestElement' ? v.slice(i) : this.member(v, i), e, isConst));
            return;
        case 'ObjectPattern':
            for (const q of p.properties) {
                if (q.type !== 'Property')
                    throw new Error('オブジェクト rest は未対応です。');
                const key = q.computed ? this.expr(q.key, e) : q.key.name || q.key.value;
                this.bind(q.value, this.member(v, key), e, isConst);
            }
            return;
        default: throw new Error(`未対応の代入形式: ${p.type}`);
    } }
    block(body, env, child = true) { const e = child ? new Scope(env) : env; for (const n of body)
        if (n.type === 'FunctionDeclaration')
            e.declare(n.id.name, this.functionValue(n, e)); for (const n of body) {
        if (n.type === 'FunctionDeclaration')
            continue;
        const r = this.stmt(n, e);
        if (r)
            return r;
    } }
    stmt(n, e) {
        this.tick();
        switch (n.type) {
            case 'EmptyStatement': return;
            case 'BlockStatement': return this.block(n.body, e);
            case 'ExpressionStatement':
                this.expr(n.expression, e);
                return;
            case 'VariableDeclaration':
                for (const d of n.declarations)
                    this.bind(d.id, d.init ? this.expr(d.init, e) : undefined, e, n.kind === 'const');
                return;
            case 'ReturnStatement': return { kind: 'return', value: n.argument ? this.expr(n.argument, e) : undefined };
            case 'IfStatement': return this.expr(n.test, e) ? this.stmt(n.consequent, e) : n.alternate ? this.stmt(n.alternate, e) : undefined;
            case 'BreakStatement': return { kind: 'break' };
            case 'ContinueStatement': return { kind: 'continue' };
            case 'ForStatement': {
                const s = new Scope(e);
                if (n.init) {
                    if (n.init.type === 'VariableDeclaration')
                        this.stmt(n.init, s);
                    else
                        this.expr(n.init, s);
                }
                while (!n.test || this.expr(n.test, s)) {
                    this.tick();
                    const r = this.stmt(n.body, s);
                    if (r?.kind === 'return')
                        return r;
                    if (r?.kind === 'break')
                        break;
                    if (n.update)
                        this.expr(n.update, s);
                }
                return;
            }
            case 'WhileStatement':
            case 'DoWhileStatement': {
                let first = true;
                while ((n.type === 'DoWhileStatement' && first) || this.expr(n.test, e)) {
                    first = false;
                    this.tick();
                    const r = this.stmt(n.body, e);
                    if (r?.kind === 'return')
                        return r;
                    if (r?.kind === 'break')
                        break;
                }
                return;
            }
            case 'ForOfStatement': {
                const a = this.expr(n.right, e);
                if (!Array.isArray(a))
                    throw new Error('for...of は配列のみ対応です。');
                for (let i = 0; i < a.length; i++) {
                    this.tick();
                    const s = new Scope(e);
                    if (n.left.type === 'VariableDeclaration')
                        this.bind(n.left.declarations[0].id, a[i], s, n.left.kind === 'const');
                    else
                        this.assign(n.left, a[i], s);
                    const r = this.stmt(n.body, s);
                    if (r?.kind === 'return')
                        return r;
                    if (r?.kind === 'break')
                        break;
                }
                return;
            }
            case 'ThrowStatement': {
                const v = this.expr(n.argument, e);
                throw new Error(typeof v === 'string' ? v : String(v?.message || 'ユーザーコードの例外'));
            }
            case 'TryStatement': {
                let r;
                try {
                    r = this.stmt(n.block, e);
                }
                catch (err) {
                    if (err instanceof RuntimeLimit || err.name === 'OracleLimit' || err.name === 'DomainError')
                        throw err;
                    if (!n.handler)
                        throw err;
                    const s = new Scope(e);
                    if (n.handler.param)
                        this.bind(n.handler.param, { message: err.message }, s);
                    r = this.stmt(n.handler.body, s);
                }
                if (n.finalizer) {
                    const f = this.stmt(n.finalizer, e);
                    if (f)
                        return f;
                }
                return r;
            }
            default: throw new Error(`この構文は未対応です: ${n.type}`);
        }
    }
    key(n, e) { const k = n.computed ? this.expr(n.property, e) : n.property.name; if (FORBIDDEN.has(String(k)))
        throw new Error('プロトタイプ・ホストへのアクセスは禁止です。'); return k; }
    member(obj, key) {
        this.tick();
        key = String(key);
        if (FORBIDDEN.has(key))
            throw new Error('プロトタイプ・ホストへのアクセスは禁止です。');
        if (obj === null || obj === undefined)
            throw new Error('空の値にアクセスしました。');
        if (obj === this.arrayFn) {
            if (key === 'isArray')
                return this.native(a => Array.isArray(a[0]));
            if (key === 'from')
                return this.native(a => { let n = Array.isArray(a[0]) ? a[0].length : a[0]?.length; this.allocate(n); return Array.from({ length: n }, (_, i) => a[1] ? this.invoke(a[1], [Array.isArray(a[0]) ? a[0][i] : undefined, i]) : Array.isArray(a[0]) ? a[0][i] : undefined); });
        }
        if (this.isCallable(obj))
            throw new Error('関数の内部にはアクセスできません。');
        if (Array.isArray(obj)) {
            if (key === 'length')
                return obj.length;
            if (/^(0|[1-9]\d*)$/.test(key))
                return obj[Number(key)];
            const methods = new Set(['map', 'reduce', 'forEach', 'filter', 'some', 'every', 'slice', 'fill', 'push', 'pop', 'shift', 'unshift', 'reverse', 'concat', 'join', 'includes', 'indexOf']);
            if (methods.has(key))
                return this.native(args => this.arrayMethod(obj, key, args));
            return undefined;
        }
        if (typeof obj === 'string') {
            if (key === 'length')
                return obj.length;
            if (/^(0|[1-9]\d*)$/.test(key))
                return obj[Number(key)];
            if (['slice', 'substring', 'includes', 'indexOf', 'toLowerCase', 'toUpperCase', 'trim'].includes(key))
                return this.native(args => this.checked(String.prototype[key].apply(obj, args)));
            return undefined;
        }
        if (typeof obj === 'object' && Object.hasOwn(obj, key))
            return obj[key];
        return undefined;
    }
    arrayMethod(a, k, args) {
        this.tick();
        if (['map', 'filter', 'forEach', 'some', 'every', 'reduce'].includes(k)) {
            const len = a.length;
            let out = [], acc = args[1], start = 0;
            if (k === 'reduce' && args.length < 2) {
                if (!len)
                    throw new Error('空配列の reduce には初期値が必要です。');
                acc = a[0];
                start = 1;
            }
            for (let i = start; i < len; i++) {
                this.tick();
                const v = this.invoke(args[0], k === 'reduce' ? [acc, a[i], i, a] : [a[i], i, a]);
                if (k === 'reduce')
                    acc = v;
                if (k === 'map' || (k === 'filter' && v)) {
                    this.allocate(1);
                    out.push(k === 'map' ? v : a[i]);
                }
                if (k === 'some' && v)
                    return true;
                if (k === 'every' && !v)
                    return false;
            }
            return k === 'reduce' ? acc : k === 'some' ? false : k === 'every' ? true : k === 'forEach' ? undefined : out;
        }
        if (k === 'slice') {
            const r = a.slice(...args);
            this.allocate(r.length);
            return r;
        }
        if (k === 'push' || k === 'unshift') {
            this.allocate(args.length);
            if (a.length + args.length > 10000)
                throw new RuntimeLimit('配列長の上限です。');
            return a[k](...args);
        }
        if (k === 'concat') {
            let n = a.length + args.reduce((s, v) => s + (Array.isArray(v) ? v.length : 1), 0);
            this.allocate(n);
            return a.concat(...args);
        }
        if (k === 'join') {
            const sep = args[0] === undefined ? ',' : String(args[0]);
            if (a.length * (sep.length + 1) > 20000)
                throw new RuntimeLimit('文字列の上限です。');
            return this.checked(a.join(sep));
        }
        return a[k](...args);
    }
    reference(n, e) {
        this.tick();
        if (n.type === 'Identifier')
            return { get: () => e.get(n.name), set: v => e.set(n.name, v) };
        if (n.type !== 'MemberExpression')
            throw new Error('この代入先は未対応です。');
        const object = this.expr(n.object, e), key = this.key(n, e);
        return { get: () => this.member(object, key), set: v => this.setMember(object, key, v) };
    }
    setMember(o, k, v) {
        this.tick();
        if (!o || typeof o !== 'object' || this.isCallable(o))
            throw new Error('代入先が不正です。');
        if (Array.isArray(o)) {
            if (k === 'length') {
                if (!Number.isSafeInteger(v) || v < 0 || v > 10000)
                    throw new RuntimeLimit('配列長の上限です。');
                if (v > o.length)
                    this.allocate(v - o.length);
                o.length = v;
                return v;
            }
            if (!/^(0|[1-9]\d*)$/.test(String(k)) || Number(k) >= 10000)
                throw new Error('配列の添字が不正です。');
            if (Number(k) >= o.length)
                this.allocate(Number(k) - o.length + 1);
        }
        else if (!Object.hasOwn(o, k))
            this.allocate(1);
        o[k] = v;
        return v;
    }
    assign(n, v, e) { return this.reference(n, e).set(v); }
    expr(n, e) {
        this.tick();
        switch (n.type) {
            case 'Literal':
                if (n.regex || n.bigint)
                    throw new Error('正規表現・BigInt は未対応です。');
                return this.checked(n.value);
            case 'Identifier': return e.get(n.name);
            case 'ArrayExpression': {
                let out = [];
                for (const el of n.elements) {
                    if (el?.type === 'SpreadElement') {
                        const a = this.expr(el.argument, e);
                        if (!Array.isArray(a))
                            throw new Error('spread は配列のみです。');
                        this.allocate(a.length);
                        out.push(...a);
                    }
                    else {
                        this.allocate(1);
                        out.push(el ? this.expr(el, e) : undefined);
                    }
                    if (out.length > 10000)
                        throw new RuntimeLimit('配列長の上限です。');
                }
                return out;
            }
            case 'ObjectExpression': {
                const o = Object.create(null);
                for (const p of n.properties) {
                    if (p.type !== 'Property' || p.kind !== 'init')
                        throw new Error('getter・spread は未対応です。');
                    const k = p.computed ? this.expr(p.key, e) : p.key.name ?? p.key.value;
                    if (FORBIDDEN.has(String(k)))
                        throw new Error('禁止されたキーです。');
                    this.allocate(1);
                    o[k] = this.expr(p.value, e);
                }
                return o;
            }
            case 'FunctionExpression':
            case 'ArrowFunctionExpression': return this.functionValue(n, e);
            case 'MemberExpression': return this.member(this.expr(n.object, e), this.key(n, e));
            case 'CallExpression':
            case 'NewExpression': {
                if (n.type === 'NewExpression' && !(n.callee.type === 'Identifier' && ['Array', 'Error'].includes(n.callee.name)))
                    throw new Error('new は Array / Error のみ対応です。');
                const fn = this.expr(n.callee, e), args = [];
                for (const a of n.arguments) {
                    if (a.type === 'SpreadElement') {
                        const v = this.expr(a.argument, e);
                        if (!Array.isArray(v) || v.length > 10000)
                            throw new Error('引数の spread が不正です。');
                        args.push(...v);
                    }
                    else
                        args.push(this.expr(a, e));
                }
                if (args.length > 10000)
                    throw new RuntimeLimit('引数の上限です。');
                return this.invoke(fn, args);
            }
            case 'ConditionalExpression': return this.expr(n.test, e) ? this.expr(n.consequent, e) : this.expr(n.alternate, e);
            case 'LogicalExpression': {
                const a = this.expr(n.left, e);
                return n.operator === '&&' ? (a ? this.expr(n.right, e) : a) : n.operator === '||' ? (a ? a : this.expr(n.right, e)) : (a === null || a === undefined ? this.expr(n.right, e) : a);
            }
            case 'UnaryExpression': {
                if (n.operator === 'typeof') {
                    try {
                        const v = this.expr(n.argument, e);
                        return this.isCallable(v) ? 'function' : typeof v;
                    }
                    catch (err) {
                        if (n.argument.type === 'Identifier' && err instanceof ReferenceError)
                            return 'undefined';
                        throw err;
                    }
                }
                const v = this.expr(n.argument, e);
                switch (n.operator) {
                    case '-': return -v;
                    case '+': return +v;
                    case '!': return !v;
                    case '~': return ~v;
                    case 'void': return undefined;
                    default: throw new Error('未対応の単項演算です。');
                }
            }
            case 'BinaryExpression': return this.binary(n.operator, this.expr(n.left, e), this.expr(n.right, e));
            case 'AssignmentExpression': {
                const ref = this.reference(n.left, e);
                if (n.operator === '=')
                    return ref.set(this.expr(n.right, e));
                const old = ref.get();
                if (n.operator === '&&=')
                    return old ? ref.set(this.expr(n.right, e)) : old;
                if (n.operator === '||=')
                    return old ? old : ref.set(this.expr(n.right, e));
                if (n.operator === '??=')
                    return old === null || old === undefined ? ref.set(this.expr(n.right, e)) : old;
                return ref.set(this.binary(n.operator.slice(0, -1), old, this.expr(n.right, e)));
            }
            case 'UpdateExpression': {
                const ref = this.reference(n.argument, e), old = Number(ref.get());
                const v = ref.set(n.operator === '++' ? old + 1 : old - 1);
                return n.prefix ? v : old;
            }
            case 'SequenceExpression': {
                let v;
                for (const x of n.expressions)
                    v = this.expr(x, e);
                return v;
            }
            case 'TemplateLiteral': {
                let s = '';
                for (let i = 0; i < n.quasis.length; i++) {
                    s += n.quasis[i].value.cooked;
                    if (n.expressions[i])
                        s += String(this.expr(n.expressions[i], e));
                    this.checked(s);
                }
                return s;
            }
            default: throw new Error(`この式は未対応です: ${n.type}`);
        }
    }
    binary(op, a, b) { switch (op) {
        case '+': return this.checked(a + b);
        case '-': return a - b;
        case '*': return a * b;
        case '/': return a / b;
        case '%': return a % b;
        case '**': return a ** b;
        case '<': return a < b;
        case '<=': return a <= b;
        case '>': return a > b;
        case '>=': return a >= b;
        case '===': return a === b;
        case '!==': return a !== b;
        case '==': return a == b;
        case '!=': return a != b;
        case '&': return a & b;
        case '|': return a | b;
        case '^': return a ^ b;
        case '<<': return a << b;
        case '>>': return a >> b;
        case '>>>': return a >>> b;
        default: throw new Error(`未対応の演算: ${op}`);
    } }
}
