import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
function disposeTree(root:THREE.Object3D){
 root.traverse(obj=>{if(obj instanceof THREE.Mesh){obj.geometry.dispose();for(const m of Array.isArray(obj.material)?obj.material:[obj.material]){for(const v of Object.values(m)){if(v instanceof THREE.Texture)v.dispose();}m.dispose();}}});
}
export default function Viewer({path}:{path:string}){
 const host=useRef<HTMLDivElement>(null);const [status,setStatus]=useState('جارٍ تحميل العينة…');
 useEffect(()=>{
  const el=host.current;if(!el)return;let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});}catch{setStatus('هذا الجهاز لا يدعم العرض ثلاثي الأبعاد.');return;}
  let alive=true,frame=0;const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,.01,1000);camera.position.set(3,2,3);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));el.appendChild(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;
  scene.add(new THREE.HemisphereLight(0xffffff,0x47565b,2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(3,5,4);scene.add(light);
  const resize=()=>{const w=Math.max(1,el.clientWidth),h=Math.max(1,el.clientHeight);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);};
  const observer=new ResizeObserver(resize);observer.observe(el);resize();
  new GLTFLoader().load(new URL(path,document.baseURI).href,gltf=>{
   if(!alive){disposeTree(gltf.scene);return;}
   const bounds=new THREE.Box3().setFromObject(gltf.scene),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
   const radius=Math.max(size.x,size.y,size.z);if(!Number.isFinite(radius)||radius<=0){disposeTree(gltf.scene);setStatus('العينة غير صالحة للعرض.');return;}
   gltf.scene.position.sub(center);scene.add(gltf.scene);const d=radius*2.6;
   camera.position.set(d*.8,d*.55,d*.8);camera.near=Math.max(radius/1000,.000001);camera.far=radius*100;camera.updateProjectionMatrix();controls.target.set(0,0,0);controls.update();setStatus('');
  },undefined,()=>{if(alive)setStatus('تعذر تحميل المجسم.');});
  const loop=()=>{if(!alive)return;controls.update();renderer.render(scene,camera);frame=requestAnimationFrame(loop);};loop();
  return()=>{alive=false;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();disposeTree(scene);renderer.dispose();renderer.domElement.remove();};
 },[path]);
 return <><div className="canvas" ref={host}/>{status&&<p role="status">{status}</p>}</>;
}
