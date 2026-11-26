const get = id => document.getElementById(id);
const STORAGE_KEY = 'arabic-vet-atlas:cat-skeleton:v2';
const LEGACY_KEY = 'arabic-vet-atlas:cat-skeleton:v1';

const parts = new Map();       // partId -> { mesh, label, structure, materials, layerId, region }
const layers = new Map();      // layerId -> { root, toggle, ids, name }
const regionToggles = new Map(); // regionId -> checkbox
const meshIds = new WeakMap(); // THREE.Mesh -> partId

const stage = get('stage');
const statusEl = get('status');
let viewer;
let catalog;
let specimenId = 'felis-catus-tavernier-2022';
let isolated = false;

function loadStudyState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (raw && typeof raw === 'object' && raw.specimens) return raw;
    // Migrate v1 if present
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? 'null');
    if (legacy && typeof legacy === 'object') {
      return {
        schemaVersion: 2,
        specimens: {
          [specimenId]: {
            notes: legacy.notes ?? {},
            colors: legacy.colors ?? {},
          },
        },
      };
    }
  } catch {
    statusEl.textContent = 'تعذّرت قراءة الملاحظات المحفوظة.';
  }
  return { schemaVersion: 2, specimens: {} };
}

let study = loadStudyState();

function specimenBucket(specId = specimenId) {
  if (!study.specimens[specId]) {
    study.specimens[specId] = { notes: {}, colors: {} };
  }
  return study.specimens[specId];
}

function persist(message) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(study));
    statusEl.textContent = message;
  } catch {
    statusEl.textContent = 'تعذّر الحفظ في هذا المتصفح.';
  }
}

function selectedId() {
  return get('part').value || 'specimen:overview';
}

function getSelectedBucket() {
  const id = selectedId();
  const part = parts.get(id);
  const spec = part?.specimenId ?? specimenId;
  return specimenBucket(spec);
}

function updateBoneCard(id) {
  const part = parts.get(id);
  const s = part?.structure;
  if (!s) {
    get('card-title').textContent = 'بطاقة العظم';
    get('card-ar').textContent = part ? part.label : 'اختر عظمًا بالنقر على المجسم أو من القائمة';
    get('card-en').textContent = '—';
    get('card-la').textContent = '—';
    get('card-id').textContent = part ? id : specimenId;
    get('card-region').textContent = '—';
    get('card-source').textContent = part ? 'ملف محلي تجريبي' : (catalog?.specimen?.source?.author ?? '—');
    get('card-review').textContent = part ? 'ملف محلي غير مراجع' : (catalog?.specimen?.reviewStatusAr ?? '—');
    get('card-coverage').textContent = '—';
    return;
  }
  get('card-title').textContent = s.names.ar;
  get('card-ar').textContent = s.names.ar;
  get('card-en').textContent = s.names.en;
  get('card-la').textContent = `${s.names.la} (${s.navEdition})`;
  get('card-id').textContent = s.id;
  get('card-region').textContent = `${s.regionAr} · ${s.lateralityAr}`;
  get('card-source').textContent = s.sourceLabel;
  get('card-review').textContent = s.reviewStatusAr;
  get('card-coverage').textContent = s.coverageNoteAr;
}

function updateBoneListSelection(id) {
  for (const btn of get('bone-list').querySelectorAll('.bone-item')) {
    const active = btn.dataset.id === id;
    btn.setAttribute('aria-current', active ? 'true' : 'false');
    if (active) btn.scrollIntoView({ block: 'nearest' });
  }
}

function applyMaterialState(id) {
  const part = parts.get(id);
  if (!part) return;
  const bucket = specimenBucket(part.specimenId ?? specimenId);
  const customColor = bucket.colors[id];
  const isSelected = id === selectedId();
  for (const { material, original } of part.materials) {
    if (customColor) {
      material.color.set(customColor);
    } else if (isSelected) {
      material.color.copy(original).lerp(new viewer.THREE.Color('#4f86f7'), 0.35);
    } else {
      material.color.copy(original);
    }
    if (material.emissive) {
      material.emissive.set(isSelected ? '#1a3a7a' : '#000000');
      material.emissiveIntensity = isSelected ? 0.28 : 0.0;
    }
  }
}

function refreshAllMaterials() {
  if (!viewer) return;
  for (const id of parts.keys()) applyMaterialState(id);
  viewer.render();
}

