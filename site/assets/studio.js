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
let viewerReady = false;
let catalog;
let specimenId = document.body.dataset.specimen;
let isolated = false;

function loadStudyState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (raw && typeof raw === 'object' && raw.specimens) return raw;
    // Migrate v1 if present
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? 'null');
    if (specimenId === 'felis-catus-tavernier-2022' && legacy && typeof legacy === 'object') {
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
    const latest = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (latest?.specimens) for (const [key, value] of Object.entries(latest.specimens)) if (key !== specimenId) study.specimens[key] = value;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(study));
    statusEl.textContent = message;
    return true;
  } catch {
    statusEl.textContent = 'تعذّر الحفظ في هذا المتصفح.';
    return false;
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
    get('card-title').textContent = 'العينة كاملة';
    get('card-ar').textContent = part ? part.label : 'اختر عظمًا بالنقر على المجسم أو من القائمة';
    get('card-en').textContent = '—';
    get('card-la').textContent = '—';
    get('card-kind').textContent = '—';
    get('card-id').textContent = part ? id : specimenId;
    get('card-region').textContent = '—';
    get('card-source').textContent = catalog?.specimen?.source?.author ?? '—';
    get('card-review').textContent = catalog?.specimen?.reviewStatusAr ?? '—';
    get('card-coverage').textContent = '—';
    get('card-book-ref').textContent = '—';
    get('card-landmarks').textContent = '—';
    get('card-muscles').textContent = '—';
    get('card-vessels-nerves').textContent = '—';
    return;
  }
  get('card-title').textContent = s.names.ar;
  get('card-ar').textContent = s.names.ar;
  get('card-en').textContent = s.names.en;
  get('card-la').textContent = `${s.names.la} (${s.navEdition})`;
  get('card-kind').textContent = s.nodeKindAr || 'عقدة تشريحية';
  get('card-id').textContent = s.id;
  get('card-region').textContent = `${s.regionAr} · ${s.lateralityAr}`;
  get('card-source').textContent = s.sourceLabel;
  get('card-review').textContent = s.reviewStatusAr;
  get('card-coverage').textContent = s.coverageNoteAr;
  get('card-book-ref').textContent = s.bookRef || '—';
  get('card-landmarks').textContent = s.felineLandmarksAr || '—';
  get('card-muscles').textContent = s.muscleAttachmentsAr || '—';
  get('card-vessels-nerves').textContent = s.adjacentVesselsNervesAr || '—';
}

