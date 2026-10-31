import { CHALLENGE_CASES } from './challenge.js';
import { validateConfig, ENGINE_VERSION } from './engine.js';
const text = (v, max, name) => { if (typeof v !== 'string' || v.length > max)
    throw new Error(`${name} の形式・長さが不正です。`); return v; };
const number = (v) => { if (!Number.isFinite(v))
    throw new Error('記録に有限でない値があります。'); return v; };
const point = v => { if (!Array.isArray(v) || v.length !== 2)
    throw new Error('座標の形式が不正です。'); return v.map(number); };
const integer = (v, max) => { if (!Number.isSafeInteger(v) || v < 0 || v > max)
    throw new Error('回数の形式が不正です。'); return v; };
export function validateExperiment(e) {
    if (!e || typeof e !== 'object')
        throw new Error('実験内容が必要です。');
    validateConfig(e.config);
    if (!Array.isArray(e.optimizers) || e.optimizers.length < 1 || e.optimizers.length > 4)
        throw new Error('手法は1〜4個です。');
    const optimizers = e.optimizers.map(o => ({ id: text(o.id, 50, '手法ID'), name: text(o.name, 60, '手法名'), code: text(o.code, 20000, 'コード'), color: /^#[a-f0-9]{6}$/i.test(o.color) ? o.color : '#72d9a2' }));
    if (!Array.isArray(e.results) || e.results.length > 4)
        throw new Error('結果の数が不正です。');
    const statuses = new Set(['steps', 'target', 'user-done', 'budget', 'out-of-bounds', 'runtime-limit', 'error']);
    const results = e.results.map((entry, index) => {
        const r = entry.result;
        if (!r || !statuses.has(r.status) || !Array.isArray(r.history) || r.history.length > 2001)
            throw new Error('実行記録の形式が不正です。');
        const history = r.history.map(h => ({ t: integer(h.t, 2000), point: point(h.point), loss: number(h.loss), best: number(h.best), gradient: point(h.gradient), ...(h.gradientAtPoint === undefined ? {} : { gradientAtPoint: point(h.gradientAtPoint) }), update: point(h.update), calls: integer(h.calls, 20000), metrics: Object.fromEntries(Object.entries(h.metrics || {}).slice(0, 48).map(([k, v]) => [text(k, 50, '観測値名'), number(v)])), population: (h.population || []).slice(0, 64).map(point) }));
        if (!r.counts)
            throw new Error('評価回数が必要です。');
        return { id: text(entry.id, 50, '手法ID'), name: text(entry.name, 60, '手法名'), color: optimizers.find(o => o.id === entry.id)?.color || '#72d9a2', result: { version: ENGINE_VERSION, history, steps: integer(r.steps, 2000), status: r.status, message: text(r.message || '', 500, '停止理由'), counts: { loss: integer(r.counts.loss, 20000), grad: integer(r.counts.grad, 20000), diagnostic: integer(r.counts.diagnostic, 10000) }, bestLoss: r.bestLoss === null ? null : number(r.bestLoss), bestPoint: point(r.bestPoint), finalLoss: r.finalLoss === null ? null : number(r.finalLoss), finalPoint: point(r.finalPoint), elapsedMs: Math.max(0, number(r.elapsedMs)), operations: integer(r.operations, 3000000), allocationCells: integer(r.allocationCells, 300000), scorable: r.scorable === true, optimum: r.optimum === null ? null : number(r.optimum), target: r.target === null ? null : number(r.target), budget: integer(r.budget, 20000), seed: integer(r.seed, 4294967295), backend: 'CPU / JavaScript Number (FP64)', trust: 'self-reported' } };
    });
    const config = JSON.parse(JSON.stringify(e.config));
    const benchmark = e.benchmark === undefined ? null : validateBenchmark(e.benchmark);
    if (benchmark && benchmark.code !== optimizers[0].code)
        throw new Error('チャレンジのコードが共有した更新規則と一致しません。');
    return { config, optimizers, results, engine: ENGINE_VERSION, environment: typeof e.environment === 'string' ? e.environment.slice(0, 180) : 'not recorded', ...(benchmark === null ? {} : { benchmark }) };
}
export function validatePost(body) { if (body?.consent !== true)
    throw new Error('投稿への明示的な同意が必要です。'); return { title: text(body.title || '無題の実験', 100, 'タイトル'), experiment: validateExperiment(body.experiment) }; }
function validateBenchmark(b) {
    if (!b || b.protocol !== 'suite-v1' || !Array.isArray(b.rows) || b.rows.length !== 9)
        throw new Error('チャレンジの形式が不正です。');
    const statuses = new Set(['steps', 'target', 'user-done', 'budget', 'out-of-bounds', 'runtime-limit', 'error']);
    const rows = b.rows.map((r, i) => {
        if (!r || !statuses.has(r.status))
            throw new Error('チャレンジ条件が不正です。');
        const start = point(r.start), expected = CHALLENGE_CASES[i];
        if (r.preset !== expected.preset || start.some((v, j) => v !== expected.start[j]) || r.seed !== expected.seed)
            throw new Error('チャレンジ条件が公式の9ケースと一致しません。');
        const score = integer(r.score, 1000);
        if (['error', 'runtime-limit', 'out-of-bounds'].includes(r.status) && score !== 0)
            throw new Error('チャレンジ失敗時のスコアは0である必要があります。');
        return { preset: r.preset, start, seed: integer(r.seed, 3), score, baseline: integer(r.baseline, 1000), finalLoss: r.finalLoss === null ? null : number(r.finalLoss), calls: integer(r.calls, 1200), status: r.status };
    });
    const score = integer(b.score, 1000), baseline = integer(b.baseline, 1000);
    if (score !== Math.round(rows.reduce((total, r) => total + r.score, 0) / rows.length) ||
        baseline !== Math.round(rows.reduce((total, r) => total + r.baseline, 0) / rows.length))
        throw new Error('チャレンジ平均スコアが各ケースの内訳と一致しません。');
    return { protocol: 'suite-v1', code: text(b.code, 20000, 'チャレンジのコード'), rows, score, baseline };
}
