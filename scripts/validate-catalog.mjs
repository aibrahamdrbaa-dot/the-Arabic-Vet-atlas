import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

export const LIMITS = Object.freeze({
  maxGlbBytes: 15 * 1024 * 1024, // 15 MiB mobile & static-host budget
  maxMeshes: 500,
  maxPrimitives: 2000,
  maxNodes: 2000,
  maxImages: 32,
  maxVertices: 1_500_000,
});

const SAFE_DATA_URI_RE = /^data:(application\/octet-stream|image\/(png|jpeg|webp));base64,[A-Za-z0-9+/=]+$/;
const SAFE_NODE_NAME_RE = /^[A-Za-z0-9_-]{1,128}$/;
const UBERON_RE = /^UBERON:\d{7}$/;
const AI_REVIEWER_RE = /^(ai|gpt|chatgpt|openai|gemini|claude|anthropic|roy|neon|copilot|codex|bot)(\b|[-_/])/i;

const nonempty = (v) => typeof v === 'string' && v.trim().length > 0;
const hash = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const id = (v) => typeof v === 'string' && /^[a-z0-9][a-z0-9._-]*$/.test(v);
const https = (v) => {
  if (typeof v !== 'string') return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password;
  } catch {
    return false;
  }
};
const obj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const strictDate = (v) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

