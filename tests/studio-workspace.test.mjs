import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const code=read('site/assets/studio.js');
const all=['cat','dog'];
test('both studios use same engine, no upload entry points, unique required IDs',()=>{
 for(const a of all){
  const html=read('site/'+a+'/skeleton/index.html');
  assert.match(html,/data-specimen=/);
  assert.match(html,/assets\/studio.css/);
  assert.doesNotMatch(html,/type=["']file|upload-box/);
  assert.match(read('site/'+a+'/skeleton/study.js'),/import '\/assets\/studio.js'/);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size);
  for(const id of [...code.matchAll(/(?<![.\w])get\('([^']+)'\)/g)].map(m=>m[1])) assert.ok(ids.includes(id)||id==='pane-',id);
 }
 assert.doesNotMatch(code,/file\.arrayBuffer|get\('file'\)|FileReader/);
 assert.match(code,/model\.origin !== location\.origin/);
});
test('list rows cannot shrink and notes are separated from science',()=>{
 const css=read('site/assets/studio.css');
 assert.match(css,/\.bone-item\{flex:0 0 auto/);
 for(const a of all) assert.match(read('site/'+a+'/skeleton/index.html'),/لا تعدّل البيانات العلمية ولا تُرسل إلى الخادم/);
});
function mock(){
 const els=new Map();let value=null;let failure=false;
 const el=id=>{if(!els.has(id))els.set(id,{value:'',textContent:'',dataset:{},children:[],disabled:false,hidden:false,addEventListener(){},setAttribute(){},append(...x){this.children.push(...x)},replaceChildren(){this.children=[]},querySelectorAll(){return[]},focus(){}});return els.get(id)};
 const ctx=vm.createContext({document:{body:{dataset:{specimen:'cat-test'}},getElementById:el,querySelectorAll:()=>[],createElement:()=>el(Symbol()),addEventListener(){}},window:{addEventListener(){}},localStorage:{getItem:()=>value,setItem:(k,v)=>{if(failure)throw Error('denied');value=v}},clearTimeout(){},setTimeout(){},confirm:()=>false});
 vm.runInContext(code.split('async function createViewer()')[0],ctx);
 const run=s=>vm.runInContext(s,ctx);
 run('noteReady=true');
 return {el,run,read:()=>JSON.parse(value),fail:()=>failure=true};
}
test('notes saved by specimen and structure and erased by empty value',()=>{
 const m=mock();
 m.el('note').value='overview';assert.equal(m.run('saveNote()'),true);
 m.el('part').value='bone-1';m.el('note').value='bone note';assert.equal(m.run('saveNote()'),true);
 assert.equal(m.read().specimens['cat-test'].notes['specimen:overview'],'overview');
 assert.equal(m.read().specimens['cat-test'].notes['bone-1'],'bone note');
 m.el('note').value='';m.run('saveNote()');assert.equal(m.read().specimens['cat-test'].notes['bone-1'],undefined);
});
test('failed save does not report success or mutate saved data',()=>{
 const m=mock();m.el('note').value='first';m.run('saveNote()');
 m.fail();m.el('note').value='unsaved';assert.equal(m.run('saveNote()'),false);
 assert.equal(m.read().specimens['cat-test'].notes['specimen:overview'],'first');
 assert.match(m.el('note-status').textContent,/تعذّر/);
});
