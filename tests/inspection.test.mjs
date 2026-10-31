import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestTrajectoryStep, stepFromSignalChart } from '../src/ui/inspection.js';

const runs = [
  { result: { history: [
    { t: 0, point: [-1, -1] },
    { t: 1, point: [0, 0] },
    { t: 2, point: [1, 1] }
  ] } },
  { result: { history: [
    { t: 0, point: [-1, -1] },
    { t: 1, point: [0.5, 0] },
    { t: 2, point: [1.5, 1] }
  ] } }
];
const scene = { runs, bounds: [-2, 2], box: { x: 10, y: 20, s: 200 }, radius: 15 };

test('trajectory inspector resolves a near sample to the correct optimizer and step', () => {
  assert.deepEqual(nearestTrajectoryStep({ ...scene, x: 135, y: 120, focused: 0 }), { runIndex: 1, step: 1 });
  assert.deepEqual(nearestTrajectoryStep({ ...scene, x: 110, y: 120, focused: 1 }), { runIndex: 0, step: 1 });
});
test('inspector prefers focused optimizer at identical locations and rejects far clicks', () => {
  assert.deepEqual(nearestTrajectoryStep({ ...scene, x: 60, y: 170, focused: 1 }), { runIndex: 1, step: 0 });
  assert.equal(nearestTrajectoryStep({ ...scene, x: 180, y: 40, focused: 1 }), null);
  assert.equal(nearestTrajectoryStep({ ...scene, x: -10, y: 170, focused: 1 }), null);
});
test('inspector skips nonfinite trajectory rows and tolerates missing histories', () => {
  const bad = [{ result: { history: [{ t: 0, point: [NaN, 0] }] } }, { result: { history: [] } }];
  assert.equal(nearestTrajectoryStep({ ...scene, runs: bad, x: 110, y: 120, focused: 0 }), null);
});
test('time-series selection returns valid step positions and clamps outside chart', () => {
  assert.equal(stepFromSignalChart(5, 200, 31), 0);
  assert.equal(stepFromSignalChart(194, 200, 31), 30);
  assert.equal(stepFromSignalChart(100, 200, 31), 15);
  assert.equal(stepFromSignalChart(100, 200, 1), 0);
  assert.equal(stepFromSignalChart(100, 200, 0), null);
});

test('inspector can select a long line segment between recorded sample markers', () => {
  const segmentRun = [{ result: { history: [
    { t: 0, point: [-1, -1] },
    { t: 1, point: [1, 1] },
  ] } }];
  assert.deepEqual(nearestTrajectoryStep({ ...scene, runs: segmentRun, x: 120, y: 110, focused: 0 }), { runIndex: 0, step: 1 });
});
