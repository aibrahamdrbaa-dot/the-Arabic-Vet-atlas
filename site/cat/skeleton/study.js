const get = id => document.getElementById(id);
const key = 'arabic-vet-atlas:cat-skeleton:v1';
const parts = new Map();
const layers = new Map();
const stage = get('stage');
const status = get('status');
let viewer;
let isolated = false;
const meshIds = new WeakMap();
let study = { notes: {}, colors: {} };
try {
  const saved = JSON.parse(localStorage.getItem(key) ?? '{}');
  study = { notes: saved?.notes ?? {}, colors: saved?.colors ?? {} };
} catch {
  status.textContent = 'تعذّرت قراءة الملاحظات المحفوظة.';
}

function persist(message) {
  try {
    localStorage.setItem(key, JSON.stringify(study));
    status.textContent = message;
  } catch {
    status.textContent = 'تعذّر الحفظ في هذا المتصفح.';
  }
}

function selected() { return get('part').value || 'workspace'; }

function showSelection() {
  const id = selected();
  get('part').dataset.previous = get('part').value;
  get('note').value = study.notes[id] ?? '';
  get('color').disabled = !parts.has(id);
  get('clear-color').disabled = !parts.has(id);
  get('color').value = study.colors[id] ?? '#4176d6';
  get('isolate').disabled = !parts.has(id);
  if (!parts.has(id)) isolated = false;
  ensureSelectedLayer();
  refreshVisibility();
}

function applyColor(id) {
  const part = parts.get(id);
  if (!part) return;
  for (const { material, original } of part.materials) {
    if (study.colors[id]) material.color.set(study.colors[id]);
    else material.color.copy(original);
  }
  viewer.render();
}

function ensureSelectedLayer() {
  if (!isolated) return;
  for (const layer of layers.values()) if (layer.ids.has(selected())) layer.toggle.checked = true;
}

function refreshVisibility() {
  const id = selected();
  for (const layer of layers.values()) {
    layer.root.visible = layer.toggle.checked && (!isolated || layer.ids.has(id));
  }
  for (const [partId, part] of parts) part.mesh.layers.set(isolated && partId !== id ? 1 : 0);
  get('isolate').setAttribute('aria-pressed', String(isolated));
  get('isolate').textContent = isolated ? 'إنهاء العزل' : 'عزل الجزء المحدد';
  viewer?.render();
}

function selectPart(id) {
  const select = get('part');
  if (select.value === id) return;
  if (get('note').value !== (study.notes[selected()] ?? '')) {
    if (!confirm('الملاحظة الحالية غير محفوظة. هل تريد الانتقال إلى جزء آخر؟')) return;
  }
  select.value = id;
  showSelection();
}