const licensed = ['CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'CC-BY-NC-4.0', 'CC-BY-NC-SA-4.0'];
const geometry = ['segmented-ct', 'segmented-mri', 'surface-scan', 'procedural', 'composite', 'path-1d'];
const genuine = geometry.slice(0, 3);
const claimTypes = ['description', 'origin', 'insertion', 'innervation', 'blood-supply', 'function', 'clinical-note'];
const claimStatuses = ['verified', 'unknown', 'not-applicable'];
const scientificRoles = ['veterinary-anatomist', 'peer-reviewer'];
const rightsRoles = ['rights-auditor', 'project-maintainer'];
const pathOK = (v) => typeof v === 'string' && /^models\/[a-zA-Z0-9_/-]+\.glb$/.test(v) && !v.includes('//') && !v.includes('..');
const approved = (r) => r?.status === 'expert-reviewed';

function validReview(r, allowedRoles) {
  if (!obj(r) || !['draft', 'expert-reviewed', 'rejected'].includes(r.status)) return false;
  if (!approved(r)) return true;
  if (!nonempty(r.reviewer) || AI_REVIEWER_RE.test(r.reviewer.trim())) return false;
  if (!strictDate(r.reviewedAt)) return false;
  if (!Array.isArray(r.evidence) || r.evidence.length === 0 || !r.evidence.every(https)) return false;
  if (r.role !== undefined && !allowedRoles.includes(r.role)) return false;
  return true;
}

export function validate(c, { publicDir } = {}) {
  const errors = [];
  const bad = (where, msg) => errors.push(`${where}: ${msg}`);

  if (!obj(c) || c.schemaVersion !== 1 || !['specimens', 'structures', 'assets'].every((k) => Array.isArray(c[k]))) {
    return ['catalog: invalid schemaVersion or collections'];
  }

  const index = (records, label) => {
    const m = new Map();
    for (const r of records) {
      if (!obj(r) || !id(r.id) || m.has(r.id)) {
        bad(label, 'invalid or duplicate id');
        continue;
      }
      m.set(r.id, r);
    }
    return m;
  };

  const specimens = index(c.specimens, 'specimen');
  const structures = index(c.structures, 'structure');
  const assets = index(c.assets, 'asset');
  const publishedPaths = new Set();

  for (const [k, s] of specimens) {
    if (!['species', 'breed', 'age', 'provenance'].every((p) => nonempty(s[p]))) {
      bad(k, 'incomplete specimen');
    }
  }

  for (const [k, s] of structures) {
    if (
      !['species', 'system', 'region'].every((p) => nonempty(s[p])) ||
      !['left', 'right', 'midline', 'not-applicable'].includes(s.laterality) ||
      !obj(s.names) ||
      !['ar', 'en', 'la'].every((p) => nonempty(s.names[p])) ||
      !Array.isArray(s.references) ||
      !s.references.length ||
      !s.references.every(https) ||
      !validReview(s.review, scientificRoles)
    ) {
      bad(k, 'incomplete structure or review');
    }

    if (s.ontology !== undefined) {
      if (!obj(s.ontology)) {
        bad(k, 'invalid ontology');
      } else {
        if (s.ontology.uberonId !== undefined && !UBERON_RE.test(s.ontology.uberonId)) {
          bad(k, 'invalid uberonId format');
        }
        if (s.ontology.navEdition !== undefined && !nonempty(s.ontology.navEdition)) {
          bad(k, 'invalid navEdition');
        }
      }
    }

    if (s.claims !== undefined) {
      if (!Array.isArray(s.claims)) {
        bad(k, 'invalid claims');
      } else {
        for (const cl of s.claims) {
          if (
            !obj(cl) ||
            !claimTypes.includes(cl.type) ||
            !claimStatuses.includes(cl.status) ||
            (cl.status === 'verified' && (!nonempty(cl.ar) || !Array.isArray(cl.evidence) || !cl.evidence.length || !cl.evidence.every(https)))
          ) {
            bad(k, 'invalid claim or missing claim evidence');
          }
        }
      }
    }

    if (s.relations !== undefined) {
      if (!Array.isArray(s.relations)) {
        bad(k, 'invalid relations');
      } else {
        for (const r of s.relations) {
          if (
            !obj(r) ||
            !nonempty(r.type) ||
            !structures.has(r.targetId) ||
            structures.get(r.targetId)?.species !== s.species ||
            !Array.isArray(r.references) ||
            !r.references.length ||
            !r.references.every(https)
          ) {
            bad(k, 'invalid relation');
          }
        }
      }
    }
  }

  for (const [k, a] of assets) {
    const s = specimens.get(a.specimenId);
    const m = a.model;
    const src = a.source;

    if (
      !s ||
      !nonempty(a.titleAr) ||
      !nonempty(a.titleEn) ||
      !geometry.includes(a.geometry) ||
      !validReview(a.review, scientificRoles) ||
      !validReview(a.rightsReview, rightsRoles)
    ) {
      bad(k, 'invalid asset or review');
    }

    if (
      !obj(src) ||
      !https(src.url) ||
      !hash(src.sha256) ||
      !nonempty(src.attribution) ||
      !licensed.includes(src.license) ||
      !https(src.licenseUrl)
    ) {
      bad(k, 'invalid source or license');
    } else if (src.license.includes('-NC-') && src.nonCommercial === false) {
      bad(k, 'NC license cannot set nonCommercial=false');
    }

    if (
      !obj(m) ||
      !pathOK(m.path) ||
      !hash(m.sha256) ||
      !Number.isSafeInteger(m.bytes) ||
      m.bytes <= 0 ||
      m.bytes > LIMITS.maxGlbBytes ||
      m.units !== 'm' ||
      !nonempty(m.transformation)
    ) {
      bad(k, 'invalid model manifest or exceeds size budget');
    }

    const nodes = new Set();
    if (!Array.isArray(a.bindings) || !a.bindings.length) {
      bad(k, 'missing bindings');
    } else {
      for (const b of a.bindings) {
        if (
          !obj(b) ||
          !SAFE_NODE_NAME_RE.test(b.node ?? '') ||
          nodes.has(b.node) ||
          !structures.has(b.structureId) ||
          structures.get(b.structureId)?.species !== s?.species
        ) {
          bad(k, 'invalid or unsafe node binding');
        } else {
          nodes.add(b.node);
        }
      }
    }

    if (approved(a.review) && approved(a.rightsReview)) {
      if (!genuine.includes(a.geometry)) bad(k, 'restricted geometry cannot be released');
      if (!Array.isArray(a.bindings) || a.bindings.some((b) => !approved(structures.get(b?.structureId)?.review))) {
        bad(k, 'unreviewed linked structure');
      }
      if (pathOK(m?.path)) {
        if (publishedPaths.has(m.path)) bad(k, 'duplicate published file');
        publishedPaths.add(m.path);
        if (publicDir) {
          try {
            const data = readFileSync(resolve(publicDir, m.path));
            if (data.length !== m.bytes || createHash('sha256').update(data).digest('hex') !== m.sha256) {
              bad(k, 'binary checksum or length mismatch');
            }
            const names = inspectGLB(data);
            for (const node of nodes) {
              if (names.filter((n) => n === node).length !== 1) {
                bad(k, `missing or ambiguous GLB node ${node}`);
              }
            }
          } catch (e) {
            bad(k, `GLB check failed: ${e.message}`);
          }
        }
      }
    }
  }

  if (publicDir) {
    const root = resolve(publicDir, 'models');
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = resolve(dir, e.name);
        if (e.isSymbolicLink()) bad('public', 'symlink not allowed');
        else if (e.isDirectory()) walk(p);
        else if (e.name !== 'README.md' && !publishedPaths.has(relative(publicDir, p).replaceAll('\\', '/'))) {
          bad('public', `unapproved or orphan file ${relative(publicDir, p)}`);
        }
      }
    };
    if (existsSync(root)) walk(root);
  }

  return errors;
}

