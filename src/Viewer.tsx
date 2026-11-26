import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

type DisposableRenderable = THREE.Mesh | THREE.Line | THREE.LineSegments | THREE.Points;

function isRenderable(obj: THREE.Object3D): obj is DisposableRenderable {
  return (
    obj instanceof THREE.Mesh ||
    obj instanceof THREE.Line ||
    obj instanceof THREE.LineSegments ||
    obj instanceof THREE.Points
  );
}

function hasNamedNode(obj: THREE.Object3D, targetName: string, stopAt: THREE.Object3D): boolean {
  if (!targetName) return false;
  let curr: THREE.Object3D | null = obj;
  while (curr && curr !== stopAt) {
    if (curr.name === targetName) return true;
    curr = curr.parent;
  }
  return false;
}

function disposeTree(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const images = new Set<ImageBitmap>();
  root.traverse((obj) => {
    if (isRenderable(obj)) {
      geometries.add(obj.geometry);
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) materials.add(m);
    }
  });
  for (const m of materials) {
    for (const v of Object.values(m)) {
      if (v instanceof THREE.Texture) textures.add(v);
    }
    m.dispose();
  }
  for (const t of textures) {
    if (typeof ImageBitmap !== 'undefined' && t.image instanceof ImageBitmap) images.add(t.image);
    t.dispose();
  }
  for (const i of images) i.close();
  for (const g of geometries) g.dispose();
}

type ViewerProps = {
  path: string;
  highlightedNode?: string;
  isolatedNode?: string;
};

