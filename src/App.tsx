import {lazy,Suspense,useState} from 'react';
import raw from '../data/catalog.json';
import type {Catalog} from './catalog';
const Viewer=lazy(()=>import('./Viewer'));
const catalog=raw as unknown as Catalog;
const assets=catalog.assets.filter(a=>a.review.status==='expert-reviewed'&&a.rightsReview.status==='expert-reviewed');
export default function App(){
 const [selected,setSelected]=useState('');
 const asset=assets.find(a=>a.id===selected);
 const specimen=catalog.specimens.find(s=>s.id===asset?.specimenId);
 return <><header><span className="eyebrow" lang="en" dir="ltr">THE ARABIC VET ATLAS · FOUNDATION</span><h1>الأطلس البيطري العربي</h1><p>تشريح تفاعلي ثلاثي الأبعاد مبني على عينات ومصادر موثّقة.</p></header>
 <main><aside><h2>مكتبة تشريح الكلب</h2><label htmlFor="asset">العينة التشريحية</label><select id="asset" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">اختر عينة</option>{assets.map(a=><option key={a.id} value={a.id}>{a.titleAr}</option>)}</select>{!assets.length&&<p>لا توجد مجسمات معتمدة بعد. نعمل على تدقيق المصادر والتراخيص أولًا.</p>}</aside>
 <section aria-label="عارض التشريح" className="stage">{asset?<><Suspense fallback={<p role="status">جارٍ تجهيز العارض…</p>}><Viewer key={asset.id} path={asset.model.path}/></Suspense><h2>{asset.titleAr}</h2><p dir="ltr" lang="en">{asset.titleEn}</p><p>{specimen?.breed} · {asset.source.license}</p><p>{asset.source.attribution}</p><p><a href={asset.source.url}>المصدر العلمي</a> · <a href={asset.source.licenseUrl}>الترخيص</a></p><h3>البنى المرتبطة بالعينة</h3><ul>{asset.bindings.map(b=>{const s=catalog.structures.find(s=>s.id===b.structureId);return s?<li key={b.node}>{s.names.ar} — <bdi lang="la">{s.names.la}</bdi></li>:null;})}</ul></>:<div className="empty"><span aria-hidden="true">◇</span><h2>مساحة العرض ثلاثي الأبعاد</h2><p>ستظهر هنا العينات بعد التحقق العلمي والترخيص.</p></div>}</section></main>
 <footer>نسخة تأسيسية · للتعليم فقط، وليست مرجعًا سريريًا.</footer></>;
}