function ensureSelectedVisible() {
  if (!isolated) return;
  const id = selectedId();
  const part = parts.get(id);
  if (!part) return;
  const layer = layers.get(part.layerId);
  if (layer) layer.toggle.checked = true;
  if (part.region && regionToggles.has(part.region)) {
    regionToggles.get(part.region).checked = true;
  }
}

function refreshVisibility() {
  const id = selectedId();
  for (const layer of layers.values()) {
    layer.root.visible = layer.toggle.checked && (!isolated || layer.ids.has(id));
  }
  for (const [partId, part] of parts) {
    const regionVisible = !part.region || !regionToggles.has(part.region) || regionToggles.get(part.region).checked;
    const visible = isolated ? partId === id : regionVisible;
    part.mesh.visible = visible;
    part.mesh.layers.set(visible ? 0 : 1);
  }
  get('isolate').setAttribute('aria-pressed', String(isolated));
  get('isolate').textContent = isolated ? 'إنهاء العزل' : 'عزل العظم المحدد';
  viewer?.render();
}

function showSelection() {
  const id = selectedId();
  const select = get('part');
  select.dataset.previous = select.value;
  const bucket = getSelectedBucket();
  get('note').value = bucket.notes[id] ?? '';
  const hasPart = parts.has(id);
  get('color').disabled = !hasPart;
  get('clear-color').disabled = !hasPart;
  get('color').value = bucket.colors[id] ?? '#3b74d9';
  get('isolate').disabled = !hasPart;
  if (!hasPart) isolated = false;
  updateBoneCard(id);
  updateBoneListSelection(id);
  ensureSelectedVisible();
  refreshVisibility();
  refreshAllMaterials();
}

function selectPart(id) {
  const select = get('part');
  if (select.value === id) return;
  const currentBucket = getSelectedBucket();
  const savedNote = currentBucket.notes[selectedId()] ?? '';
  if (get('note').value !== savedNote) {
    if (!confirm('الملاحظة الحالية غير محفوظة. هل تريد الانتقال إلى عظم آخر؟')) return;
  }
  select.value = id;
  showSelection();
}

function renderBoneList() {
  const listEl = get('bone-list');
  const query = get('bone-search').value.trim().toLowerCase();
  const region = get('region-filter').value;
  listEl.replaceChildren();
  let shown = 0;
  for (const [id, part] of parts) {
    const s = part.structure;
    if (region !== 'all' && part.region !== region) continue;
    const hay = s
      ? `${s.names.ar} ${s.names.en} ${s.names.la} ${s.id} ${s.regionAr} ${s.lateralityAr}`.toLowerCase()
      : `${part.label} ${id}`.toLowerCase();
    if (query && !hay.includes(query)) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bone-item';
    btn.dataset.id = id;
    btn.setAttribute('role', 'option');
    btn.setAttribute('aria-current', id === selectedId() ? 'true' : 'false');
    const title = document.createElement('strong');
    title.textContent = s ? s.names.ar : part.label;
    const sub = document.createElement('span');
    sub.className = 'sub';
    const leftSpan = document.createElement('span');
    leftSpan.textContent = s ? `${s.regionAr} · ${s.lateralityAr}` : 'طبقة محلية';
    const rightSpan = document.createElement('span');
    rightSpan.className = 'latin';
    rightSpan.textContent = s ? s.names.la : '';
    sub.append(leftSpan, rightSpan);
    btn.append(title, sub);
    btn.addEventListener('click', () => selectPart(id));
    listEl.append(btn);
    shown++;
  }
  if (!shown) {
    const p = document.createElement('p');
    p.style.cssText = 'margin:8px;font-size:0.88rem;color:#4b5a70;text-align:center';
    p.textContent = 'لا توجد عظام مطابقة للبحث.';
    listEl.append(p);
  }
}

get('part').addEventListener('change', () => {
  const select = get('part');
  const next = select.value;
  select.value = select.dataset.previous ?? '';
  selectPart(next);
  select.dataset.previous = select.value;
});
get('bone-search').addEventListener('input', renderBoneList);
get('region-filter').addEventListener('change', renderBoneList);

get('isolate').addEventListener('click', () => {
  isolated = !isolated;
  ensureSelectedVisible();
  refreshVisibility();
});

