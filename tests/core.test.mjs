import test from 'node:test';
import assert from 'node:assert/strict';
import { compileExpression } from '../src/core/expression.js';
import { makeTerrain, TERRAINS } from '../src/core/terrains.js';
import { simulate, scoreRun } from '../src/core/engine.js';
import { OPTIMIZERS, generateRecipe } from '../src/core/optimizers.js';
const near = (a, b, t = 1e-7) => assert.ok(Math.abs(a - b) < t, `${a} != ${b}`);
const cfg = (o = {}) => ({ terrain: { preset: 'bowl', bumps: [] }, start: [2, 1], params: { lr: .1, beta: .9, beta2: .999, eps: 1e-8, wd: .01 }, maxSteps: 100, maxCalls: 1000, seed: 42, ...o });
test('expression derivatives and precedence', () => { let e = compileExpression('x^2 + 3*y^2 + sin(x)'); let r = e(2, 1); near(r.value, 7 + Math.sin(2)); near(r.gradient[0], 4 + Math.cos(2)); near(r.gradient[1], 6); near(compileExpression('-x^2')(2, 0).value, -4); });
test('unsafe/invalid expressions rejected', () => { for (let s of ['window.fetch(1)', 'x.constructor', 'x;alert(1)', '(', '2**'])
    assert.throws(() => compileExpression(s)); assert.throws(() => compileExpression('log(x)')(-1, 0)); });
test('all preset gradients match finite differences', () => { for (let p of TERRAINS) {
    let f = makeTerrain({ preset: p.id });
    let q = [.37, -.42];
    let g = f.gradient(q);
    for (let j = 0; j < 2; j++) {
        let a = [...q], b = [...q];
        a[j] += 1e-5;
        b[j] -= 1e-5;
        near(g[j], (f.value(a) - f.value(b)) / 2e-5, 1e-4);
    }
} });
test('hand-drawn Gaussian changes objective and its gradient', () => { let base = makeTerrain({ preset: 'bowl' }), f = makeTerrain({ preset: 'bowl', bumps: [{ x: 1, y: 0, a: 2, r: .5 }] }); near(f.value([1, 0]) - base.value([1, 0]), 2); near(f.gradient([1, 0])[0], base.gradient([1, 0])[0]); assert.ok(f.gradient([1.2, 0])[0] < base.gradient([1.2, 0])[0]); });
test('SGD first step and convergence', () => { let r = simulate(cfg(), OPTIMIZERS.sgd.code); near(r.history[1].point[0], 1.8); near(r.history[1].point[1], .9); assert.ok(r.bestLoss < 1e-4); assert.equal(r.counts.grad, r.steps); assert.equal(r.counts.loss, r.steps + 1); });
test('Adam first step has correct bias correction', () => { let r = simulate(cfg({ maxSteps: 1 }), OPTIMIZERS.adam.code); near(r.history[1].point[0], 1.9); near(r.history[1].point[1], .9); });
test('gradient-free arbitrary state and multiple calls supported', () => { let r = simulate(cfg({ maxSteps: 3 }), `function init(){return {moves:[]};} function step(a){ let p=a.point.slice(); for(let i=0;i<2;i++){let q=p.slice();q[i]-=0.1;if(a.loss(q)<a.loss(p))p=q;} a.state.moves.push(p.slice());return {point:p,state:a.state,metrics:{moves:a.state.moves.length}}; }`); assert.equal(r.counts.grad, 0); assert.ok(r.counts.loss > r.steps + 1); near(r.history.at(-1).point[0], 1.7); });
test('evaluation budget, nonfinite, bounds and errors are distinct', () => { assert.equal(simulate(cfg({ maxCalls: 4 }), OPTIMIZERS.sgd.code).status, 'budget'); assert.equal(simulate(cfg(), 'function step(a){return {point:[0/0,0]};}').status, 'error'); assert.equal(simulate(cfg(), 'function step(a){return {point:[999,0]};}').status, 'out-of-bounds'); });
test('seeded random is reproducible', () => { let c = 'function step(a){return {point:[a.random()-.5,a.random()-.5]};}'; assert.deepEqual(simulate(cfg({ maxSteps: 4 }), c).history, simulate(cfg({ maxSteps: 4 }), c).history); });
test('visual recipe generates executable composable optimizer', () => { let code = generateRecipe({ history: 'ema', transform: 'rms', clip: 1, decay: true }); let r = simulate(cfg({ maxSteps: 10 }), code); assert.equal(r.status, 'steps'); assert.ok(r.history.length > 1); });
test('score is null for edited terrain, bounded otherwise', () => { let r = simulate(cfg(), OPTIMIZERS.sgd.code); assert.ok(scoreRun(r) >= 0 && scoreRun(r) <= 1000); assert.equal(scoreRun({ ...r, scorable: false }), null); });
test('failed runs cannot receive a successful challenge score', () => { const c = 'function step(a){if(a.t>1)throw Error("failed");return {point:[0.02,0.02]};}'; const r = simulate(cfg(), c); assert.equal(r.status, 'error'); assert.equal(scoreRun(r), 0); });
test('terrain settings must be a record rather than an array or string', () => { assert.throws(() => simulate(cfg({ terrain: [] }), OPTIMIZERS.sgd.code)); assert.throws(() => simulate(cfg({ terrain: 'bowl' }), OPTIMIZERS.sgd.code)); });

test('incomplete or malformed terminal losses never earn a score', () => {
    const valid = simulate(cfg({ maxSteps: 4 }), OPTIMIZERS.sgd.code);
    assert.notEqual(scoreRun(valid), null);
    assert.equal(scoreRun({ ...valid, finalLoss: null }), null);
    assert.equal(scoreRun({ ...valid, finalLoss: Number.NaN }), null);
    assert.equal(scoreRun({ ...valid, history: [{ ...valid.history[0], loss: NaN }] }), null);
});

test('each history sample reports gradient at displayed position and the departure gradient separately', () => {
  const r = simulate(cfg({ maxSteps: 6 }), OPTIMIZERS.sgd.code);
  assert.equal(r.history.length, 7);
  for (let i = 0; i < r.history.length; i++) {
    const row = r.history[i];
    assert.equal(row.gradientAtPoint.length, 2);
    for (let j = 0; j < 2; j++) {
      near(row.gradientAtPoint[j], row.point[j]); // bowl f = (x²+y²)/2
      near(row.gradient[j], r.history[Math.max(0, i - 1)].point[j]);
    }
  }
});
