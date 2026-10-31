import test from 'node:test';
import assert from 'node:assert/strict';
import { validateExperiment } from '../src/core/schema.js';
const base = () => ({ config: { terrain: { preset: 'bowl' }, start: [1, 1], params: { lr: .1, beta: .9, beta2: .999, eps: 1e-8, wd: .01 }, maxSteps: 300, maxCalls: 1200, seed: 1 }, optimizers: [{ id: 'custom', name: 'My optimizer', code: 'function step(a){return {point:a.point};}', color: '#72d9a2' }], results: [] });
const challengeCases = [
    ['bowl', [-2.2, 1.8]], ['bowl', [1.6, 2.2]], ['bowl', [-.6, -1.8]],
    ['ravine', [-2.4, 1.5]], ['ravine', [2.1, -1.3]], ['ravine', [-2.2, -1.7]],
    ['rosenbrock', [-1.2, 1]], ['rosenbrock', [1.4, -.5]], ['rosenbrock', [.1, 1.5]],
];
const benchmark = () => ({ protocol: 'suite-v1', code: base().optimizers[0].code, score: 400, baseline: 300, rows: challengeCases.map(([preset, start], i) => ({ preset, start: [...start], seed: i % 3 + 1, score: 400, baseline: 300, finalLoss: .01, calls: 15, status: 'steps' })) });
test('share schema preserves bounded challenge results and implementation', () => { let input = base(); input.benchmark = benchmark(); assert.deepEqual(validateExperiment(input).benchmark, input.benchmark); });
test('share schema rejects invalid challenge protocol, count, values and code', () => { for (const edit of [b => b.protocol = 'other', b => b.rows.push(b.rows[0]), b => b.rows[0].score = 1001, b => b.code = 'x'.repeat(20001)]) {
    let input = base();
    input.benchmark = benchmark();
    edit(input.benchmark);
    assert.throws(() => validateExperiment(input));
} });


test('a claimed nine-case benchmark must use the canonical test cases and arithmetic mean', () => {
    const mutations = [
        b => { b.rows[0].start = [1, 1]; },
        b => { b.rows[2].preset = 'ravine'; },
        b => { b.rows[4].seed = 3; },
        b => { b.rows[0] = structuredClone(b.rows[1]); },
        b => { b.score = 1000; },
        b => { b.baseline = 1000; },
        b => { b.rows[0].status = 'error'; },
    ];
    for (const change of mutations) {
        const item = base(); item.benchmark = benchmark(); change(item.benchmark);
        assert.throws(() => validateExperiment(item), /チャレンジ/, 'accepted invalid benchmark: ' + change.toString());
    }
});

test('shared benchmark must describe the same implementation as the shared experiment', () => {
    const item = base(); item.benchmark = benchmark();
    item.benchmark.code = 'function step(a){ return {point:[0,0]}; }';
    assert.throws(() => validateExperiment(item), /チャレンジ/);
});

test('share schema preserves current-location gradients while accepting legacy rows', () => {
    const item = base();
    const row = { t: 0, point: [1, 1], loss: 1, best: 1, gradient: [1, 1], gradientAtPoint: [1, 1], update: [0, 0], calls: 1, metrics: {}, population: [] };
    const r = { status: 'steps', history: [row], steps: 0, message: '', counts: { loss: 1, grad: 0, diagnostic: 1 }, bestLoss: 1, bestPoint: [1, 1], finalLoss: 1, finalPoint: [1, 1], elapsedMs: 0, operations: 0, allocationCells: 0, scorable: true, optimum: 0, target: 0.0001, budget: 1200, seed: 1 };
    item.results = [{ id: 'custom', name: 'My optimizer', result: r }];
    const checked = validateExperiment(item);
    assert.deepEqual(checked.results[0].result.history[0].gradientAtPoint, [1,1]);
    const legacy = structuredClone(item);
    delete legacy.results[0].result.history[0].gradientAtPoint;
    assert.equal('gradientAtPoint' in validateExperiment(legacy).results[0].result.history[0], false);
    const invalid = structuredClone(item);
    invalid.results[0].result.history[0].gradientAtPoint = [Infinity,0];
    assert.throws(() => validateExperiment(invalid), /有限/);
});