get('part').addEventListener('change', () => {
  const select = get('part');
  const next = select.value;
  select.value = select.dataset.previous ?? '';
  selectPart(next);
  select.dataset.previous = select.value;
});
get('isolate').addEventListener('click', () => {
  isolated = !isolated;
  ensureSelectedLayer();
  refreshVisibility();
});
get('export').addEventListener('click', () => {
  const labels = Object.fromEntries([...parts].map(([id, part]) => [id, part.label]));
  const url = URL.createObjectURL(new Blob([
    JSON.stringify({ schemaVersion: 1, ...study, labels }, null, 2),
  ], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'arabic-vet-atlas-cat-study.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
get('save').addEventListener('click', () => {
  study.notes[selected()] = get('note').value;
  persist('حُفظت الملاحظة.');
});
get('color').addEventListener('change', event => {
  study.colors[selected()] = event.target.value;
  applyColor(selected());
  persist('حُفظ اللون.');
});
get('clear-color').addEventListener('click', () => {
  delete study.colors[selected()];
  applyColor(selected());
  showSelection();
  persist('استُعيد اللون الأصلي.');
});
get('reset').addEventListener('click', () => {
  isolated = false;
  refreshVisibility();
  viewer.fit();
});
showSelection();

async function createViewer() {
  const [THREE, { OrbitControls }, { GLTFLoader }] = await Promise.all([
    import('three'),
    import('three/addons/controls/OrbitControls.js'),
    import('three/addons/loaders/GLTFLoader.js'),
  ]);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#eef2f7');
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  const light = new THREE.DirectionalLight(0xffffff, 2);
  light.position.set(3, 6, 5);
  scene.add(light, new THREE.HemisphereLight(0xffffff, 0x52627c, 2));
  const group = new THREE.Group();
  scene.add(group);
  const render = () => renderer.render(scene, camera);
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
    pointer.set(2 * (event.clientX - rect.left) / rect.width - 1,
      1 - 2 * (event.clientY - rect.top) / rect.height);
    ray.setFromCamera(pointer, camera);
    const visible = [...layers.values()].filter(layer => layer.root.visible).map(layer => layer.root);
    const hit = ray.intersectObjects(visible, true).find(item => meshIds.has(item.object));
    if (hit) selectPart(meshIds.get(hit.object));
  });
  stage.append(canvas);
  resize();
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => {
    if (!/^(blob:|data:)/.test(url)) throw new Error('External GLB resource blocked.');
    return url;
  });
  return {
    render,
    async load(buffer) {
      const gltf = await new GLTFLoader(manager).parseAsync(buffer, '');
      const root = gltf.scene;
      const box = new THREE.Box3().setFromObject(root);
      if (box.isEmpty() || !Number.isFinite(box.min.lengthSq() + box.max.lengthSq())) {
        throw new Error('Invalid model dimensions.');
      }
      group.add(root);
      return root;
    },
    fit() {
      const box = new THREE.Box3().setFromObject(group);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      if (!sphere.radius) return;
      const center = sphere.center;
      const halfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(1, camera.aspect));
      const distance = sphere.radius / Math.sin(halfFov) * 1.12;
      camera.position.copy(center).addScaledVector(new THREE.Vector3(1, 0.45, 1).normalize(), distance);
      camera.near = distance / 500;
      camera.far = distance * 20;
      camera.updateProjectionMatrix();
      controls.target.copy(center);
      controls.update();
      render();
    },
  };
}

get('file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  if (!/\.glb$/i.test(file.name) || file.size > 25 * 1024 * 1024 || layers.size >= 5) {
    status.textContent = 'اختر ملف GLB بحجم يصل إلى 25 ميغابايت. الحد الأقصى خمس طبقات.';
    event.target.value = '';
    return;
  }
  event.target.disabled = true;
  status.textContent = 'جارٍ فتح الملف…';
  try {
    const buffer = await file.arrayBuffer();
    if (buffer.byteLength < 20 || new DataView(buffer).getUint32(0, true) !== 0x46546c67) {
      throw new Error('Invalid GLB signature.');
    }
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)),
      byte => byte.toString(16).padStart(2, '0')).join('');
    if (layers.has(hash)) {
      status.textContent = 'هذه الطبقة مفتوحة بالفعل.';
      return;
    }
    viewer ??= await createViewer();
    const root = await viewer.load(buffer);
    const ids = new Set();
    let number = 0;
    root.traverse(object => {
      if (!object.isMesh) return;
      const id = hash + ':' + (++number);
      const materials = (Array.isArray(object.material) ? object.material : [object.material])
        .map(material => material.clone());
      object.material = Array.isArray(object.material) ? materials : materials[0];
      const label = file.name + ' · ' + (object.name || 'جزء ' + number);
      ids.add(id);
      meshIds.set(object, id);
      parts.set(id, {
        mesh: object,
        label,
        materials: materials.filter(material => material.color)
          .map(material => ({ material, original: material.color.clone() })),
      });
      get('part').add(new Option(label, id));
      if (study.colors[id]) applyColor(id);
    });
    const row = document.createElement('div');
    const label = document.createElement('label');
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = true;
    layers.set(hash, { root, toggle, ids });
    toggle.addEventListener('change', () => {
      if (!toggle.checked && isolated && ids.has(selected())) {
        isolated = false;
      }
      refreshVisibility();
    });
    refreshVisibility();
    label.append(toggle, ' ' + file.name);
    row.append(label);
    if (layers.size === 1) get('layer-list').replaceChildren();
    get('layer-list').append(row);
    get('empty').hidden = true;
    get('reset').disabled = false;
    viewer.fit();
    status.textContent = 'أُضيفت الطبقة. تظهر الملفات في إحداثياتها الأصلية.';
  } catch {
    status.textContent = 'تعذّر فتح الملف. تحقق من أنه GLB مستقل وأن WebGL متاح.';
  } finally {
    event.target.value = '';
    event.target.disabled = false;
  }
});