function updateBoneListSelection(id) {
  for (const btn of get('bone-list').querySelectorAll('.bone-item')) {
    const active = btn.dataset.id === id;
    btn.setAttribute('aria-pressed', String(active));
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
  get('isolate').textContent = isolated ? 'إنهاء العزل' : 'عزل المحدد';
  viewer?.render();
}

let activePane = 'browse';
let noteTimer;
let savedNoteValue = '';
let noteReady = false;
function openPane(name, focus = false) {
  if (focus) setFocusMode(false);
  activePane = name;
  for (const btn of document.querySelectorAll('[data-pane]')) {
    const active = btn.dataset.pane === name;
    btn.setAttribute('aria-pressed', String(active));
    get('pane-' + btn.dataset.pane).hidden = !active;
    if (active && focus) btn.focus({preventScroll:true});
    if (active && focus && window.matchMedia('(max-width:999px)').matches) get('pane-' + name).scrollIntoView({block:'start'});
  }
}
document.querySelectorAll('[data-pane]').forEach(btn => btn.addEventListener('click', () => openPane(btn.dataset.pane)));
document.querySelectorAll('[data-open-pane]').forEach(btn => btn.addEventListener('click', () => openPane(btn.dataset.openPane, true)));
get('open-notes').addEventListener('click', () => openPane('notes', true));
function setFocusMode(on) {
  document.body.classList.toggle('study-focus', on);
  get('focus-mode').setAttribute('aria-pressed', String(on));
  get('focus-mode').querySelector('span').textContent = on ? 'إنهاء التركيز' : 'تركيز';
  get('focus-mode').setAttribute('aria-label', on ? 'إنهاء وضع التركيز' : 'وضع التركيز');
}
get('focus-mode').addEventListener('click', () => setFocusMode(get('focus-mode').getAttribute('aria-pressed') !== 'true'));
document.addEventListener('keydown', e => { if(e.key === 'Escape' && document.body.classList.contains('study-focus')) setFocusMode(false); });
const VIEW_DIRECTIONS = {perspective:[-1.05,.30,-.46],left:[-1,0,0],right:[1,0,0],cranial:[0,0,-1],caudal:[0,0,1],dorsal:[0,1,-.0001],ventral:[0,-1,-.0001]};
get('view-angle').addEventListener('change', () => {const a=get('view-angle').value;if(viewerReady && VIEW_DIRECTIONS[a]){viewer.fit(a);get('view-caption').textContent='عرض كامل للعينة';}});
get('fit-selection').addEventListener('click', () => { const part=parts.get(selectedId());if(viewerReady && part){const layer=layers.get(part.layerId);if(layer)layer.toggle.checked=true;const region=regionToggles.get(part.region);if(region)region.checked=true;refreshVisibility();viewer.fit(get('view-angle').value,part.mesh);get('view-caption').textContent='عرض مقرّب للبنية المحددة';} });
function filteredIds() {
  const q=normalizeSearch(get('bone-search').value), region=get('region-filter').value, notes=specimenBucket().notes;
  return [...parts].filter(([id,p])=>{const s=p.structure;return (region==='all'||p.region===region)&&(!get('notes-only').checked||Boolean(notes[id]?.trim()))&&(!q||normalizeSearch([s?.names.ar,s?.names.en,s?.names.la,s?.id,s?.regionAr,s?.lateralityAr,s?.bookRef,s?.felineLandmarksAr].filter(Boolean).join(' ')).includes(q));}).map(([id])=>id);
}
function updateSelectionNav() {
  const ids=filteredIds(), i=ids.indexOf(selectedId());
  get('selection-index').textContent=i<0?(parts.has(selectedId())?'خارج نتائج التصفية':'العينة كاملة'):(i+1)+' / '+ids.length;
  get('prev-bone').disabled=i<=0;
  get('next-bone').disabled=ids.length===0||i===ids.length-1;
}
get('prev-bone').addEventListener('click',()=>{const ids=filteredIds(),i=ids.indexOf(selectedId());if(i>0)selectPart(ids[i-1]);});
get('next-bone').addEventListener('click',()=>{const ids=filteredIds(),i=ids.indexOf(selectedId());if(i+1<ids.length)selectPart(ids[i+1]);});
get('clear-search').addEventListener('click',()=>{get('bone-search').value='';get('region-filter').value='all';get('notes-only').checked=false;renderBoneList();get('bone-search').focus();});
get('notes-only').addEventListener('change',renderBoneList);
get('copy-names').addEventListener('click',async()=>{const s=parts.get(selectedId())?.structure;if(!s)return;try{await navigator.clipboard.writeText([s.names.ar,s.names.en,s.names.la].join(' / '));statusEl.textContent='تم نسخ المسميات الثلاثة.';}catch{statusEl.textContent='تعذّر النسخ التلقائي. يمكنك تحديد الأسماء ونسخها يدويًا.';}});


function noteLabel(id) {
  return id === 'specimen:overview' ? 'ملاحظات عامة على العينة' : parts.get(id)?.structure?.names.ar || id;
}
function updateNoteLength() {
  get('note-length').textContent = get('note').value.length + ' / 4000';
}
function renderSavedNotes() {
  const box = get('saved-notes');
  box.replaceChildren();
  const notes = specimenBucket().notes;
  const entries = Object.entries(notes).filter(([id, value]) => (id === 'specimen:overview' || parts.has(id)) && typeof value === 'string' && value.trim());
  get('notes-count').textContent = '(' + entries.length + ')';
  if (!entries.length) {
    const p = document.createElement('p');
    p.className = 'notes-help'; p.textContent = 'لا توجد ملاحظات محفوظة لهذه العينة بعد.';
    box.append(p);
  }
  for (const [id, value] of entries) {
    const btn = document.createElement('button'); btn.type = 'button';
    const title = document.createElement('strong'); title.textContent = noteLabel(id);
    const preview = document.createElement('small'); preview.textContent = value.length > 100 ? value.slice(0, 100) + '…' : value;
    btn.append(title, preview);
    btn.addEventListener('click', () => { selectPart(id === 'specimen:overview' ? '' : id, false); openPane('notes'); });
    box.append(btn);
  }
}
function saveNote(force = false) {
  clearTimeout(noteTimer);
  if (!noteReady) return true;
  const value = get('note').value;
  if (!force && value === savedNoteValue) return true;
  const id = selectedId(), bucket = getSelectedBucket();
  const previous = bucket.notes[id];
  if (value.trim()) bucket.notes[id] = value;
  else delete bucket.notes[id];
  if (!persist('حُفظت ملاحظتك في هذا المتصفح.')) {
    if (previous === undefined) delete bucket.notes[id]; else bucket.notes[id] = previous;
    get('note-status').textContent = 'تعذّر الحفظ — انسخ النص قبل المغادرة.';
    return false;
  }
  savedNoteValue = value;
  get('note-status').textContent = 'محفوظة محليًا';
  renderSavedNotes();
  renderBoneList();
  window.__syncStudyUx?.();
  return true;
}
get('note').disabled = true;
get('save').disabled = true;
get('delete-note').disabled = true;
get('export').disabled = true;
get('note').addEventListener('input', () => {
  updateNoteLength();
  get('note-status').textContent = 'جارٍ الحفظ…';
  clearTimeout(noteTimer);
  noteTimer = setTimeout(saveNote, 450);
});
get('note').addEventListener('blur', () => saveNote());
window.addEventListener('pagehide', () => saveNote());
window.addEventListener('beforeunload', e => { if (noteReady && get('note').value !== savedNoteValue && !saveNote()) { e.preventDefault(); e.returnValue = ''; } });
get('delete-note').addEventListener('click', () => {
  if (!get('note').value || !confirm('حذف الملاحظة الخاصة بهذه البنية؟')) return;
  get('note').value = ''; updateNoteLength(); saveNote(true);
});
function updateInfoVisibility(hasPart) {
  get('no-selection').hidden = hasPart;
  get('card-meta').hidden = !hasPart;
  for (const dd of get('pane-info').querySelectorAll('dd')) {
    const empty = dd.textContent.trim() === '—' || !dd.textContent.trim();
    dd.hidden = empty;
    if (dd.previousElementSibling?.tagName === 'DT') dd.previousElementSibling.hidden = empty;
  }
  get('card-en').hidden = !hasPart;
  get('card-la').hidden = !hasPart;
}
function showSelection() {
  clearTimeout(noteTimer);
  const id = selectedId();
  const select = get('part');
  select.dataset.previous = select.value;
  const bucket = getSelectedBucket();
  get('note').value = bucket.notes[id] ?? '';
  savedNoteValue = get('note').value;
  noteReady = Boolean(catalog?.specimen?.id);
  for (const key of ['note','save','delete-note','export']) get(key).disabled = !noteReady;
  get('note-scope').textContent = noteLabel(id);
  get('note-status').textContent = savedNoteValue.trim() ? 'محفوظة محليًا' : 'لا توجد ملاحظة';
  updateNoteLength(); renderSavedNotes();
  const hasPart = parts.has(id);
  get('stage-selection').textContent = hasPart ? noteLabel(id) : 'العينة كاملة';
  get('stage-selection-latin').textContent = hasPart ? parts.get(id).structure.names.la : 'اختر بنية من المجسم أو القائمة';
  get('stage-selection-latin').dir = hasPart ? 'ltr' : 'rtl';
  get('color').disabled = !hasPart || !viewerReady;
  get('clear-color').disabled = !hasPart || !viewerReady;
  get('color').value = bucket.colors[id] ?? '#19766b';
  get('isolate').disabled = !hasPart || !viewerReady;
  if (!hasPart) isolated = false;
  updateBoneCard(id); updateInfoVisibility(hasPart);
  updateBoneListSelection(id);
  updateSelectionNav();
  get('fit-selection').disabled = !hasPart || !viewerReady;
  get('copy-names').disabled = !hasPart;
  ensureSelectedVisible();
  refreshVisibility();
  refreshAllMaterials();
  window.__syncStudyUx?.();
}
function selectPart(id, reveal = true) {
  const select = get('part');
  if (id && !parts.has(id)) return;
  if (select.value !== id) {
    if (!saveNote() && !confirm('تعذّر حفظ الملاحظة. هل تريد الانتقال دون حفظها؟')) return;
    select.value = id;
    showSelection();
  }
  if (reveal && activePane !== 'notes') openPane('info');
}
get('select-overview').addEventListener('click', () => selectPart(''));
function normalizeSearch(value) {
  return String(value || '').toLowerCase().replace(/[ً-ٰٟ]/g, '').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').trim();
}

function renderBoneList() {
  const listEl = get('bone-list');
  const ids=filteredIds(), noted=specimenBucket().notes;
  const scroll=listEl.scrollTop;
  listEl.replaceChildren();
  let shown=0;
  for (const id of ids) {
    const part=parts.get(id), s=part.structure;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bone-item';
    btn.dataset.id = id;
    btn.setAttribute('aria-pressed', String(id === selectedId()));
    const title = document.createElement('strong');
    title.textContent = s ? s.names.ar : part.label;
    const sub = document.createElement('span');
    sub.className = 'sub';
    const leftSpan = document.createElement('span');
    leftSpan.textContent = s ? `${s.nodeKindAr} · ${s.regionAr} · ${s.lateralityAr}` : '';
    const rightSpan = document.createElement('span');
    rightSpan.className = 'latin';
    rightSpan.textContent = s ? s.names.la : '';
    sub.append(leftSpan, rightSpan);
    btn.append(title, sub);
    if(noted[id]?.trim()){const marker=document.createElement('span');marker.className='note-marker';marker.textContent='ملاحظة محفوظة';btn.append(marker);}
    btn.addEventListener('click', () => selectPart(id));
    listEl.append(btn);
    shown++;
  }
  get('bone-count').textContent = shown + ' من ' + parts.size + ' بنية';
  get('clear-search').disabled = !get('bone-search').value && get('region-filter').value==='all' && !get('notes-only').checked;
  get('study-progress').textContent=parts.size+' بنية تشريحية';
  listEl.scrollTop=scroll;
  updateSelectionNav();
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

get('save').addEventListener('click', () => saveNote(true));

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
  get('color').value = '#19766b';
  refreshAllMaterials();
  persist('استُعيد اللون الأصلي للعظم.');
});

