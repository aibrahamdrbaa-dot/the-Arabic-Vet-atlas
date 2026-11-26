import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
function disposeTree(root:THREE.Object3D){
 const geometries=new Set<THREE.BufferGeometry>(), materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>(),images=new Set<ImageBitmap>();
 root.traverse(obj=>{if(obj instanceof THREE.Mesh){geometries.add(obj.geometry);for(const m of Array.isArray(obj.material)?obj.material:[obj.material])materials.add(m);}});
 for(const m of materials){for(const v of Object.values(m)){if(v instanceof THREE.Texture)textures.add(v);}m.dispose();}
 for(const t of textures){if(typeof ImageBitmap!=='undefined'&&t.image instanceof ImageBitmap)images.add(t.image);t.dispose();}
 for(const i of images)i.close();for(const g of geometries)g.dispose();
}
export default function Viewer({path}:{path:string}){
 const host=useRef<HTMLDivElement>(null),reset=useRef<()=>void>(()=>{});const [status,setStatus]=useState('جارٍ تحميل العينة…');
 useEffect(()=>{
  const el=host.current;if(!el)return;let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});}catch{setStatus('هذا الجهاز لا يدعم العرض ثلاثي الأبعاد.');return;}
  let alive=true,lost=false,frame=0;const controller=new AbortController(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,.01,1000);camera.position.set(3,2,3);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));el.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','عرض ثلاثي الأبعاد للعينة');renderer.domElement.setAttribute('role','img');
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;
  scene.add(new THREE.HemisphereLight(0xffffff,0x47565b,2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(3,5,4);scene.add(light);
  const draw=()=>{if(!alive||lost||frame)return;frame=requestAnimationFrame(()=>{frame=0;if(alive&&!lost)renderer.render(scene,camera);});};
  const resize=()=>{const w=Math.max(1,el.clientWidth),h=Math.max(1,el.clientHeight);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);draw();};
  const onLost=(e:Event)=>{e.preventDefault();lost=true;setStatus('توقف عرض الرسوميات. أعد اختيار العينة لاستعادة العرض.');};
  const onRestored=()=>{lost=false;draw();setStatus('');};
  renderer.domElement.addEventListener('webglcontextlost',onLost);renderer.domElement.addEventListener('webglcontextrestored',onRestored);
  controls.addEventListener('change',draw);const observer=new ResizeObserver(resize);observer.observe(el);resize();
  const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{if(url.startsWith('blob:')||url.startsWith('data:'))return url;throw new Error('External GLB resource blocked');});
  const url=new URL(path,new URL(import.meta.env.BASE_URL,document.baseURI));
  fetch(url,{signal:controller.signal,credentials:'same-origin',redirect:'error'}).then(res=>{if(!res.ok)throw Error('fetch');return res.arrayBuffer();}).then(bytes=>new GLTFLoader(manager).parseAsync(bytes,'')).then(gltf=>{
   if(!alive){disposeTree(gltf.scene);return;}
   const bounds=new THREE.Box3().setFromObject(gltf.scene),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
   const radius=size.length()/2;if(!Number.isFinite(radius)||radius<=0){disposeTree(gltf.scene);throw Error('bounds');}
   const group=new THREE.Group();group.add(gltf.scene);group.position.copy(center).negate();scene.add(group);
   reset.current=()=>{const halfV=THREE.MathUtils.degToRad(camera.fov/2),halfH=Math.atan(Math.tan(halfV)*camera.aspect),distance=radius/Math.sin(Math.min(halfV,halfH))*1.15;camera.position.copy(new THREE.Vector3(1,.7,1).normalize().multiplyScalar(distance));camera.near=Math.max(radius/1000,.000001);camera.far=distance+radius*50;camera.updateProjectionMatrix();controls.target.set(0,0,0);controls.update();draw();};
   reset.current();setStatus('');
  }).catch(()=>{if(alive&&!controller.signal.aborted)setStatus('تعذر تحميل المجسم أو التحقق من موارده.');});
  return()=>{alive=false;controller.abort();if(frame)cancelAnimationFrame(frame);observer.disconnect();controls.removeEventListener('change',draw);controls.dispose();renderer.domElement.removeEventListener('webglcontextlost',onLost);renderer.domElement.removeEventListener('webglcontextrestored',onRestored);disposeTree(scene);renderer.dispose();renderer.domElement.remove();reset.current=()=>{};};
 },[path]);
 return <><div className="canvas" ref={host}/><button type="button" onClick={()=>reset.current()}>إعادة ضبط زاوية العرض</button>{status&&<p role="status">{status}</p>}</>;
}
