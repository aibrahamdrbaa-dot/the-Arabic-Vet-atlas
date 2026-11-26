import {test} from 'node:test';import assert from 'node:assert/strict';import {validate} from '../scripts/validate-catalog.mjs';
test('empty foundation valid',()=>assert.deepEqual(validate([]),[]));
test('invalid input rejected',()=>assert.ok(validate([{}]).length>0));
test('restricted or incomplete assets rejected',()=>assert.ok(validate([{id:'x',review:'expert-reviewed',geometry:'procedural',license:'CC-BY-ND-4.0'}]).some(e=>e.includes('license'))));
