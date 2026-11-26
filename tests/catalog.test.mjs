import {test} from 'node:test';import assert from 'node:assert/strict';import {validate,inspectGLB} from '../scripts/validate-catalog.mjs';
const empty=()=>({schemaVersion:1,specimens:[],structures:[],assets:[]});
test('empty foundation valid',()=>assert.deepEqual(validate(empty()),[]));
test('invalid root and duplicate IDs rejected',()=>{assert.ok(validate([]).length);assert.ok(validate({...empty(),specimens:[{id:'x'},{id:'x'}]}).some(e=>e.includes('duplicate')));});
test('cannot approve through status alone',()=>assert.ok(validate({...empty(),assets:[{id:'x',review:{status:'expert-reviewed'},rightsReview:{status:'expert-reviewed'},geometry:'procedural'}]}).some(e=>e.includes('review'))));
test('reject unsupported license and traversal',()=>assert.ok(validate({...empty(),assets:[{id:'x',source:{license:'CC-BY-ND-4.0'},model:{path:'models/../bad.glb'}}]}).length>=2));
test('invalid GLB rejected',()=>assert.throws(()=>inspectGLB(Buffer.alloc(20))));
test('dangling relationship rejected',()=>assert.ok(validate({...empty(),structures:[{id:'x',relations:[{type:'innervates',targetId:'missing'}]}]}).some(e=>e.includes('relation'))));
