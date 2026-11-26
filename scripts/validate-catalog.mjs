import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export function validate(records){
 if(!Array.isArray(records))return ['catalog must be an array'];
 const errors=[],ids=new Set();
 for(const [i,r] of records.entries()){
  if(!r||typeof r!=='object'){errors.push('invalid record '+i);continue;}
  for(const k of ['id','species','titleAr','titleEn','specimen','region','geometry','review','license','attribution','sourceUrl','sha256','modelPath'])if(typeof r[k]!=='string'||!r[k].trim())errors.push(i+': missing '+k);
  if(ids.has(r.id))errors.push('duplicate '+r.id);ids.add(r.id);
  if(r.species!=='dog')errors.push(i+': species');
  if(!['draft','expert-reviewed'].includes(r.review))errors.push(i+': review');
  if(!/^[a-f0-9]{64}$/i.test(r.sha256??''))errors.push(i+': sha256');
  if(!/^https:\/\//.test(r.sourceUrl??''))errors.push(i+': sourceUrl');
  if(!/^models\/[a-zA-Z0-9_./-]+\.glb$/.test(r.modelPath??'')||r.modelPath?.includes('..'))errors.push(i+': modelPath');
  if(!['CC0-1.0','CC-BY-4.0','CC-BY-SA-4.0','CC-BY-NC-4.0','CC-BY-NC-SA-4.0'].includes(r.license))errors.push(i+': license requires audit');
  if(r.review==='expert-reviewed'&&['procedural','composite','path-1d'].includes(r.geometry))errors.push(i+': restricted geometry');
 }return errors;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const errors=validate(JSON.parse(readFileSync(new URL('../data/catalog.json',import.meta.url),'utf8')));if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log('Catalog structural validation passed; not a scientific or legal certification.');}
