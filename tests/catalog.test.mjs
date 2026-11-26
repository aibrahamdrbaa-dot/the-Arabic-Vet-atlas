import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, inspectGLB, LIMITS } from '../scripts/validate-catalog.mjs';

const empty = () => ({ schemaVersion: 1, specimens: [], structures: [], assets: [] });

function buildSyntheticGLB(doc, binBytes = null) {
  const jsonRaw = Buffer.from(JSON.stringify(doc), 'utf8');
  const jsonPad = (4 - (jsonRaw.length % 4)) % 4;
  const jsonChunk = Buffer.concat([jsonRaw, Buffer.alloc(jsonPad, 0x20)]);
  let binChunk = Buffer.alloc(0);
  if (binBytes) {
    const binPad = (4 - (binBytes.length % 4)) % 4;
    const padded = Buffer.concat([binBytes, Buffer.alloc(binPad, 0x00)]);
    const binHeader = Buffer.alloc(8);
    binHeader.writeUInt32LE(padded.length, 0);
    binHeader.writeUInt32LE(0x004e4942, 4);
    binChunk = Buffer.concat([binHeader, padded]);
  }
  const totalLen = 12 + 8 + jsonChunk.length + binChunk.length;
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLen, 8);
  header.writeUInt32LE(jsonChunk.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([header, jsonChunk, binChunk]);
}

const minimalValidDoc = (overrides = {}) => ({
  asset: { version: '2.0' },
  nodes: [{ name: 'test_triangle_node', mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  accessors: [{ count: 3 }],
  ...overrides,
});

test('empty foundation valid', () => assert.deepEqual(validate(empty()), []));

test('invalid root and duplicate IDs rejected', () => {
  assert.ok(validate([]).length);
  assert.ok(validate({ ...empty(), specimens: [{ id: 'x' }, { id: 'x' }] }).some((e) => e.includes('duplicate')));
});

test('cannot approve through status alone', () => {
  assert.ok(
    validate({
      ...empty(),
      assets: [{ id: 'x', review: { status: 'expert-reviewed' }, rightsReview: { status: 'expert-reviewed' }, geometry: 'procedural' }],
    }).some((e) => e.includes('review'))
  );
});

test('reject impossible calendar dates like 2026-02-31', () => {
  const errs = validate({
    ...empty(),
    structures: [
      {
        id: 'dog.femur',
        species: 'canis_lupus_familiaris',
        system: 'skeletal',
        region: 'pelvic_limb',
        laterality: 'left',
        names: { ar: 'عظم الفخذ', en: 'Femur', la: 'Os femoris' },
        references: ['https://wava-amav.org/wava-documents.html'],
        review: {
          status: 'expert-reviewed',
          reviewer: 'Dr. Ahmad',
          role: 'veterinary-anatomist',
          reviewedAt: '2026-02-31',
          evidence: ['https://example.org/review/1'],
        },
      },
    ],
  });
  assert.ok(errs.some((e) => e.includes('review')));
});

test('reject AI self-approval reviewer name', () => {
  const errs = validate({
    ...empty(),
    structures: [
      {
        id: 'dog.femur',
        species: 'canis_lupus_familiaris',
        system: 'skeletal',
        region: 'pelvic_limb',
        laterality: 'left',
        names: { ar: 'عظم الفخذ', en: 'Femur', la: 'Os femoris' },
        references: ['https://wava-amav.org/wava-documents.html'],
        review: {
          status: 'expert-reviewed',
          reviewer: 'Gemini Neon',
          role: 'veterinary-anatomist',
          reviewedAt: '2026-11-26',
          evidence: ['https://example.org/review/1'],
        },
      },
    ],
  });
  assert.ok(errs.some((e) => e.includes('review')));
});

test('reject unsupported license and path traversal', () => {
  assert.ok(
    validate({
      ...empty(),
      assets: [{ id: 'x', source: { license: 'CC-BY-ND-4.0' }, model: { path: 'models/../bad.glb' } }],
    }).length >= 2
  );
});

test('reject verified claim without evidence and invalid Uberon ID', () => {
  const errs = validate({
    ...empty(),
    structures: [
      {
        id: 'dog.biceps',
        species: 'canis_lupus_familiaris',
        system: 'muscular',
        region: 'thoracic_limb',
        laterality: 'left',
        names: { ar: 'ذات الرأسين', en: 'Biceps brachii', la: 'M. biceps brachii' },
        ontology: { uberonId: 'INVALID_ID' },
        claims: [{ type: 'origin', status: 'verified', ar: 'الحديبة فوق الحقية', evidence: [] }],
        references: ['https://wava-amav.org/wava-documents.html'],
        review: { status: 'draft' },
      },
    ],
  });
  assert.ok(errs.some((e) => e.includes('uberonId')));
  assert.ok(errs.some((e) => e.includes('claim')));
});

test('dangling relationship rejected', () => {
  assert.ok(
    validate({ ...empty(), structures: [{ id: 'x', relations: [{ type: 'innervates', targetId: 'missing' }] }] }).some((e) =>
      e.includes('relation')
    )
  );
});

test('valid synthetic non-anatomical GLB passes inspectGLB', () => {
  const glb = buildSyntheticGLB(minimalValidDoc(), Buffer.alloc(36));
  assert.deepEqual(inspectGLB(glb), ['test_triangle_node']);
});

test('invalid GLB header and truncated BIN chunk rejected', () => {
  assert.throws(() => inspectGLB(Buffer.alloc(20)));
  const valid = buildSyntheticGLB(minimalValidDoc(), Buffer.alloc(16));
  const truncated = valid.subarray(0, valid.length - 4);
  truncated.writeUInt32LE(truncated.length, 8);
  assert.throws(() => inspectGLB(truncated), /BIN/);
});

test('unsafe SVG data URI and external URI rejected in GLB', () => {
  const svgGlb = buildSyntheticGLB(minimalValidDoc({ images: [{ uri: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }] }));
  assert.throws(() => inspectGLB(svgGlb), /unsafe/);
  const extGlb = buildSyntheticGLB(minimalValidDoc({ buffers: [{ uri: 'https://evil.example/a.bin' }] }));
  assert.throws(() => inspectGLB(extGlb), /unsafe/);
});

test('Three.js-unsafe node name with dot or space rejected', () => {
  const badNameGlb = buildSyntheticGLB(minimalValidDoc({ nodes: [{ name: 'Femur.001', mesh: 0 }] }));
  assert.throws(() => inspectGLB(badNameGlb), /unsafe Three\.js node name/);
});

test('unsupported compression extension in extensionsUsed rejected', () => {
  const meshoptGlb = buildSyntheticGLB(minimalValidDoc({ extensionsUsed: ['EXT_meshopt_compression'] }));
  assert.throws(() => inspectGLB(meshoptGlb), /decoder/);
});

test('vertex complexity budget enforced in inspectGLB', () => {
  const hugeGlb = buildSyntheticGLB(minimalValidDoc({ accessors: [{ count: LIMITS.maxVertices + 1 }] }));
  assert.throws(() => inspectGLB(hugeGlb), /complexity/);
});
