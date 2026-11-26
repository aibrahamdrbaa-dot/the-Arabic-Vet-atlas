import { writeFileSync, mkdirSync, readdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import validator from 'gltf-validator';
import { chromium } from 'playwright';
import { inspectGLB } from './validate-catalog.mjs';

function buildSpecCompliantFixtureGLB() {
  // Strictly non-anatomical 2-part geometric fixture:
  // 1) fixture_multipart_group (2 distinct triangle primitives -> THREE.Group with 2 Mesh children)
  // 2) fixture_single_part (1 triangle primitive -> single THREE.Mesh)
  const triA1 = new Float32Array([0.1, 0, 0, 1.1, 0, 0, 0.6, 1.0, 0]);
  const triA2 = new Float32Array([0.1, 0, 0.25, 1.1, 0, 0.25, 0.6, 1.0, 0.25]);
  const triB = new Float32Array([-1.1, 0, 0, -0.1, 0, 0, -0.6, 1.0, 0]);
  const bin = Buffer.concat([Buffer.from(triA1.buffer), Buffer.from(triA2.buffer), Buffer.from(triB.buffer)]);

  const doc = {
    asset: { version: '2.0', generator: 'arabic-vet-atlas-p0-smoke-fixture-non-anatomical' },
    scene: 0,
    scenes: [{ nodes: [0, 1] }],
    nodes: [
      { name: 'fixture_multipart_group', mesh: 0 },
      { name: 'fixture_single_part', mesh: 1 },
    ],
    materials: [
      { name: 'mat_shared', doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.88, 0.84, 0.72, 1], metallicFactor: 0, roughnessFactor: 0.6 } },
    ],
    meshes: [
      {
        name: 'mesh_multipart',
        primitives: [
          { attributes: { POSITION: 0 }, material: 0 },
          { attributes: { POSITION: 1 }, material: 0 },
        ],
      },
      {
        name: 'mesh_single',
        primitives: [{ attributes: { POSITION: 2 }, material: 0 }],
      },
    ],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 },
      { buffer: 0, byteOffset: 36, byteLength: 36, target: 34962 },
      { buffer: 0, byteOffset: 72, byteLength: 36, target: 34962 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0.1, 0, 0], max: [1.1, 1.0, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: 'VEC3', min: [0.1, 0, 0.25], max: [1.1, 1.0, 0.25] },
      { bufferView: 2, componentType: 5126, count: 3, type: 'VEC3', min: [-1.1, 0, 0], max: [-0.1, 1.0, 0] },
    ],
  };

  const jsonRaw = Buffer.from(JSON.stringify(doc), 'utf8');
  const jsonPad = (4 - (jsonRaw.length % 4)) % 4;
  const jsonChunk = Buffer.concat([jsonRaw, Buffer.alloc(jsonPad, 0x20)]);
  const binPad = (4 - (bin.length % 4)) % 4;
  const binPadded = Buffer.concat([bin, Buffer.alloc(binPad, 0x00)]);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binPadded.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);

  const totalLen = 20 + jsonChunk.length + 8 + binPadded.length;
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLen, 8);
  header.writeUInt32LE(jsonChunk.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([header, jsonChunk, binHeader, binPadded]);
}

