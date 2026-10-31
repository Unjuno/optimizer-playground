/** Bounded mathematical expression parser. Never evaluates source as host JS. */
export function compileExpression(source) {
    if (typeof source !== 'string' || source.length > 700)
        throw new Error('数式は700文字以内です。');
    const tokens = [];
    let i = 0;
    while (i < source.length) {
        const rest = source.slice(i);
        let m;
        if ((m = /^\s+/.exec(rest))) {
            i += m[0].length;
            continue;
        }
        if ((m = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.exec(rest)))
            tokens.push({ type: 'num', value: Number(m[0]) });
        else if ((m = /^[a-zA-Z_][a-zA-Z_0-9]*/.exec(rest)))
            tokens.push({ type: 'id', value: m[0] });
        else if ((m = /^(\*\*|[+\-*/^(),])/.exec(rest)))
            tokens.push({ type: m[0] === '**' ? '^' : m[0] });
        else
            throw new Error(`数式の ${i + 1} 文字目を解釈できません。`);
        i += m[0].length;
        if (tokens.length > 350)
            throw new Error('数式が複雑すぎます。');
    }
    tokens.push({ type: 'end' });
    let at = 0, depth = 0;
    const names = new Set(['sin', 'cos', 'tan', 'tanh', 'exp', 'log', 'sqrt', 'abs', 'min', 'max', 'pow']);
    function parse(min = 0) {
        if (++depth > 50)
            throw new Error('数式の入れ子が深すぎます。');
        const t = tokens[at++];
        let n;
        if (t.type === 'num')
            n = { op: 'num', v: t.value };
        else if (t.type === '+' || t.type === '-')
            n = { op: 'unary', sign: t.type, a: parse(3) };
        else if (t.type === '(') {
            n = parse();
            if (tokens[at++].type !== ')')
                throw new Error('閉じ括弧が必要です。');
        }
        else if (t.type === 'id') {
            if (['x', 'y', 'pi', 'e', 'PI', 'E'].includes(t.value))
                n = { op: 'var', name: t.value.toLowerCase() };
            else if (names.has(t.value) && tokens[at++].type === '(') {
                const args = [parse()];
                while (tokens[at].type === ',') {
                    at++;
                    args.push(parse());
                }
                if (tokens[at++].type !== ')')
                    throw new Error('関数の閉じ括弧が必要です。');
                const count = ['min', 'max', 'pow'].includes(t.value) ? 2 : 1;
                if (args.length !== count)
                    throw new Error(`${t.value} は ${count} 引数です。`);
                n = { op: t.value, args };
            }
            else
                throw new Error(`利用できない名前: ${t.value}`);
        }
        else
            throw new Error('数式に値または変数が必要です。');
        while (true) {
            let op = tokens[at].type, prec = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 }[op];
            if (prec === undefined || prec < min)
                break;
            at++;
            n = { op, a: n, b: parse(op === '^' ? prec : prec + 1) };
        }
        depth--;
        return n;
    }
    const ast = parse();
    if (tokens[at].type !== 'end')
        throw new Error('数式に余分な文字があります。');
    const scale = (a, k, v) => [v, a[1] * k, a[2] * k];
    function power(a, b) { let v = a[0] ** b[0]; if (b[1] === 0 && b[2] === 0) {
        let k = b[0] === 0 ? 0 : b[0] * a[0] ** (b[0] - 1);
        return [v, k * a[1], k * a[2]];
    } if (a[0] <= 0)
        throw new Error('可変べき乗の底は正である必要があります。'); return [v, v * (b[1] * Math.log(a[0]) + b[0] * a[1] / a[0]), v * (b[2] * Math.log(a[0]) + b[0] * a[2] / a[0])]; }
    function ev(n, x, y) {
        if (n.op === 'num')
            return [n.v, 0, 0];
        if (n.op === 'var')
            return n.name === 'x' ? [x, 1, 0] : n.name === 'y' ? [y, 0, 1] : [n.name === 'pi' ? Math.PI : Math.E, 0, 0];
        const a = ev(n.a || n.args[0], x, y);
        if (n.op === 'unary')
            return n.sign === '-' ? a.map(v => -v) : a;
        let b = n.b ? ev(n.b, x, y) : n.args?.[1] ? ev(n.args[1], x, y) : null;
        switch (n.op) {
            case '+': return a.map((v, i) => v + b[i]);
            case '-': return a.map((v, i) => v - b[i]);
            case '*': return [a[0] * b[0], a[1] * b[0] + a[0] * b[1], a[2] * b[0] + a[0] * b[2]];
            case '/': return [a[0] / b[0], (a[1] * b[0] - a[0] * b[1]) / b[0] ** 2, (a[2] * b[0] - a[0] * b[2]) / b[0] ** 2];
            case '^':
            case 'pow': return power(a, b);
            case 'sin': return scale(a, Math.cos(a[0]), Math.sin(a[0]));
            case 'cos': return scale(a, -Math.sin(a[0]), Math.cos(a[0]));
            case 'tan': return scale(a, 1 / Math.cos(a[0]) ** 2, Math.tan(a[0]));
            case 'tanh': {
                let v = Math.tanh(a[0]);
                return scale(a, 1 - v * v, v);
            }
            case 'exp': return scale(a, Math.exp(a[0]), Math.exp(a[0]));
            case 'log': return scale(a, 1 / a[0], Math.log(a[0]));
            case 'sqrt': return scale(a, a[0] === 0 ? 0 : .5 / Math.sqrt(a[0]), Math.sqrt(a[0]));
            case 'abs': return scale(a, Math.sign(a[0]), Math.abs(a[0]));
            case 'min': return a[0] <= b[0] ? a : b;
            case 'max': return a[0] >= b[0] ? a : b;
            default: throw new Error('未対応の演算です。');
        }
    }
    return (x, y) => { const r = ev(ast, x, y); if (!r.every(Number.isFinite))
        throw new Error('数式または勾配が非有限値になりました。定義域を確認してください。'); return { value: r[0], gradient: [r[1], r[2]] }; };
}
