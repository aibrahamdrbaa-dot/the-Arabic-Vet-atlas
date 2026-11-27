import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const root=resolve('site'), out=resolve('smoke-artifacts');
const types={'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.svg':'image/svg+xml','.webp':'image/webp'};
const server=createServer(async(req,res)=>{
 try{
  let path=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  if(path.endsWith('/'))path+='index.html';
  const p=resolve(root,'.'+path);
  if(!p.startsWith(root+sep)){res.writeHead(403).end();return;}
  const bytes=await readFile(p);res.writeHead(200,{'Content-Type':types[extname(p)]||'application/octet-stream'}).end(bytes);
 }catch{if(!res.headersSent)res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
await mkdir(out,{recursive:true});
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader']});
 for(const [animal,width,height] of [['dog',1440,900],['cat',390,844]]){
  const ctx=await browser.newContext({viewport:{width,height},locale:'ar',hasTouch:width<500});
  await ctx.route('https://cdn.jsdelivr.net/npm/three@0.179.1/**',async route=>{
   const relative=new URL(route.request().url()).pathname.split('/three@0.179.1/')[1];
   const p=resolve('node_modules/three',relative);
   if(!p.startsWith(resolve('node_modules/three')+sep)){await route.abort();return;}
   await route.fulfill({path:p,contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'}});
  });
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/'+animal+'/skeleton/');
  await page.waitForFunction(()=>document.querySelectorAll('.bone-item').length===26 && document.querySelector('#stage-overlay').hidden,null,{timeout:30000});
  assert.equal(await page.locator('input[type=file]').count(),0);
  assert.equal(await page.locator('#stage canvas').count(),1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),'horizontal overflow '+animal);
  await page.screenshot({path:out+'/'+animal+'-desk-'+width+'.png',fullPage:true});
  await page.locator('#view-angle').selectOption('left');
  assert.equal(await page.locator('#view-angle').inputValue(),'left');
  await page.locator('#focus-mode').click();
  assert.ok(await page.locator('body').evaluate(el=>el.classList.contains('study-focus')));
  await page.keyboard.press('Escape');
  assert.ok(!(await page.locator('body').evaluate(el=>el.classList.contains('study-focus'))));
  await page.locator('.bone-item').first().click();
  assert.ok(await page.locator('#pane-info').isVisible());
  assert.ok(await page.locator('#fit-selection').isEnabled());
  await page.locator('#fit-selection').click();
  await page.locator('#next-bone').click();
  await page.locator('[data-pane=notes]').click();
  await page.locator('#note').fill('browser test note');
  await page.locator('#save').click();
  await page.waitForFunction(()=>document.getElementById('note-status').textContent.includes('محفوظة'));
  await page.locator('[data-pane=browse]').click();
  await page.locator('#notes-only').check();
  assert.equal(await page.locator('.bone-item').count(),1);
  await page.locator('#clear-search').click();
  assert.equal(await page.locator('.bone-item').count(),26);
  await page.reload();
  await page.waitForFunction(()=>document.querySelectorAll('.bone-item').length===26,null,{timeout:30000});
  await page.locator('#notes-only').check();
  assert.equal(await page.locator('.bone-item').count(),1);
  await page.locator('.bone-item').first().click();
  await page.locator('[data-pane=notes]').click();
  assert.equal(await page.locator('#note').inputValue(),'browser test note');
  assert.deepEqual(errors,[]);
  await ctx.close();
  console.log('Production studio passed:',animal,width,'px');
 }
}finally{await browser?.close();await new Promise(r=>server.close(r));}