get('zoom-in').addEventListener('click', () => viewer?.zoom(0.82));
get('zoom-out').addEventListener('click', () => viewer?.zoom(1.22));
get('reset').addEventListener('click', () => {
  isolated = false;
  for (const layer of layers.values()) layer.toggle.checked = true;
  for (const cb of regionToggles.values()) cb.checked = true;
  refreshVisibility();
  viewer?.fit();
  get('view-caption').textContent='عرض كامل للعينة';
});

get('export').addEventListener('click', () => {
  if (!saveNote()) return;
  const bucket = specimenBucket();
  const currentNotes = Object.fromEntries(Object.entries(bucket.notes).filter(([id]) => id === 'specimen:overview' || parts.has(id)));
  const currentColors = Object.fromEntries(Object.entries(bucket.colors).filter(([id]) => parts.has(id)));
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
    specimens: { [specimenId]: { notes: currentNotes, colors: currentColors } },
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
  scene.background = new THREE.Color('#edf1ef');

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
  controls.addEventListener('start',()=>{get('view-angle').value='custom';get('view-caption').textContent='منظور حر';});

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
    get('view-angle').value='custom';
    get('view-caption').textContent='منظور حر';
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

  function fit(angle = 'perspective', target = group) {
    const box = new THREE.Box3().setFromObject(target);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    if (!sphere.radius) return;
    const center = sphere.center;
    const outward = angle==='custom' ? camera.position.clone().sub(controls.target).normalize() : new THREE.Vector3(...(VIEW_DIRECTIONS[angle] || VIEW_DIRECTIONS.perspective)).normalize();
    const right = new THREE.Vector3().crossVectors(camera.up, outward).normalize();
    const up = new THREE.Vector3().crossVectors(outward, right).normalize();
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const tanH = tanV * Math.max(camera.aspect, 0.1);
    let distance = 0;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const offset = new THREE.Vector3(x,y,z).sub(center);
      distance = Math.max(distance, offset.dot(outward) + 1.10 * Math.max(Math.abs(offset.dot(right))/tanH, Math.abs(offset.dot(up))/tanV));
    }
    distance = Math.max(distance, sphere.radius * 1.10, 0.01);
    camera.position.copy(center).addScaledVector(outward, distance);
    controls.minDistance = Math.max(sphere.radius * 0.12, 0.01);
    controls.maxDistance = Math.max(distance * 5, sphere.radius * 6);
    camera.near = Math.max(0.002, distance / 500);
    camera.far = distance * 25;
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.update();
    get('view-angle').value=angle;
    render();
  }

  return {
    THREE,
    render,
    fit,
    zoom(factor) {
      const offset = camera.position.clone().sub(controls.target);
      const d = THREE.MathUtils.clamp(offset.length()*factor, controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target).add(offset.setLength(d));
      controls.update(); render();
    },
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

    statusEl.textContent = 'جارٍ تحميل المجسم الموثّق…';
    const model = new URL(catalog.specimen.modelUrl, location.href);
    const folder = new URL('./models/', location.href);
    if (model.origin !== location.origin || !model.pathname.startsWith(folder.pathname) || !model.pathname.endsWith('.glb') || model.search || model.hash) throw new Error('مسار المجسم غير معتمد.');
    const glbResp = await fetch(model.href, {redirect:'error'});
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
    viewerReady = true;
    get('stage-overlay').hidden = true;
    get('reset').disabled = false;
    get('show-all').disabled = false;
    get('zoom-in').disabled = false;
    get('zoom-out').disabled = false;
    get('view-angle').disabled = false;

    const urlParams = new URLSearchParams(window.location.search);
    const reqRegion = urlParams.get('region');
    if (reqRegion && catalog.regions.some(r => r.id === reqRegion)) {
      get('region-filter').value = reqRegion;
    }
    const reqStruct = urlParams.get('structure');
    if (reqStruct && parts.has(reqStruct)) {
      get('part').value = reqStruct;
    }

    renderBoneList();
    showSelection();
    viewer.fit();
    if (reqStruct && parts.has(reqStruct)) openPane('info');
    statusEl.textContent = reqStruct && parts.has(reqStruct)
      ? `تم فتح العينة تلقائيًا وتحديد: ${parts.get(reqStruct).structure.names.ar} (${parts.size} عقدة تشريحية).`
      : `تم فتح العينة تلقائيًا (${parts.size} عقدة تشريحية قابلة للتحديد). انقر على أي عقدة أو اخترها من القائمة.`;
  } catch (err) {
    get('empty').textContent = `تعذّر تشغيل العارض ثلاثي الأبعاد (${err.message || 'WebGL غير متاح'}). ${catalog ? 'يمكنك متابعة تصفح البنى التشريحية وتدوين ملاحظاتك من القائمة الجانبية.' : 'تعذّر تحميل الكتالوج. أعد تحميل الصفحة للمحاولة مجددًا.'}`;
    viewerReady = false;
    statusEl.textContent = catalog ? 'وضع البديل النصي مفعّل.' : 'تعذّر تحميل العينة.';
    if (catalog && parts.size === 0) {
      for (const s of catalog.structures) {
        parts.set(s.id, { mesh: { visible: true, layers: { set() {} } }, label: `${s.names.ar} (${s.names.la})`, structure: s, specimenId, layerId: specimenId, region: s.region, materials: [] });
        get('part').add(new Option(`${s.names.ar} — ${s.names.la}`, s.id));
      }
      const reqStruct = new URLSearchParams(window.location.search).get('structure');
      if (reqStruct && parts.has(reqStruct)) get('part').value = reqStruct;
      renderBoneList();
      showSelection();
      if (reqStruct && parts.has(reqStruct)) openPane('info');
    }
  }
}

