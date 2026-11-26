# Skills research shortlist — 2026-11-26
Selection by fit, transparent source, reproducible output, maintenance and safety, not download count. External skills are references, NOT installed or executed; inspect full SKILL.md, companion scripts, license and pinned revision before use. Some candidate pages only available at repository README level; mark accordingly. No generic text-to-3D generation for anatomical evidence.
## Scientific skills (SKILL.md pages inspected)
- K-Dense literature-review: https://github.com/K-Dense-AI/scientific-agent-skills/blob/main/skills/literature-review/SKILL.md — search, screening, deduplication, evidence extraction.
- K-Dense citation-management: https://github.com/K-Dense-AI/scientific-agent-skills/blob/main/skills/citation-management/SKILL.md — DOI/PMID and evidence metadata; verify exact claim separately.
- K-Dense peer-review: https://github.com/K-Dense-AI/scientific-agent-skills/blob/main/skills/peer-review/SKILL.md — methods/provenance critique, not veterinary approval.
- K-Dense pydicom: https://github.com/K-Dense-AI/scientific-agent-skills/blob/main/skills/pydicom/SKILL.md — CT/MRI local inspection and privacy preflight; not segmentation or diagnosis.
- Google DeepMind pubmed_database: https://github.com/google-deepmind/science-skills/blob/main/skills/pubmed_database/SKILL.md — alternative evidence retrieval, check NCBI terms and each article's license; optional key.
## Engineering skills
- Jbmanllr Three.js: https://github.com/Jbmanllr/agent-skills/blob/main/skills/three-js/SKILL.md — vanilla rendering, loading, interaction, controls; opened SKILL page.
- Anthropic webapp-testing: https://github.com/anthropics/skills/blob/main/skills/webapp-testing/SKILL.md — Playwright smoke and screenshots, opened page.
- Vercel react-best-practices: https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/SKILL.md — React performance; Next-specific rules not applicable, opened page.
- emiliodominguez threejs-skills: https://github.com/emiliodominguez/threejs-skills — model-inspect, model-optimize, scene-doctor, asset pipeline; README inspected, individual skill pages unavailable in web fetch; candidate only, scripts require audit. Reject model-generation and arbitrary marketplace assets for medical anatomy.
## Project-specific original skills
Existing anatomy-audit, mobile-viewer, agent-handoff; added veterinary-terminology, evidence-traceability, asset-release, headless-geometry, scientific-qa, skill-security. These are original project procedures inspired by general workflows, not verbatim imports.
No external skill establishes biological correctness. Prefer official NAV and specimen documentation. Tools: Blender command line, Khronos glTF Validator, glTF Transform, optional pydicom/3D Slicer when authorized. Review licenses and pin versions before installing.

## Gemini Neon verification addendum — 2026-11-26
- Audited individual `SKILL.md` files of `emiliodominguez/threejs-skills` at pinned commit `ac4464c` (MIT): `threejs-model-inspect`, `threejs-model-optimize`, `threejs-scene-doctor`, and `threejs-model-customize`. Key transferable lessons adopted into project code/skills without installing external scripts: (1) default `gltf-transform optimize` joins/flattens named meshes and breaks anatomy picking unless disabled; (2) Three.js sanitizes glTF node names with dots/spaces (`.001`), now blocked at CI via `SAFE_NODE_NAME_RE`; (3) clone materials before per-structure highlighting to avoid mutating shared materials, now implemented in `src/Viewer.tsx`.
- Checked Ibrahim's GitHub repositories (`aibrahamdrbaa-dot`); existing skill repositories (`Roy-skills`, `report-writing-skills`, `logo-design-skill`, `geo-sleuth`, `lemo-opuscar`) target creative/writing/general workflows rather than veterinary anatomy, so no external import from them is needed here.
