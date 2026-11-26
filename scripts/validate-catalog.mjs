import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
const nonempty=v=>typeof v==='string'&&v.trim().length>0;
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const id=v=>typeof v==='string'&&/^[a-z0-9][a-z0-9._-]*$/.test(v);
const https=v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v));
const licensed=['CC0-1.0','CC-BY-4.0','CC-BY-SA-4.0','CC-BY-NC-4.0','CC-BY-NC-SA-4.0'];
const geometry=['segmented-ct','segmented-mri','surface-scan','procedural','composite','path-1d'];
const genuine=geometry.slice(0,3);
const pathOK=v=>typeof v==='string'&&/^models\/[a-zA-Z0-9_/-]+\.glb$/.test(v)&&!v.includes('//');
const approved=r=>r?.status==='expert-reviewed';
function review(r){return obj(r)&&['draft','expert-reviewed','rejected'].includes(r.status)&&(!approved(r)||(nonempty(r.reviewer)&&date(r.reviewedAt)&&Array.isArray(r.evidence)&&r.evidence.length>0&&r.evidence.every(https)));}
export function validate(c,{publicDir}={}){
 const errors=[],bad=(where,msg)=>errors.push(where+': '+msg);
 if(!obj(c)||c.schemaVersion!==1||!['specimens','structures','assets'].every(k=>Array.isArray(c[k])))return ['catalog: invalid schemaVersion or collections'];
 const index=(records,label)=>{const m=new Map();for(const r of records){if(!obj(r)||!id(r.id)||m.has(r.id)){bad(label,'invalid or duplicate id');continue;}m.set(r.id,r);}return m;};
 const specimens=index(c.specimens,'specimen'),structures=index(c.structures,'structure'),assets=index(c.assets,'asset'),publishedPaths=new Set();
 for(const [k,s] of specimens){if(!['species','breed','age','provenance'].every(p=>nonempty(s[p])))bad(k,'incomplete specimen');}
 for(const [k,s] of structures){if(!['species','system','region'].every(p=>nonempty(s[p]))||!['left','right','midline','not-applicable'].includes(s.laterality)||!obj(s.names)||!['ar','en','la'].every(p=>nonempty(s.names[p]))||!Array.isArray(s.references)||!s.references.length||!s.references.every(https)||!review(s.review))bad(k,'incomplete structure or review');
 if(s.relations!==undefined){if(!Array.isArray(s.relations))bad(k,'invalid relations');else for(const r of s.relations){if(!obj(r)||!nonempty(r.type)||!structures.has(r.targetId)||structures.get(r.targetId)?.species!==s.species||!Array.isArray(r.references)||!r.references.length||!r.references.every(https))bad(k,'invalid relation');}}}
 for(const [k,a] of assets){const s=specimens.get(a.specimenId),m=a.model,src=a.source;
 if(!s||!nonempty(a.titleAr)||!nonempty(a.titleEn)||!geometry.includes(a.geometry)||!review(a.review)||!review(a.rightsReview))bad(k,'invalid asset or review');
 if(!obj(src)||!https(src.url)||!hash(src.sha256)||!nonempty(src.attribution)||!licensed.includes(src.license)||!https(src.licenseUrl))bad(k,'invalid source or license');
 if(!obj(m)||!pathOK(m.path)||!hash(m.sha256)||!Number.isSafeInteger(m.bytes)||m.bytes<=0||m.units!=='m'||!nonempty(m.transformation))bad(k,'invalid model manifest');
 const nodes=new Set();if(!Array.isArray(a.bindings)||!a.bindings.length)bad(k,'missing bindings');else for(const b of a.bindings){if(!obj(b)||!nonempty(b.node)||nodes.has(b.node)||!structures.has(b.structureId)||structures.get(b.structureId)?.species!==s?.species)bad(k,'invalid node binding');else nodes.add(b.node);}
 if(approved(a.review)&&approved(a.rightsReview)){
  if(!genuine.includes(a.geometry))bad(k,'restricted geometry cannot be released');
  if(!Array.isArray(a.bindings)||a.bindings.some(b=>!approved(structures.get(b?.structureId)?.review)))bad(k,'unreviewed linked structure');
  if(pathOK(m?.path)){if(publishedPaths.has(m.path))bad(k,'duplicate published file');publishedPaths.add(m.path);
   if(publicDir){try{const data=readFileSync(resolve(publicDir,m.path));if(data.length!==m.bytes||createHash('sha256').update(data).digest('hex')!==m.sha256)bad(k,'binary checksum or length mismatch');
    const names=inspectGLB(data);for(const node of nodes)if(names.filter(n=>n===node).length!==1)bad(k,'missing or ambiguous GLB node '+node);
   }catch(e){bad(k,'GLB check failed: '+e.message);}}
  }
 }}
 if(publicDir){const root=resolve(publicDir,'models');const walk=dir=>{for(const e of readdirSync(dir,{withFileTypes:true})){const p=resolve(dir,e.name);if(e.isSymbolicLink())bad('public','symlink not allowed');else if(e.isDirectory())walk(p);else if(e.name!=='README.md'&&!publishedPaths.has(relative(publicDir,p).replaceAll('\\','/')))bad('public','unapproved or orphan file '+relative(publicDir,p));}};if(existsSync(root))walk(root);}
 return errors;
}
export function inspectGLB(b){
 if(b.length<20||b.readUInt32LE(0)!==0x46546c67||b.readUInt32LE(4)!==2||b.readUInt32LE(8)!==b.length||b.readUInt32LE(16)!==0x4e4f534a)throw Error('invalid GLB header');
 const len=b.readUInt32LE(12);if(len%4||20+len>b.length)throw Error('invalid JSON chunk');
 const doc=JSON.parse(b.subarray(20,20+len).toString('utf8'));
 if(doc.asset?.version!=='2.0'||!Array.isArray(doc.nodes)||!Array.isArray(doc.meshes)||!doc.meshes.length)throw Error('invalid model document');
 if([...(doc.buffers??[]),...(doc.images??[])].some(x=>typeof x.uri==='string'&&!x.uri.startsWith('data:')))throw Error('external resource');
 if((doc.extensionsRequired??[]).some(x=>['KHR_draco_mesh_compression','EXT_meshopt_compression','KHR_texture_basisu'].includes(x)))throw Error('decoder not yet enabled');
 return doc.nodes.filter(n=>Number.isInteger(n.mesh)).map(n=>n.name).filter(nonempty);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const errors=validate(JSON.parse(readFileSync(new URL('../data/catalog.json',import.meta.url),'utf8')),{publicDir:resolve('public')});if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log('Catalog release gate passed; not scientific or legal certification.');}