get('show-all').addEventListener('click', () => {
  isolated = false;
  for (const layer of layers.values()) layer.toggle.checked = true;
  for (const cb of regionToggles.values()) cb.checked = true;
  refreshVisibility();
});

get('save').addEventListener('click', () => {
  const id = selectedId();
  const bucket = getSelectedBucket();
  bucket.notes[id] = get('note').value;
  persist(`حُفظت الملاحظة للعظم (${id}).`);
});

get('color').addEventListener('change', event => {
  const id = selectedId();
  if (!parts.has(id)) return;
  const bucket = getSelectedBucket();
  bucket.colors[id] = event.target.value;
  refreshAllMaterials();
  persist('حُفظ لون العظم.');
});

get('clear-color').addEventListener('click', () => {
  const id = selectedId();
  if (!parts.has(id)) return;
  const bucket = getSelectedBucket();
  delete bucket.colors[id];
  showSelection();
  persist('استُعيد اللون الأصلي للعظم.');
});

get('reset').addEventListener('click', () => {
  isolated = false;
  for (const layer of layers.values()) layer.toggle.checked = true;
  for (const cb of regionToggles.values()) cb.checked = true;
  refreshVisibility();
  viewer?.fit();
});

get('export').addEventListener('click', () => {
  const structuresMeta = Object.fromEntries(
    [...parts].map(([id, part]) => [
      id,
      part.structure
        ? {
            ar: part.structure.names.ar,
            en: part.structure.names.en,
            la: part.structure.names.la,
            region: part.structure.region,
            laterality: part.structure.laterality,
          }
        : { label: part.label },
    ])
  );
  const payload = {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    specimenId,
    assetId: catalog?.specimen?.assetId ?? null,
    specimens: study.specimens,
    structures: structuresMeta,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `arabic-vet-atlas-${specimenId}-study.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  statusEl.textContent = 'تم تصدير ملف الملاحظات والألوان (JSON).';
});

async function createViewer() {
  const [THREE, { OrbitControls }, { GLTFLoader }] = await Promise.all([
    import('three'),
    import('three/addons/controls/OrbitControls.js'),
    import('three/addons/loaders/GLTFLoader.js'),
  ]);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch {
    throw new Error('WebGL غير مدعوم أو معطّل في هذا المتصفح.');
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#edf1f7');

  const camera = new THREE.PerspectiveCamera(38, 1, 0.005, 50);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
  keyLight.position.set(1.8, 2.6, 2.0);
  const fillLight = new THREE.DirectionalLight(0xdce8ff, 1.1);
  fillLight.position.set(-2.0, 1.2, -1.6);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x52627c, 1.35);
  scene.add(keyLight, fillLight, hemi);

  const group = new THREE.Group();
  scene.add(group);

  let rafId = 0;
  const render = () => {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      renderer.render(scene, camera);
    });
  };

  const resize = () => {
    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    render();
  };
  new ResizeObserver(resize).observe(stage);
  controls.addEventListener('change', render);

  const canvas = renderer.domElement;
  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    statusEl.textContent = 'فُقد سياق WebGL مؤقتًا. جارٍ محاولة الاستعادة…';
  });
  canvas.addEventListener('webglcontextrestored', () => {
    statusEl.textContent = 'تمت استعادة سياق WebGL.';
    render();
  });

  // Keyboard navigation on stage
  stage.addEventListener('keydown', e => {
    const step = 0.14;
    const offset = camera.position.clone().sub(controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    if (e.key === 'ArrowLeft') spherical.theta -= step;
    else if (e.key === 'ArrowRight') spherical.theta += step;
    else if (e.key === 'ArrowUp') spherical.phi = Math.max(0.15, spherical.phi - step);
    else if (e.key === 'ArrowDown') spherical.phi = Math.min(Math.PI - 0.15, spherical.phi + step);
    else if (e.key === '+' || e.key === '=') spherical.radius *= 0.88;
    else if (e.key === '-') spherical.radius *= 1.14;
    else if (e.key === 'r' || e.key === 'R') {
      fit();
      return;
    } else return;
    e.preventDefault();
    offset.setFromSpherical(spherical);
    camera.position.copy(controls.target).add(offset);
    controls.update();
    render();
  });

  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let down;
  canvas.addEventListener('pointerdown', event => {
    down = event.isPrimary && event.button === 0 ? [event.clientX, event.clientY] : undefined;
  });
  canvas.addEventListener('pointercancel', () => { down = undefined; });
  canvas.addEventListener('pointerup', event => {
    if (!down || !event.isPrimary) return;
    const moved = Math.hypot(event.clientX - down[0], event.clientY - down[1]);
    down = undefined;
    if (moved > 6) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      (2 * (event.clientX - rect.left)) / rect.width - 1,
      1 - (2 * (event.clientY - rect.top)) / rect.height
    );
    ray.setFromCamera(pointer, camera);
    const visibleRoots = [...layers.values()].filter(layer => layer.root.visible).map(layer => layer.root);
    const hit = ray.intersectObjects(visibleRoots, true).find(item => item.object.visible && meshIds.has(item.object));
    if (hit) selectPart(meshIds.get(hit.object));
  });

  stage.append(canvas);
  resize();

  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => {
    if (!/^(blob:|data:)/.test(url)) throw new Error('External GLB resource blocked.');
    return url;
  });

  function fit() {
    const box = new THREE.Box3().setFromObject(group);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    if (!sphere.radius) return;
    const center = sphere.center;
    const halfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(1, camera.aspect));
    const distance = (sphere.radius / Math.sin(halfFov)) * 1.15;
    // Lateral-three-quarter view facing the cat's left side (-X) and slightly cranial (-Z)
    camera.position.copy(center).addScaledVector(new THREE.Vector3(-1.05, 0.35, -0.55).normalize(), distance);
    camera.near = Math.max(0.002, distance / 500);
    camera.far = distance * 25;
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.update();
    render();
  }

  return {
    THREE,
    render,
    fit,
    async loadBuffer(buffer) {
      const gltf = await new GLTFLoader(manager).parseAsync(buffer, '');
      const root = gltf.scene;
      const box = new THREE.Box3().setFromObject(root);
      if (box.isEmpty() || !Number.isFinite(box.min.lengthSq() + box.max.lengthSq())) {
        throw new Error('Invalid model dimensions.');
      }
      group.add(root);
      return root;
    },
  };
}

function addLayerToggle(layerId, labelText, root, ids) {
  const row = document.createElement('div');
  row.className = 'layer-row';
  const label = document.createElement('label');
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = true;
  layers.set(layerId, { root, toggle, ids, name: labelText });
  toggle.addEventListener('change', () => {
    if (!toggle.checked && isolated && ids.has(selectedId())) {
      isolated = false;
    }
    refreshVisibility();
  });
  label.append(toggle, document.createTextNode(labelText));
  row.append(label);
  if (layers.size === 1) get('layer-list').replaceChildren();
  get('layer-list').append(row);
}

async function initAtlasSpecimen() {
  try {
    const resp = await fetch('./catalog.json', { cache: 'no-cache' });
    if (!resp.ok) throw new Error('تعذّر تحميل كتالوج العينة.');
    catalog = await resp.json();
    specimenId = catalog.specimen.id;
    study = loadStudyState();

    // Populate coverage & regions UI
    get('review-badge').textContent = catalog.specimen.reviewStatusAr;
    get('arteries-status').textContent = catalog.specimen.arteriesStatusAr;
    const covList = get('coverage-list');
    covList.replaceChildren();
    for (const item of catalog.specimen.missingOrMergedAr) {
      const li = document.createElement('li');
      li.textContent = item;
      covList.append(li);
    }

    const regionFilter = get('region-filter');
    const regionLayers = get('region-layers');
    regionLayers.replaceChildren();
    for (const r of catalog.regions) {
      regionFilter.add(new Option(r.labelAr, r.id));
      const row = document.createElement('div');
      row.className = 'layer-row';
      const lbl = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.dataset.region = r.id;
      cb.addEventListener('change', () => {
        if (!cb.checked && isolated && parts.get(selectedId())?.region === r.id) {
          isolated = false;
        }
        refreshVisibility();
      });
      regionToggles.set(r.id, cb);
      lbl.append(cb, document.createTextNode(`منطقة: ${r.labelAr}`));
      row.append(lbl);
      regionLayers.append(row);
    }

    const byNode = new Map(catalog.structures.map(s => [s.node, s]));

    statusEl.textContent = 'جارٍ تحميل المجسم الموثّق للقطة…';
    const glbResp = await fetch(catalog.specimen.modelUrl);
    if (!glbResp.ok) throw new Error('تعذّر جلب ملف المجسم GLB من استضافة الأطلس.');
    const buffer = await glbResp.arrayBuffer();

    viewer = await createViewer();
    const root = await viewer.loadBuffer(buffer);
    const layerIds = new Set();

    root.traverse(obj => {
      if (!obj.isMesh) return;
      const nodeName = obj.name || obj.parent?.name || '';
      const structure = byNode.get(nodeName);
      if (!structure) return;
      const id = structure.id;
      const mats = (Array.isArray(obj.material) ? obj.material : [obj.material]).map(m => m.clone());
      obj.material = Array.isArray(obj.material) ? mats : mats[0];
      layerIds.add(id);
      meshIds.set(obj, id);
      parts.set(id, {
        mesh: obj,
        label: `${structure.names.ar} (${structure.names.la})`,
        structure,
        specimenId,
        layerId: specimenId,
        region: structure.region,
        materials: mats.filter(m => m.color).map(m => ({ material: m, original: m.color.clone() })),
      });
      get('part').add(new Option(`${structure.names.ar} — ${structure.names.la}`, id));
    });

    addLayerToggle(specimenId, `العينة الأساسية: ${catalog.specimen.titleAr}`, root, layerIds);
    get('stage-overlay').hidden = true;
    get('reset').disabled = false;
    get('show-all').disabled = false;

    renderBoneList();
    showSelection();
    viewer.fit();
    statusEl.textContent = `تم فتح العينة تلقائيًا (${parts.size} عقدة تشريحية قابلة للتحديد). انقر على أي عظم أو اختره من القائمة.`;
  } catch (err) {
    get('empty').textContent = `تعذّر فتح العينة تلقائيًا: ${err.message || 'تحقق من دعم WebGL في المتصفح.'}`;
    statusEl.textContent = 'تعذّر تحميل العينة التلقائية.';
  }
}

// Optional local GLB upload for experimentation
get('file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  if (!/\.glb$/i.test(file.name) || file.size > 25 * 1024 * 1024 || layers.size >= 6) {
    statusEl.textContent = 'اختر ملف GLB بحجم يصل إلى 25 ميغابايت (الحد الأقصى 6 طبقات).';
    event.target.value = '';
    return;
  }
  event.target.disabled = true;
  statusEl.textContent = 'جارٍ فتح الملف المحلي التجريبي…';
  try {
    const buffer = await file.arrayBuffer();
    if (buffer.byteLength < 20 || new DataView(buffer).getUint32(0, true) !== 0x46546c67) {
      throw new Error('Invalid GLB signature.');
    }
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)),
      b => b.toString(16).padStart(2, '0')).join('');
    if (layers.has(hash)) {
      statusEl.textContent = 'هذه الطبقة مفتوحة بالفعل.';
      return;
    }
    viewer ??= await createViewer();
    const root = await viewer.loadBuffer(buffer);
    const ids = new Set();
    let number = 0;
    root.traverse(obj => {
      if (!obj.isMesh) return;
      const id = `local:${hash.slice(0, 12)}:${++number}`;
      const mats = (Array.isArray(obj.material) ? obj.material : [obj.material]).map(m => m.clone());
      obj.material = Array.isArray(obj.material) ? mats : mats[0];
      const label = `${file.name} · ${obj.name || 'جزء ' + number}`;
      ids.add(id);
      meshIds.set(obj, id);
      parts.set(id, {
        mesh: obj,
        label,
        structure: null,
        specimenId: `local:${hash.slice(0, 12)}`,
        layerId: hash,
        region: null,
        materials: mats.filter(m => m.color).map(m => ({ material: m, original: m.color.clone() })),
      });
      get('part').add(new Option(label, id));
    });
    addLayerToggle(hash, `طبقة محلية: ${file.name}`, root, ids);
    get('stage-overlay').hidden = true;
    get('reset').disabled = false;
    get('show-all').disabled = false;
    renderBoneList();
    refreshVisibility();
    refreshAllMaterials();
    viewer.fit();
    statusEl.textContent = 'أُضيفت الطبقة المحلية التجريبية.';
  } catch {
    statusEl.textContent = 'تعذّر فتح الملف المحلي. تحقق من أنه ملف GLB صالح.';
  } finally {
    event.target.value = '';
    event.target.disabled = false;
  }
});

initAtlasSpecimen();
