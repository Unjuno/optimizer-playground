import test from 'node:test';
import assert from 'node:assert/strict';
import {toCSV} from '../src/core/csv.js';
test('CSV quotes text, preserves numbers and prevents formula injection in names',()=>{
  assert.equal(toCSV([['method','value'],['=1+1',-2],['text,"name"',0]]),'"method","value"\r\n"\'=1+1","-2"\r\n"text,""name""","0"');
  for(const value of ['+SUM(1)','-cmd','@data','\tcommand','  =command'])assert.ok(toCSV([[value]]).startsWith('"\''));
});
