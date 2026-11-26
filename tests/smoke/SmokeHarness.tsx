import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Viewer from '../../src/Viewer';
import '../../src/style.css';

function SmokeHarness() {
  const [modelPath, setModelPath] = useState('smoke-fixture.glb');
  const [activeNode, setActiveNode] = useState('');
  const [isolated, setIsolated] = useState(false);

  return (
    <main style={{ gridTemplateColumns: '1fr' }}>
      <section className="stage">
        <h1>اختبار عارض P0 — مجسم هندسي غير تشريحي</h1>
        <Viewer path={modelPath} highlightedNode={activeNode} isolatedNode={isolated ? activeNode : ''} />
        <div className="structure-list">
          <button id="btn-multipart" type="button" onClick={() => setActiveNode('fixture_multipart_group')}>
            تحديد مجموعة متعددة الأجزاء
          </button>
          <button id="btn-single" type="button" onClick={() => setActiveNode('fixture_single_part')}>
            تحديد جزء مفرد
          </button>
          <button id="btn-isolate" type="button" onClick={() => setIsolated((v) => !v)}>
            عزل / إظهار الكل
          </button>
          <button id="btn-delayed" type="button" onClick={() => { setIsolated(false); setModelPath('smoke-fixture-delayed.glb'); }}>
            تحميل متأخر
          </button>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SmokeHarness />
  </StrictMode>
);
