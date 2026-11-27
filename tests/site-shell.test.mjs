import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('site/index.html');
const scripts=[...html.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(x=>x.trim());
const ctx=vm.createContext({console,URLSearchParams,window:{location:{hash:'#/',pathname:'/',search:''}},document:{},fetch:async()=>{throw Error('not used')}});
vm.runInContext(read('site/assets/atlas-registry.js')+'\n'+scripts.at(-1).split('    const menuBtn =')[0],ctx);
const run=s=>vm.runInContext(s,ctx);
for(const animal of ['cat','dog']){
 const data=read('site/'+animal+'/skeleton/catalog.json');
 run('appState.catalogs.set("/'+animal+'/skeleton/catalog.json",'+data+')');
}
run('appState.loading=false');
test('home discovers both published species',()=>{const p=run('renderHome()');assert.match(p,/#\/animals\/cat/);assert.match(p,/#\/animals\/dog/);});
test('same species template renders both catalogs and region links',()=>{for(const animal of ['cat','dog']){const p=run('renderSpeciesDetail(SPECIES_REGISTRY.find(s=>s.slug==="'+animal+'"))');assert.match(p,new RegExp('/'+animal+'/skeleton/\\?region='));assert.equal((p.match(/\?region=/g)||[]).length,8);}});
test('search includes both animals and filters correctly',()=>{run('appState.searchQuery="Humerus"');let p=run('renderSearch()');assert.match(p,/cat\/skeleton\/\?structure=/);assert.match(p,/dog\/skeleton\/\?structure=/);run('appState.searchSpecies="dog"');p=run('renderSearch()');assert.doesNotMatch(p,/cat\/skeleton\/\?structure=/);assert.match(p,/dog\/skeleton\/\?structure=/);});
test('future species and articles require no new route template',()=>{run('SPECIES_REGISTRY.push({slug:"example",nameAr:"اختبار",latin:"Example",systems:[],summaryAr:"test"});ARTICLE_REGISTRY.push({slug:"example",titleAr:"اختبار",status:"published",paragraphsAr:["test"],references:["ref"]})');assert.match(run('renderSpeciesDetail(SPECIES_REGISTRY.at(-1))'),/اختبار/);assert.match(run('renderArticles("example")'),/test/);assert.match(run('renderArticles("missing")'),/الصفحة غير موجودة/);});
test('dog studio names and brand are correct',()=>{const p=read('site/dog/skeleton/index.html');assert.match(p,/<title>الجهاز الهيكلي للكلب/);assert.doesNotMatch(p,/Atlas of Feline Anatomy for Veterinarians/);assert.match(p,/assets\/atlas-mark.svg/);});
