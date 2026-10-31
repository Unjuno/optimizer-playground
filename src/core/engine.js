import { makeTerrain } from './terrains.js';
import { Interpreter, RuntimeLimit } from '../runtime/interpreter.js';
export const ENGINE_VERSION = '0.3.0';
export function seededRandom(seed = 42) { let s = seed >>> 0; return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function validateConfig(config) {
    if (!config || typeof config !== 'object')
        throw new Error('実験設定が必要です。');
    if (!config.terrain || typeof config.terrain !== 'object' || Array.isArray(config.terrain))
        throw new Error('地形設定はオブジェクトで指定してください。');
    for (const [name, lo, hi] of [['maxSteps', 1, 2000], ['maxCalls', 2, 20000]])
        if (!Number.isSafeInteger(config[name]) || config[name] < lo || config[name] > hi)
            throw new Error(`${name} は ${lo}〜${hi} の整数です。`);
    if (!Number.isSafeInteger(config.seed) || config.seed < 0 || config.seed > 4294967295)
        throw new Error('seed は32bit非負整数です。');
    const p = config.params;
    if (!p || typeof p !== 'object' || Object.keys(p).length > 32)
        throw new Error('設定が不正です。');
    for (const [k, v] of Object.entries(p))
        if (!Number.isFinite(v) || Math.abs(v) > 1e6)
            throw new Error(`${k} は有限の数値で指定してください。`);
    if (!(p.lr > 0 && p.lr <= 100) || !(p.beta >= 0 && p.beta < 1) || !(p.beta2 >= 0 && p.beta2 < 1) || !(p.eps > 0) || !(p.wd >= 0))
        throw new Error('学習率・移動平均係数・epsilon の範囲を確認してください。');
    const terrain = makeTerrain(config.terrain);
    checkPoint(config.start, terrain.bounds);
    return terrain;
}
function checkPoint(p, bounds) { if (!Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite))
    throw new Error('point は有限数2個の配列で返してください。'); if (p.some(v => v < bounds[0] || v > bounds[1])) {
    const e = new Error('表示・評価範囲の外に移動しました。値は自動補正していません。');
    e.name = 'DomainError';
    throw e;
} }
function cleanMetrics(metrics) { const out = Object.create(null); if (!metrics || typeof metrics !== 'object')
    return out; for (const [k, v] of Object.entries(metrics).slice(0, 12)) {
    if (k.length > 40)
        continue;
    if (typeof v === 'number' && Number.isFinite(v))
        out[k] = v;
    else if (Array.isArray(v))
        for (let i = 0; i < Math.min(4, v.length); i++)
            if (Number.isFinite(v[i]))
                out[`${k}${i}`] = v[i];
} return out; }
export function simulate(config, code) {
    const terrain = validateConfig(config), startTime = performance.now();
    const counts = { loss: 0, grad: 0, diagnostic: 0 };
    const history = [];
    let bestLoss = Infinity, bestPoint = [...config.start], point = [...config.start], state = Object.create(null), steps = 0, status = 'steps', message = '更新回数の上限に到達';
    const vm = new Interpreter(), random = seededRandom(config.seed);
    let lastGradient = [0, 0];
    const guard = () => { if (counts.loss + counts.grad >= config.maxCalls) {
        const e = new Error('関数・勾配評価の予算に到達');
        e.name = 'OracleLimit';
        throw e;
    } };
    const loss = p => { checkPoint(p, terrain.bounds); guard(); counts.loss++; const v = terrain.value(p); if (!Number.isFinite(v))
        throw new Error('損失が非有限値です。'); if (v < bestLoss) {
        bestLoss = v;
        bestPoint = [...p];
    } return v; };
    const grad = p => { checkPoint(p, terrain.bounds); guard(); counts.grad++; return terrain.gradient(p); };
    const lossFn = vm.native(args => loss(args[0])), gradFn = vm.native(args => grad(args[0])), randomFn = vm.native(() => random());
    const api = t => ({ point: [...point], state, params: { ...config.params }, bounds: [...terrain.bounds], t, loss: lossFn, grad: gradFn, random: randomFn });
    const observe = (t, f, delta, metrics, population) => {
        counts.diagnostic++;
        const gradientAtPoint = terrain.gradient(point);
        lastGradient = t === 0 ? gradientAtPoint : history.at(-1).gradientAtPoint;
        let samples = [];
        if (Array.isArray(population)) {
            samples = population.slice(0, 64).filter(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)).map(p => p.slice());
        }
        history.push({ t, point: point.slice(), loss: f, best: bestLoss, gradient: lastGradient.slice(), gradientAtPoint: gradientAtPoint.slice(), update: delta, metrics: cleanMetrics(metrics), calls: counts.loss + counts.grad, population: samples });
    };
    try {
        const initial = loss(point);
        observe(0, initial, [0, 0], null, null);
        vm.run(code);
        if (!vm.has('step'))
            throw new Error('function step(a) を定義してください。');
        if (vm.has('init'))
            state = vm.call('init', [api(0)]);
        if (!terrain.custom && initial - terrain.optimum <= terrain.target) {
            status = 'target';
            message = '開始点が目標閾値を満たしています。';
        }
        else
            for (let t = 1; t <= config.maxSteps; t++) {
                const result = vm.call('step', [api(t)]);
                const next = Array.isArray(result) ? result : result?.point;
                checkPoint(next, terrain.bounds);
                const f = loss(next);
                const delta = next.map((v, i) => v - point[i]);
                point = next.slice();
                if (result && Object.hasOwn(result, 'state'))
                    state = result.state;
                steps = t;
                observe(t, f, delta, result?.metrics, result?.points);
                if (!terrain.custom && f - terrain.optimum <= terrain.target) {
                    status = 'target';
                    message = '目標の損失閾値に到達';
                    break;
                }
                if (result?.done) {
                    status = 'user-done';
                    message = 'オプティマイザが終了を返しました。';
                    break;
                }
            }
    }
    catch (err) {
        if (err.name === 'OracleLimit') {
            status = 'budget';
        }
        else if (err.name === 'DomainError') {
            status = 'out-of-bounds';
        }
        else if (err instanceof RuntimeLimit) {
            status = 'runtime-limit';
        }
        else {
            status = 'error';
        }
        message = String(err.message || err).slice(0, 500);
    }
    return { version: ENGINE_VERSION, history, steps, status, message, counts, bestLoss: Number.isFinite(bestLoss) ? bestLoss : null, bestPoint, finalLoss: history.at(-1)?.loss ?? null, finalPoint: point, elapsedMs: performance.now() - startTime, operations: vm.ops, allocationCells: vm.cells, scorable: !terrain.custom, optimum: terrain.custom ? null : terrain.optimum, target: terrain.custom ? null : terrain.target, budget: config.maxCalls, seed: config.seed, backend: 'CPU / JavaScript Number (FP64)', trust: 'self-reported' };
}
export function scoreRun(r) {
    if (!r.scorable || !r.history?.length || !Number.isFinite(r.bestLoss) ||
        !Number.isFinite(r.finalLoss) || !Number.isFinite(r.history[0].loss) ||
        !Number.isFinite(r.optimum) || !(r.target > 0) || !Number.isFinite(r.target) ||
        !r.counts || !Number.isSafeInteger(r.counts.loss) || r.counts.loss < 0 ||
        !Number.isSafeInteger(r.counts.grad) || r.counts.grad < 0 ||
        !Number.isSafeInteger(r.budget) || r.budget < 1)
        return null;
    if (['error', 'runtime-limit', 'out-of-bounds'].includes(r.status))
        return 0;
    const initial = Math.max(0, r.history[0].loss - r.optimum), final = Math.max(0, r.finalLoss - r.optimum);
    if (initial <= r.target)
        return 0;
    const quality = Math.max(0, Math.min(1, Math.log(initial / Math.max(final, r.target)) / Math.log(initial / r.target)));
    const bonus = r.status === 'target' ? 200 * Math.max(0, 1 - (r.counts.loss + r.counts.grad) / r.budget) : 0;
    return Math.round(800 * quality + bonus);
}