export default function Viewer({ path, highlightedNode = '', isolatedNode = '' }: ViewerProps) {
  const host = useRef<HTMLDivElement>(null);
  const reset = useRef<() => void>(() => {});
  const applySelectionRef = useRef<(hi: string, iso: string) => void>(() => {});
  const selectionRef = useRef({ hi: highlightedNode, iso: isolatedNode });
  selectionRef.current = { hi: highlightedNode, iso: isolatedNode };

  const [status, setStatus] = useState('جارٍ تحميل العينة…');

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setStatus('هذا الجهاز لا يدعم العرض ثلاثي الأبعاد. يمكنك قراءة البيانات التشريحية أدناه.');
      return;
    }

    let alive = true;
    let lost = false;
    let frame = 0;
    const controller = new AbortController();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    camera.position.set(3, 2, 3);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

    const canvas = renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'عرض ثلاثي الأبعاد للعينة — استخدم الأسهم للتدوير و+ و- للتكبير وR لإعادة الضبط');
    canvas.setAttribute('role', 'application');
    el.appendChild(canvas);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = false;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x47565b, 2));
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(3, 5, 4);
    scene.add(light);

    const draw = () => {
      if (!alive || lost || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (alive && !lost) renderer.render(scene, camera);
      });
    };

    const resize = () => {
      const w = Math.max(1, el.clientWidth);
      const h = Math.max(1, el.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      draw();
    };

    const onLost = (e: Event) => {
      e.preventDefault();
      lost = true;
      setStatus('توقف عرض الرسوميات. أعد اختيار العينة لاستعادة العرض.');
    };
    const onRestored = () => {
      lost = false;
      draw();
      setStatus('');
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const step = Math.PI / 18;
      const offset = camera.position.clone().sub(controls.target);
      const sph = new THREE.Spherical().setFromVector3(offset);
      let handled = true;
      if (e.key === 'ArrowLeft') sph.theta -= step;
      else if (e.key === 'ArrowRight') sph.theta += step;
      else if (e.key === 'ArrowUp') sph.phi = Math.max(0.1, sph.phi - step);
      else if (e.key === 'ArrowDown') sph.phi = Math.min(Math.PI - 0.1, sph.phi + step);
      else if (e.key === '+' || e.key === '=') sph.radius *= 0.88;
      else if (e.key === '-' || e.key === '_') sph.radius *= 1.14;
      else if (e.key === 'r' || e.key === 'R' || e.key === '0') {
        e.preventDefault();
        reset.current();
        return;
      } else {
        handled = false;
      }
      if (handled) {
        e.preventDefault();
        camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph));
        controls.update();
        draw();
      }
    };

    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    canvas.addEventListener('keydown', onKeyDown);
    controls.addEventListener('change', draw);
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();

    const originalMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const clonedHighlightMaterials: THREE.Material[] = [];
    let loadedRoot: THREE.Object3D | null = null;

    const applySelection = (hi: string, iso: string) => {
      if (!loadedRoot) return;
      for (const m of clonedHighlightMaterials) m.dispose();
      clonedHighlightMaterials.length = 0;

      const root = loadedRoot;
      root.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const orig = originalMaterials.get(obj);
        if (orig) obj.material = orig;
        const inHighlighted = hasNamedNode(obj, hi, root);
        const inIsolated = hasNamedNode(obj, iso, root);
        obj.visible = !iso || inIsolated;
        if (hi && (inHighlighted || inIsolated) && orig) {
          const cloneOne = (mat: THREE.Material) => {
            const c = mat.clone();
            if ('emissive' in c && c.emissive instanceof THREE.Color) {
              c.emissive.setHex(0x1f7a6e);
            }
            clonedHighlightMaterials.push(c);
            return c;
          };
          obj.material = Array.isArray(orig) ? orig.map(cloneOne) : cloneOne(orig);
        }
      });
      draw();
    };
    applySelectionRef.current = applySelection;

    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => {
      if (url.startsWith('blob:') || url.startsWith('data:')) return url;
      throw new Error('External GLB resource blocked');
    });

    const url = new URL(path, new URL(import.meta.env.BASE_URL, document.baseURI));
    fetch(url, { signal: controller.signal, credentials: 'same-origin', redirect: 'error' })
      .then((res) => {
        if (!res.ok) throw Error('fetch');
        return res.arrayBuffer();
      })
      .then((bytes) => new GLTFLoader(manager).parseAsync(bytes, ''))
      .then((gltf) => {
        if (!alive) {
          disposeTree(gltf.scene);
          return;
        }
        const bounds = new THREE.Box3().setFromObject(gltf.scene);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const radius = size.length() / 2;
        if (!Number.isFinite(radius) || radius <= 0) {
          disposeTree(gltf.scene);
          throw Error('bounds');
        }
        gltf.scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh) originalMaterials.set(obj, obj.material);
        });
        loadedRoot = gltf.scene;
        const group = new THREE.Group();
        group.add(gltf.scene);
        group.position.copy(center).negate();
        scene.add(group);

        reset.current = () => {
          const halfV = THREE.MathUtils.degToRad(camera.fov / 2);
          const halfH = Math.atan(Math.tan(halfV) * camera.aspect);
          const distance = (radius / Math.sin(Math.min(halfV, halfH))) * 1.15;
          camera.position.copy(new THREE.Vector3(1, 0.7, 1).normalize().multiplyScalar(distance));
          camera.near = Math.max(radius / 1000, 0.000001);
          camera.far = distance + radius * 50;
          camera.updateProjectionMatrix();
          controls.target.set(0, 0, 0);
          controls.update();
          draw();
        };
        reset.current();
        // Always apply latest selection ref (prevents stale closure if user clicked while loading)
        applySelection(selectionRef.current.hi, selectionRef.current.iso);
        setStatus('');
      })
      .catch(() => {
        if (alive && !controller.signal.aborted) setStatus('تعذر تحميل المجسم أو التحقق من موارده.');
      });

    return () => {
      alive = false;
      controller.abort();
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      controls.removeEventListener('change', draw);
      controls.dispose();
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      canvas.removeEventListener('keydown', onKeyDown);
      for (const m of clonedHighlightMaterials) m.dispose();
      disposeTree(scene);
      renderer.renderLists?.dispose();
      renderer.dispose();
      canvas.remove();
      reset.current = () => {};
      applySelectionRef.current = () => {};
    };
  }, [path]);

  useEffect(() => {
    applySelectionRef.current(highlightedNode, isolatedNode);
  }, [highlightedNode, isolatedNode]);

  return (
    <>
      <div className="canvas" ref={host} />
      <div className="viewer-controls">
        <button type="button" onClick={() => reset.current()}>
          إعادة ضبط زاوية العرض
        </button>
        <span className="hint">لوحة المفاتيح: الأسهم للتدوير، +/- للتكبير، R لإعادة الضبط</span>
      </div>
      {status && <p role="status">{status}</p>}
    </>
  );
}
