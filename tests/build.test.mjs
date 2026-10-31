import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parse } from '../vendor/acorn.mjs';
test('portable bundle keeps replacement metacharacters intact and parses as one script', () => {
    execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'pipe' });
    const html = readFileSync('release/Optimizer-Playground.html', 'utf8');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 1);
    assert.doesNotThrow(() => parse(scripts[0][1], { ecmaVersion: 2022 }));
    assert.ok(html.includes('globalThis.__OPTIMIZER_WORKER__='));
    assert.ok(!html.includes('<script src='));
});
test('worker bundle initializes without treating Acorn comment examples as exports', async () => {
    const { runInNewContext } = await import('node:vm');
    const self = {};
    assert.doesNotThrow(() => runInNewContext(readFileSync('dist/worker.js', 'utf8'), { self, performance }, { timeout: 1000 }));
    assert.equal(typeof self.onmessage, 'function');
});