for (const name of ['dragover','drop']) document.addEventListener(name, e => { if (Array.from(e.dataTransfer?.types || []).includes('Files')) e.preventDefault(); });
initAtlasSpecimen();


// === Subpage Study UX Upgrade (Floating HUD, Tri-Lingual Copy Tiles, Auto-Hide Empty Info, Pro Notes) ===
(function initStudyUxEnhancements() {
  const byId = id => document.getElementById(id);
  const exitFocusIfActive = () => {
    if (document.body.classList.contains('study-focus')) {
      document.body.classList.remove('study-focus');
      get('focus-mode')?.setAttribute('aria-pressed', 'false');
    }
  };

  const stageEl = get('stage');
  let hudEl = null;
  if (stageEl && !byId('stage-hud')) {
    hudEl = document.createElement('div');
    hudEl.id = 'stage-hud';
    hudEl.className = 'stage-hud';
    hudEl.hidden = true;
    hudEl.innerHTML = `
      <div class="stage-hud-top">
        <div>
          <h3 id="hud-ar" class="stage-hud-title"></h3>
          <div id="hud-latin" class="stage-hud-latin"></div>
        </div>
      </div>
      <div class="stage-hud-sub">
        <span id="hud-region" class="stage-hud-pill"></span>
        <span id="hud-kind" class="stage-hud-pill"></span>
      </div>
      <div class="stage-hud-actions">
        <button type="button" id="hud-open-info" class="primary">المعلومات</button>
        <button type="button" id="hud-open-notes">دوّن ملاحظة</button>
        <button type="button" id="hud-isolate">عزل</button>
      </div>`;
    stageEl.append(hudEl);
    byId('hud-open-info').addEventListener('click', () => {
      exitFocusIfActive();
      if (typeof openPane === 'function') openPane('info');
    });
    byId('hud-open-notes').addEventListener('click', () => {
      exitFocusIfActive();
      if (typeof openPane === 'function') openPane('notes');
      setTimeout(() => get('note')?.focus(), 40);
    });
    byId('hud-isolate').addEventListener('click', () => get('isolate')?.click());
  }

  // Click-to-copy tri-lingual tiles inside .selected-summary
  const summaryBox = document.querySelector('#pane-info .selected-summary');
  if (summaryBox && !byId('name-tiles')) {
    const tiles = document.createElement('div');
    tiles.id = 'name-tiles';
    tiles.className = 'name-tiles';
    tiles.hidden = true;
    tiles.innerHTML = `
      <button type="button" class="name-tile"><span class="name-tile-label">العربي</span><span class="name-tile-val" id="tile-ar"></span><span class="name-tile-copy">نسخ</span></button>
      <button type="button" class="name-tile"><span class="name-tile-label">English</span><span class="name-tile-val" id="tile-en" dir="ltr"></span><span class="name-tile-copy">نسخ</span></button>
      <button type="button" class="name-tile"><span class="name-tile-label">NAV</span><span class="name-tile-val" id="tile-la" dir="ltr"></span><span class="name-tile-copy">نسخ</span></button>`;
    const copyBtn = get('copy-names');
    summaryBox.insertBefore(tiles, copyBtn || null);
    tiles.querySelectorAll('.name-tile').forEach(btn => {
      btn.addEventListener('click', async () => {
        const val = btn.querySelector('.name-tile-val')?.textContent?.trim();
        if (!val || val === '—') return;
        const lbl = btn.querySelector('.name-tile-copy');
        try {
          await navigator.clipboard.writeText(val);
          if (lbl) { lbl.textContent = 'تم النسخ ✓'; setTimeout(() => { lbl.textContent = 'نسخ'; }, 1400); }
        } catch {
          if (lbl) { lbl.textContent = 'تعذّر النسخ'; setTimeout(() => { lbl.textContent = 'نسخ'; }, 1600); }
        }
      });
    });
  }

  // Quick Study Tag Chips above textarea#note + Markdown study-sheet export buttons
  const noteInput = get('note');
  if (noteInput && !byId('note-templates')) {
    const chipsWrap = document.createElement('div');
    chipsWrap.id = 'note-templates';
    chipsWrap.className = 'note-templates';
    const presets = [
      { label: '📌 مهم للامتحان', text: '📌 مهم للامتحان: ' },
      { label: '❓ سؤال للمراجعة', text: '❓ سؤال للمراجعة: ' },
      { label: '🩺 ملاحظة سريرية', text: '🩺 ملاحظة سريرية: ' },
      { label: '⚖️ مقارنة تشريحية', text: '⚖️ مقارنة تشريحية: ' },
    ];
    for (const p of presets) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'note-chip'; b.textContent = p.label;
      b.addEventListener('click', () => {
        if (noteInput.disabled) return;
        const cur = noteInput.value;
        noteInput.value = cur ? `${cur.trimEnd()}\n${p.text}` : p.text;
        noteInput.focus();
        noteInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      chipsWrap.append(b);
    }
    noteInput.parentNode.insertBefore(chipsWrap, noteInput);
  }

  const exportBtn = get('export');
  if (exportBtn && !byId('export-md')) {
    const row = document.createElement('div');
    row.className = 'note-export-row';
    const copyAllBtn = document.createElement('button');
    copyAllBtn.type = 'button'; copyAllBtn.id = 'copy-all-notes'; copyAllBtn.textContent = 'نسخ ملخص ملاحظاتي';
    const mdBtn = document.createElement('button');
    mdBtn.type = 'button'; mdBtn.id = 'export-md'; mdBtn.textContent = 'تنزيل ورقة مراجعة (.md)';
    row.append(copyAllBtn, mdBtn);
    exportBtn.parentNode.insertBefore(row, exportBtn);

    function buildMarkdownNotes() {
      const notes = { ...specimenBucket().notes };
      // Preserve live unsaved textarea edits for the currently selected structure
      const curId = selectedId();
      const curVal = get('note')?.value ?? '';
      if (curVal.trim()) notes[curId] = curVal;
      const entries = Object.entries(notes).filter(([id, v]) => (id === 'specimen:overview' || parts.has(id)) && typeof v === 'string' && v.trim());
      const title = catalog?.specimen?.titleAr || 'ملاحظات الأطلس البيطري العربي';
      if (!entries.length) return `# ${title}\n\nلا توجد ملاحظات محفوظة بعد.\n`;
      const lines = [`# ${title}`, ''];
      for (const [id, v] of entries) {
        const s = parts.get(id)?.structure;
        const heading = s ? `${s.names.ar} (${s.names.en} — *${s.names.la}*)` : noteLabel(id);
        lines.push(`## ${heading}`, '', v.trim(), '');
      }
      return lines.join('\n');
    }

    copyAllBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(buildMarkdownNotes());
        copyAllBtn.textContent = 'تم نسخ الملخص ✓';
      } catch {
        copyAllBtn.textContent = 'تعذّر النسخ';
      }
      setTimeout(() => { copyAllBtn.textContent = 'نسخ ملخص ملاحظاتي'; }, 1600);
    });
    mdBtn.addEventListener('click', () => {
      const blob = new Blob([buildMarkdownNotes()], { type: 'text/markdown;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${specimenId || 'vet-atlas'}-notes.md`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    });
  }

  // Live badge counter on Notes tab button & top ملاحظاتي button
  const notesTabBtn = document.querySelector('.study-switcher button[data-pane="notes"]');
  let tabBadge = null;
  if (notesTabBtn && !notesTabBtn.querySelector('.tab-badge')) {
    tabBadge = document.createElement('span');
    tabBadge.className = 'tab-badge';
    tabBadge.hidden = true;
    notesTabBtn.append(tabBadge);
  }

  window.__syncStudyUx = function syncStudyUx() {
    const id = selectedId();
    const part = parts.get(id);
    const s = part?.structure;

    if (hudEl) {
      hudEl.hidden = !s;
      if (s) {
        byId('hud-ar').textContent = s.names.ar;
        byId('hud-latin').textContent = `${s.names.en} · ${s.names.la}`;
        byId('hud-region').textContent = `${s.regionAr} · ${s.lateralityAr}`;
        byId('hud-kind').textContent = s.nodeKindAr || 'عقدة تشريحية';
        byId('hud-isolate').textContent = isolated ? 'إنهاء العزل' : 'عزل';
      }
    }

    const tiles = byId('name-tiles');
    if (tiles) {
      tiles.hidden = !s;
      if (s) {
        byId('tile-ar').textContent = s.names.ar;
        byId('tile-en').textContent = s.names.en;
        byId('tile-la').textContent = s.names.la;
      }
    }

    const metaDl = get('card-meta');
    if (metaDl) {
      metaDl.querySelectorAll('dt').forEach(dt => {
        const dd = dt.nextElementSibling;
        if (!dd || dd.tagName !== 'DD') return;
        const val = (dd.textContent || '').trim();
        const empty = !val || val === '—';
        dt.classList.toggle('info-hidden', empty);
        dd.classList.toggle('info-hidden', empty);
      });
    }

    if (catalog?.specimen?.id) {
      const notes = specimenBucket().notes;
      const entries = Object.entries(notes).filter(([nid, v]) => (nid === 'specimen:overview' || parts.has(nid)) && typeof v === 'string' && v.trim());
      if (tabBadge) {
        tabBadge.textContent = String(entries.length);
        tabBadge.hidden = entries.length === 0;
      }
      const openNotesBtn = get('open-notes');
      if (openNotesBtn) {
        openNotesBtn.textContent = entries.length ? `ملاحظاتي (${entries.length})` : 'ملاحظاتي';
      }
      const box = get('saved-notes');
      if (box && entries.length) {
        box.replaceChildren();
        for (const [nid, value] of entries) {
          const ns = parts.get(nid)?.structure;
          const card = document.createElement('button');
          card.type = 'button'; card.className = 'saved-note-card';
          const head = document.createElement('div'); head.className = 'saved-note-head';
          const title = document.createElement('strong'); title.textContent = noteLabel(nid);
          head.append(title);
          if (ns?.names?.la) {
            const lat = document.createElement('span'); lat.className = 'saved-note-latin'; lat.textContent = ns.names.la;
            head.append(lat);
          }
          const preview = document.createElement('div'); preview.className = 'saved-note-preview';
          preview.textContent = value.length > 140 ? value.slice(0, 140) + '…' : value;
          card.append(head, preview);
          card.addEventListener('click', () => {
            selectPart(nid === 'specimen:overview' ? '' : nid, false);
            if (typeof openPane === 'function') openPane('notes');
          });
          box.append(card);
        }
      }
    }
  };
})();