async function runKhronosChecks(fixtureBytes) {
  const nodes = inspectGLB(fixtureBytes);
  assert.deepEqual(nodes, ['fixture_multipart_group', 'fixture_single_part']);
  const report = await validator.validateBytes(new Uint8Array(fixtureBytes));
  assert.equal(report.issues.numErrors, 0, `Khronos validator errors: ${JSON.stringify(report.issues.messages)}`);
  console.log('Khronos glTF-Validator PASSED on synthetic multi-part fixture (0 errors).');

  const modelsDir = resolve('public/models');
  if (existsSync(modelsDir)) {
    const walk = async (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) await walk(p);
        else if (e.name.endsWith('.glb')) {
          const r = await validator.validateBytes(new Uint8Array(readFileSync(p)));
          assert.equal(r.issues.numErrors, 0, `Khronos validator failed on ${p}: ${JSON.stringify(r.issues.messages)}`);
          console.log(`Khronos glTF-Validator PASSED on ${p}`);
        }
      }
    };
    await walk(modelsDir);
  }
}

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function runRealViewerE2E(fixtureBytes) {
  const outDir = resolve('smoke-artifacts');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'synthetic-non-anatomical.glb'), fixtureBytes);

  const previewSrv = spawn('./node_modules/.bin/vite', ['preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { stdio: 'ignore' });
  const devSrv = spawn('./node_modules/.bin/vite', ['--host', '127.0.0.1', '--port', '4174', '--strictPort'], { stdio: 'ignore' });
  const errors = [];
  let browser;
  try {
    await Promise.all([waitForServer('http://127.0.0.1:4173/'), waitForServer('http://127.0.0.1:4174/tests/smoke/index.html')]);
    browser = await chromium.launch({
      headless: true,
      args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'],
    });
    const context = await browser.newContext({ viewport: { width: 360, height: 780 }, locale: 'ar' });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
    });

    // 1. Verify production dist/ at 360px
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    const prodLayout = await page.evaluate(() => ({
      dir: document.documentElement.dir,
      lang: document.documentElement.lang,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    assert.equal(prodLayout.dir, 'rtl');
    assert.equal(prodLayout.lang, 'ar');
    assert.ok(prodLayout.scrollWidth <= prodLayout.clientWidth, `Prod horizontal overflow at 360px`);
    await page.screenshot({ path: join(outDir, 'prod-empty-360px.png'), fullPage: true });

    // 2. Intercept synthetic GLB routes for the REAL Viewer.tsx harness
    await page.route('**/smoke-fixture.glb', async (route) => {
      await route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: fixtureBytes });
    });
    await page.route('**/smoke-fixture-delayed.glb', async (route) => {
      await new Promise((r) => setTimeout(r, 400));
      await route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: fixtureBytes });
    });

    await page.goto('http://127.0.0.1:4174/tests/smoke/index.html', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('.canvas')?.getAttribute('data-loaded-path') === 'smoke-fixture.glb', { timeout: 15000 });
    await page.waitForTimeout(200);

    // Assert real Viewer.tsx loaded all 3 meshes (2 in Group + 1 single) and rendered non-empty pixels
    const loadedState = await page.evaluate(() => {
      const host = document.querySelector('.canvas');
      const canvas = host?.querySelector('canvas');
      const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
      let nonTransparent = 0;
      if (gl && canvas) {
        const px = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
        for (let i = 3; i < px.length; i += 4) if (px[i] > 0) nonTransparent++;
      }
      return {
        meshCount: host?.getAttribute('data-mesh-count'),
        visibleMeshes: host?.getAttribute('data-visible-meshes'),
        cameraPos: host?.getAttribute('data-camera-pos'),
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        nonTransparent,
      };
    });
    assert.equal(loadedState.meshCount, '3', `Expected 3 meshes (2 in Group + 1 single), got ${loadedState.meshCount}`);
    assert.equal(loadedState.visibleMeshes, '3');
    assert.ok(loadedState.nonTransparent > 100, `Expected visible 3D pixels on Viewer canvas, got ${loadedState.nonTransparent}`);
    assert.ok(loadedState.scrollWidth <= loadedState.clientWidth, 'Viewer harness horizontal overflow at 360px');
    await page.screenshot({ path: join(outDir, 'viewer-loaded-360px.png'), fullPage: true });

    // 3. Test multi-part Group highlight & isolation
    await page.click('#btn-multipart');
    await page.waitForFunction(() => document.querySelector('.canvas')?.getAttribute('data-highlighted-meshes') === '2');
    await page.click('#btn-isolate');
    await page.waitForFunction(() => document.querySelector('.canvas')?.getAttribute('data-visible-meshes') === '2');
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(outDir, 'viewer-isolated-360px.png'), fullPage: true });
    await page.click('#btn-isolate'); // restore all 3 visible
    await page.waitForFunction(() => document.querySelector('.canvas')?.getAttribute('data-visible-meshes') === '3');

    // 4. Test keyboard orbit, zoom, and reset on the actual Viewer canvas
    const camBefore = await page.getAttribute('.canvas', 'data-camera-pos');
    await page.focus('.canvas canvas');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);
    const camAfterOrbit = await page.getAttribute('.canvas', 'data-camera-pos');
    assert.notEqual(camAfterOrbit, camBefore, 'Expected ArrowRight keyboard orbit to move camera');
    await page.keyboard.press('+');
    await page.waitForTimeout(100);
    const camAfterZoom = await page.getAttribute('.canvas', 'data-camera-pos');
    assert.notEqual(camAfterZoom, camAfterOrbit, 'Expected + keyboard zoom to move camera');
    await page.keyboard.press('r');
    await page.waitForTimeout(100);
    const camAfterReset = await page.getAttribute('.canvas', 'data-camera-pos');
    assert.equal(camAfterReset, camBefore, 'Expected R keyboard reset to restore initial camera');

    // 5. Test WebGL context lost and restored inside Viewer.tsx
    await page.evaluate(() => {
      const c = document.querySelector('.canvas canvas');
      c?.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    });
    await page.waitForFunction(() => (document.querySelector('[role="status"]')?.textContent || '').includes('توقف عرض الرسوميات'));
    await page.evaluate(() => {
      const c = document.querySelector('.canvas canvas');
      c?.dispatchEvent(new Event('webglcontextrestored'));
    });
    await page.waitForFunction(() => !document.querySelector('[role="status"]'));

    // 6. Test changing selection WHILE GLB is still loading (anti-stale-closure check)
    await page.click('#btn-delayed');
    await page.click('#btn-single'); // clicked while 400ms delayed fetch is in flight!
    await page.waitForFunction(() => document.querySelector('.canvas')?.getAttribute('data-loaded-path') === 'smoke-fixture-delayed.glb', { timeout: 15000 });
    await page.waitForFunction(() => document.querySelector('.canvas')?.getAttribute('data-highlighted-node') === 'fixture_single_part');
    const delayedHi = await page.getAttribute('.canvas', 'data-highlighted-meshes');
    assert.equal(delayedHi, '1', `Expected delayed load to apply latest selection (1 mesh), got ${delayedHi}`);

    assert.equal(errors.length, 0, `Browser errors detected: ${errors.join('; ')}`);
    console.log('ALL REAL Viewer.tsx E2E CHECKS PASSED:', { loadedState, camBefore, camAfterOrbit, camAfterZoom, delayedHi });
  } finally {
    if (browser) await browser.close();
    previewSrv.kill('SIGKILL');
    devSrv.kill('SIGKILL');
  }
}

const fixture = buildSpecCompliantFixtureGLB();
await runKhronosChecks(fixture);
await runRealViewerE2E(fixture);
process.exit(0);
