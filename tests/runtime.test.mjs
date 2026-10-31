import test from 'node:test';
import assert from 'node:assert/strict';
import { Interpreter } from '../src/runtime/interpreter.js';
const run = (s, opts = {}) => { let vm = new Interpreter(opts); vm.run(s); return vm.call('main', []); };
test('functions, loops, matrix arrays and destructuring work', () => { assert.equal(run('function main(){let a=[[1,2],[3,4]];let s=0;for(const row of a){for(let j=0;j<row.length;j++)s+=row[j];}return s;}'), 10); assert.equal(run('function main(){let {x,y}={x:2,y:3};return [x,y].map(v=>v*v).reduce((s,v)=>s+v,0);}'), 13); });
test('infinite loop exhausts interpreter fuel', () => { assert.throws(() => run('function main(){while(true){}}', { maxOps: 1000 }), /予算|budget/); });
test('browser, network, host eval, prototype escape unavailable', () => { for (let body of ['fetch("/api/posts")', 'globalThis', 'window', 'new Function("return 1")', '[].constructor', '({}).__proto__', 'Math.sin.constructor'])
    assert.throws(() => run('function main(){return ' + body + ';}')); });
test('oversized arrays and recursion are stopped', () => { assert.throws(() => run('function main(){return Array(10000000);}', { maxCells: 1000 }), /上限|limit/); assert.throws(() => run('function main(){return main();}', { maxDepth: 20 }), /深|recurs/); });
test('const reassignment and unsupported syntax produce errors', () => { assert.throws(() => run('function main(){const x=1;x=2;return x;}')); assert.throws(() => run('class A{}; function main(){return 0;}')); });
test('random uses provided seeded source only', () => { let vm = new Interpreter(); vm.run('function main(){return Math.random();}'); assert.throws(() => vm.call('main', [])); });
test('compound assignment and updates evaluate the target exactly once before RHS', () => { assert.deepEqual(run('function main(){let a=[2,3];let i=0;a[i++] += i;return [a[0],a[1],i];}'), [3, 3, 1]); assert.deepEqual(run('function main(){let a=[2,3];let i=0;let z=a[i++]++;return [a[0],a[1],i,z];}'), [3, 3, 1, 2]); });
test('typeof only suppresses missing identifiers, not capability or runtime errors', () => { assert.equal(run('function main(){return typeof missing;}'), 'undefined'); assert.throws(() => run('function main(){return typeof [1].constructor;}')); });
test('large joined strings and sparse additions are bounded', () => { assert.throws(() => run('function main(){return Array(100).fill("a".slice(0)+Array(500).fill("x").join("")).join("");}'), /文字列|上限/); });
test('spread arrays stay within the documented per-array bound', () => { assert.throws(() => run('function main(){return [...Array(6000),...Array(6000)];}'), /配列|上限/); });
test('async and generator functions are explicitly rejected, not silently synchronous', () => { assert.throws(() => run('async function main(){return 1;}'), /async|generator/); assert.throws(() => run('function* main(){return 1;}'), /async|generator/); });
