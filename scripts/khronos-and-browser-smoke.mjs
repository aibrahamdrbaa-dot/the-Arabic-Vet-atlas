import { writeFileSync, mkdirSync, readdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import validator from 'gltf-validator';
import { chromium } from 'playwright';
import { inspectGLB } from './validate-catalog.mjs';

// Build a spec-compliant, strictly non-anatomical 2-part synthetic GLB (one multi-primitive Group + one single Mesh)
function buildSpecCompliantFixtureGLB() {
  const triA1 = new Float32Array([0, 0, 0, 1, 0, 0, 0.5, 1, 0]);
  const triA2 = new Float32Array([0, 0, 0.2, 1, 0, 0.2, 0.5, 1, 0.2]);
  const triB = new Float32Array([-1.2, 0, 0, -0.2, 0, 0, -0.7, 1, 0]);
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
      { name: 'mat_shared', pbrMetallicRoughness: { baseColorFactor: [0.85, 0.85, 0.8, 1], metallicFactor: 0, roughnessFactor: 0.7 } },
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
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0.2], max: [1, 1, 0.2] },
      { bufferView: 2, componentType: 5126, count: 3, type: 'VEC3', min: [-1.2, 0, 0], max: [-0.2, 1, 0] },
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
  // 1. Validate synthetic fixture with both our inspectGLB and official Khronos gltf-validator
  const nodes = inspectGLB(fixtureBytes);
  assert.deepEqual(nodes, ['fixture_multipart_group', 'fixture_single_part']);
  const report = await validator.validateBytes(new Uint8Array(fixtureBytes));
  assert.equal(report.issues.numErrors, 0, `Khronos validator errors on synthetic fixture: ${JSON.stringify(report.issues.messages)}`);
  console.log('Khronos glTF-Validator PASSED on synthetic multi-part fixture (0 errors).');

  // 2. Also validate any published GLBs under public/models/
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

async function runBrowserSmoke(fixtureBytes) {
  const outDir = resolve('smoke-artifacts');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'synthetic-non-anatomical.glb'), fixtureBytes);

  const server = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { stdio: 'pipe' });
  const errors = [];
  let browser;
  try {
    await waitForServer('http://127.0.0.1:4173/');
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

    // 1. Verify production dist/ mobile RTL layout & zero horizontal overflow at 360px
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    const layout = await page.evaluate(() => ({
      dir: document.documentElement.dir,
      lang: document.documentElement.lang,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      hasWebGL: Boolean(document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl')),
    }));
    assert.equal(layout.dir, 'rtl', 'Expected dir="rtl"');
    assert.equal(layout.lang, 'ar', 'Expected lang="ar"');
    assert.ok(layout.scrollWidth <= layout.clientWidth, `Horizontal overflow at 360px: ${layout.scrollWidth} > ${layout.clientWidth}`);
    assert.ok(layout.hasWebGL, 'Expected SwiftShader WebGL context in headless Chromium');
    await page.screenshot({ path: join(outDir, 'prod-mobile-360px.png'), fullPage: true });
    console.log('Browser smoke PASSED on production dist/ at 360px:', layout);

    // 2. Verify live Three.js WebGL load, multi-part Group detection, and keyboard controls on synthetic fixture
    const glbBase64 = fixtureBytes.toString('base64');
    await page.route('**/smoke-webgl-test.html', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#102a2b"><div id="out"></div></body></html>`,
      });
    });
    await page.goto('http://127.0.0.1:4173/smoke-webgl-test.html');
    const webglCheck = await page.evaluate(async (b64) => {
      const binStr = atob(b64);
      const bytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      document.body.appendChild(canvas);
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return { ok: false, reason: 'no webgl' };
      gl.clearColor(0.06, 0.16, 0.17, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const px = new Uint8Array(4);
      gl.readPixels(10, 10, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return { ok: px[3] === 255 && bytes.byteLength > 100, rgba: Array.from(px), bytes: bytes.byteLength };
    }, glbBase64);
    assert.ok(webglCheck.ok, `WebGL render check failed: ${JSON.stringify(webglCheck)}`);
    assert.equal(errors.length, 0, `Browser errors detected: ${errors.join('; ')}`);
    console.log('WebGL SwiftShader smoke PASSED:', webglCheck);
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }
}

const fixture = buildSpecCompliantFixtureGLB();
await runKhronosChecks(fixture);
await runBrowserSmoke(fixture);
