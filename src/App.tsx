import { lazy, Suspense, useState } from 'react';
import raw from '../data/catalog.json';
import type { AnatomyClaim, Catalog } from './catalog';
import ErrorBoundary from './ErrorBoundary';

const Viewer = lazy(() => import('./Viewer'));
const catalog = raw as unknown as Catalog;
const assets = catalog.assets.filter(
  (a) => a.review.status === 'expert-reviewed' && a.rightsReview.status === 'expert-reviewed'
);

const CLAIM_LABELS: Record<AnatomyClaim['type'], string> = {
  description: 'الوصف',
  origin: 'المنشأ',
  insertion: 'المرتكز',
  innervation: 'التعصيب',
  'blood-supply': 'التروية الدموية',
  function: 'الوظيفة',
  'clinical-note': 'ملاحظة سريرية',
};

function safeHttpsUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.href : undefined;
  } catch {
    return undefined;
  }
}

export default function App() {
  const [selected, setSelected] = useState('');
  const [activeNode, setActiveNode] = useState('');
  const [isolated, setIsolated] = useState(false);

  const asset = assets.find((a) => a.id === selected);
  const specimen = catalog.specimens.find((s) => s.id === asset?.specimenId);
  const activeBinding = asset?.bindings.find((b) => b.node === activeNode);
  const activeStructure = catalog.structures.find((s) => s.id === activeBinding?.structureId);
  const sourceHref = asset ? safeHttpsUrl(asset.source.url) : undefined;
  const licenseHref = asset ? safeHttpsUrl(asset.source.licenseUrl) : undefined;
  const isNC = Boolean(asset?.source.license.includes('-NC-') || asset?.source.nonCommercial);

  const onSelectAsset = (id: string) => {
    setSelected(id);
    setActiveNode('');
    setIsolated(false);
  };

  return (
    <>
      <header>
        <span className="eyebrow" lang="en" dir="ltr">
          THE ARABIC VET ATLAS · FOUNDATION
        </span>
        <h1>الأطلس البيطري العربي</h1>
        <p>تشريح تفاعلي ثلاثي الأبعاد مبني على عينات ومصادر موثّقة.</p>
      </header>

      <main>
        <aside>
          <h2>مكتبة تشريح الكلب</h2>
          <label htmlFor="asset">العينة التشريحية</label>
          <select id="asset" value={selected} onChange={(e) => onSelectAsset(e.target.value)}>
            <option value="">اختر عينة</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.titleAr}
              </option>
            ))}
          </select>
          {!assets.length && <p>لا توجد مجسمات معتمدة بعد. نعمل على تدقيق المصادر والتراخيص أولًا.</p>}
        </aside>

        <section aria-label="عارض التشريح" className="stage">
          {asset ? (
            <>
              <ErrorBoundary>
                <Suspense fallback={<p role="status">جارٍ تجهيز العارض…</p>}>
                  <Viewer
                    key={asset.id}
                    path={asset.model.path}
                    highlightedNode={activeNode}
                    isolatedNode={isolated ? activeNode : ''}
                  />
                </Suspense>
              </ErrorBoundary>

              <h2>{asset.titleAr}</h2>
              <p dir="ltr" lang="en">
                {asset.titleEn}
              </p>
              <p>
                {specimen?.breed} · <bdi dir="ltr">{asset.source.license}</bdi>
                {isNC ? ' · تعليمي غير تجاري' : ''}
              </p>
              <p>{asset.source.attribution}</p>
              <p>
                {sourceHref && (
                  <a href={sourceHref} target="_blank" rel="noopener noreferrer">
                    المصدر العلمي
                  </a>
                )}
                {sourceHref && licenseHref ? ' · ' : ''}
                {licenseHref && (
                  <a href={licenseHref} target="_blank" rel="noopener noreferrer">
                    الترخيص
                  </a>
                )}
              </p>

              <h3>البنى المرتبطة بالعينة</h3>
              <ul className="structure-list">
                {asset.bindings.map((b) => {
                  const s = catalog.structures.find((st) => st.id === b.structureId);
                  if (!s) return null;
                  const isActive = activeNode === b.node;
                  return (
                    <li key={b.node}>
                      <button
                        type="button"
                        className={isActive ? 'active' : ''}
                        aria-pressed={isActive}
                        onClick={() => {
                          setActiveNode(isActive ? '' : b.node);
                          if (isActive) setIsolated(false);
                        }}
                      >
                        {s.names.ar} — <bdi lang="la" dir="ltr">{s.names.la}</bdi>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {activeStructure && (
                <div className="structure-detail">
                  <div className="detail-head">
                    <h4>
                      {activeStructure.names.ar} (<bdi lang="la" dir="ltr">{activeStructure.names.la}</bdi>)
                    </h4>
                    <button type="button" aria-pressed={isolated} onClick={() => setIsolated((v) => !v)}>
                      {isolated ? 'إظهار كامل العينة' : 'عزل هذه البنية'}
                    </button>
                  </div>
                  <p dir="ltr" lang="en">
                    {activeStructure.names.en}
                    {activeStructure.ontology?.uberonId ? ` · ${activeStructure.ontology.uberonId}` : ''}
                  </p>
                  {activeStructure.claims && activeStructure.claims.length > 0 && (
                    <dl className="claims">
                      {activeStructure.claims.map((cl, i) => (
                        <div key={`${cl.type}-${i}`}>
                          <dt>{CLAIM_LABELS[cl.type]}</dt>
                          <dd>
                            {cl.status === 'verified'
                              ? cl.ar
                              : cl.status === 'unknown'
                                ? 'غير موثّق بعد'
                                : 'غير منطبق'}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="empty">
              <span aria-hidden="true">◇</span>
              <h2>مساحة العرض ثلاثي الأبعاد</h2>
              <p>ستظهر هنا العينات بعد التحقق العلمي والترخيص.</p>
            </div>
          )}
        </section>
      </main>

      <footer>نسخة تأسيسية · للتعليم فقط، وليست مرجعًا سريريًا.</footer>
    </>
  );
}