export function inspectGLB(b) {
  if (!Buffer.isBuffer(b) || b.length < 20) throw Error('invalid GLB header');
  if (b.length > LIMITS.maxGlbBytes) throw Error('GLB exceeds mobile size budget');
  if (b.readUInt32LE(0) !== 0x46546c67 || b.readUInt32LE(4) !== 2 || b.readUInt32LE(8) !== b.length || b.readUInt32LE(16) !== 0x4e4f534a) {
    throw Error('invalid GLB header');
  }
  const jsonLen = b.readUInt32LE(12);
  if (jsonLen <= 0 || jsonLen % 4 !== 0 || 20 + jsonLen > b.length) throw Error('invalid JSON chunk');

  // Verify optional BIN chunk header & exact bounds
  const binOffset = 20 + jsonLen;
  if (binOffset < b.length) {
    if (binOffset + 8 > b.length) throw Error('truncated BIN chunk header');
    const binLen = b.readUInt32LE(binOffset);
    const binType = b.readUInt32LE(binOffset + 4);
    if (binType !== 0x004e4942 || binLen % 4 !== 0 || binOffset + 8 + binLen !== b.length) {
      throw Error('invalid or truncated BIN chunk');
    }
  }

  const doc = JSON.parse(b.subarray(20, 20 + jsonLen).toString('utf8'));
  if (doc.asset?.version !== '2.0' || !Array.isArray(doc.nodes) || !Array.isArray(doc.meshes) || !doc.meshes.length) {
    throw Error('invalid model document');
  }
  if (doc.nodes.length > LIMITS.maxNodes || doc.meshes.length > LIMITS.maxMeshes) {
    throw Error('GLB exceeds node or mesh complexity budget');
  }
  if ((doc.images ?? []).length > LIMITS.maxImages) {
    throw Error('GLB exceeds image budget');
  }

  let primitiveCount = 0;
  let totalVertices = 0;
  const accessors = Array.isArray(doc.accessors) ? doc.accessors : [];
  for (const mesh of doc.meshes) {
    const prims = Array.isArray(mesh?.primitives) ? mesh.primitives : [];
    primitiveCount += prims.length;
    for (const prim of prims) {
      const posIdx = prim?.attributes?.POSITION;
      if (Number.isInteger(posIdx) && accessors[posIdx]?.count) {
        totalVertices += accessors[posIdx].count;
      }
    }
  }
  if (primitiveCount > LIMITS.maxPrimitives || totalVertices > LIMITS.maxVertices) {
    throw Error('GLB exceeds primitive or vertex complexity budget');
  }

  for (const item of [...(doc.buffers ?? []), ...(doc.images ?? [])]) {
    if (typeof item?.uri === 'string') {
      if (!SAFE_DATA_URI_RE.test(item.uri)) {
        throw Error('external or unsafe resource URI');
      }
    }
  }

  const unsupportedExt = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu'];
  const declaredExts = [...(doc.extensionsRequired ?? []), ...(doc.extensionsUsed ?? [])];
  if (declaredExts.some((x) => unsupportedExt.includes(x))) {
    throw Error('decoder not yet enabled');
  }

  const names = [];
  for (const n of doc.nodes) {
    if (Number.isInteger(n.mesh)) {
      if (n.mesh < 0 || n.mesh >= doc.meshes.length) throw Error('node references out-of-range mesh');
      if (nonempty(n.name)) {
        if (!SAFE_NODE_NAME_RE.test(n.name)) throw Error(`unsafe Three.js node name: ${n.name}`);
        names.push(n.name);
      }
    }
  }
  return names;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = validate(JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8')), {
    publicDir: resolve('public'),
  });
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Catalog release gate passed; not scientific or legal certification.');
  }
}
