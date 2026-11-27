# Site expansion & visual identity — Roy, 2026-11-27
Production serves site/ directly (wrangler.jsonc). The existing Vite React foundation is separate; its green CI alone does not validate production HTML.
## Information architecture
Home → animals → species → system studio → region → specimen/structure. Articles have their own index and slug route; sources and about are global. Hash routes remain compatible with existing links and Cloudflare redirects. Unknown routes show an explicit not-found state instead of the homepage.
## Extending
Add a unique species slug and localized name/Latin name/image/status in site/assets/atlas-registry.js. Add systems with stable id, labels, status, description, url and catalogUrl when actually available. A real system still requires a validated catalog, studio, local assets, provenance/rights and scientific review status. The shared species template and search consume the registry automatically. Keep specimens distinct; do not generate missing anatomy. No fake availability counts.
Article record fields: slug, titleAr, summaryAr, paragraphsAr (array of text), references (array of text), reviewStatusAr, status ("published" only when explicitly approved). Do not put private drafts in a public static registry. No article shipped in this PR. No CMS/database introduced.
Brand: vector traced from owner-provided raster mark (simplified contours; not a new symbol); teal #044442 sampled from reference; ivory #F7F4EC retained to match existing animated mascot sprites. Shared brand.css, mark.svg and square icon. Preserve warning semantics and native WebGL colors; no changes to scientific assets.
## Skill use
Consulted Roy-skills site-architecture (blob f0895970fa4126e8ac32e685575fab826f38a1c0), design-system (2728a9ccd43cd67205efe5a64828dd221d55dd2c), frontend-design (a5333457c414d20d625f307df945842c0952ecc3) for general principles only; no external implementation copied or scripts run. Project AGENTS.md and mobile-viewer / skill-security SKILL.md consulted.
## Review
Correct dog-specific page title, navigation, loading label and remove unrelated feline book reference from dog page. Retain all catalogs and GLB unchanged. PR #3 remains a prior design-direction document; no runtime changes in that PR. Browser/real-phone testing and visual comparison remain required before merging.
