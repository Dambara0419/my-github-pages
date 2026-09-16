# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Astro dev server (http://localhost:4321/my-github-pages/)
npm run build      # Static build into dist/ (one HTML file per page)
npm run lint       # Run ESLint (JS/JSX only; .astro files are not linted)
npm run preview    # Preview production build locally (runs as a background daemon; stop with `npx astro preview stop`)
npm run deploy     # Build + deploy dist/ to the gh-pages branch via gh-pages
```

No test suite is configured. Requires Node >= 22.12.

## Architecture

Astro 7 static site (MPA) with React 19 islands, deployed to GitHub Pages at base path `/my-github-pages` (set in `astro.config.mjs`). Every page is prerendered to its own HTML file (`dist/<page>/index.html`), so there is no client-side router and no SPA 404 workaround. `src/pages/404.astro` becomes `dist/404.html`.

- `src/pages/*.astro` — one file per route (file-based routing).
- `src/components/*.jsx` — interactive React components, mounted from pages with `client:load`. Each page only ships the JS its component needs (three.js/jszip load only on `/img2obj`).
- `src/layouts/Layout.astro` — shared `<html>`/`<head>` (lang, title `<title> | Experiment Hub`, description/OGP, favicon) and the dark page background on `<body>`.
- `src/utils/withBase.js` — `withBase('/path')` prefixes the base path. Use it for every internal link and asset URL (both in `.astro` and `.jsx`); plain `/path` links would miss `/my-github-pages`.
- `public/` — copied as-is. `public/thatcher.html` is a standalone page (not Astro/React) that loads MediaPipe from jsDelivr.

**Adding a page:** create `src/components/YourTool.jsx`, create `src/pages/your_page.astro` that wraps it in `<Layout title="..." description="...">` with `<YourTool client:load />`, and add a card to the `pages` array in `src/pages/index.astro`. Internal links use a trailing slash (`/your_page/`).

### Pages

- `/` — `index.astro`: Link grid to all experiment pages (static HTML, no JS)
- `/otohifu/` — `Otohifu.jsx`: Web Audio API oscillator with a vertical fader UI (100–2000 Hz, pointer events for touch/mouse)
- `/otohifu_accelator/` — `OtohifuAcc.jsx`: Same oscillator but frequency driven by `DeviceMotionEvent` (accelerometer). Requires iOS permission prompt via `DeviceMotionEvent.requestPermission()`.
- `/ca/` — `GameOfLife.jsx`: Conway's Game of Life on a `<canvas>` (50×50, 10px cells, ~10fps via `setTimeout` + `requestAnimationFrame`)
- `/img2obj/` — `Img2Obj.jsx`: Image-to-3MF converter for Bambu Lab AMS multi-color printing. Pipeline: upload image → crop/zoom on canvas → K-means++ color quantization → build per-color box meshes → export `.3mf` (ZIP containing 3D Manufacturing Format XML). Three.js is used for the 3D preview with OrbitControls.
- `/thatcher.html` — `public/thatcher.html`: Thatcher illusion using the user's camera (standalone HTML + MediaPipe Tasks Vision)

### Styling

Tailwind CSS v4 via the `@tailwindcss/vite` plugin, imported once in `src/styles/global.css` (loaded by `Layout.astro`). Write utility classes directly in JSX/Astro. Keep global CSS limited to the Tailwind import: unlayered CSS always overrides Tailwind's layered utilities.

### Deployment

GitHub Pages serves the `gh-pages` branch with the legacy (Jekyll) build. Jekyll ignores `_`-prefixed directories, so the deploy script passes `--nojekyll`; without it Astro's `dist/_astro/` assets would 404.

### Key implementation details

- `Img2Obj.jsx` uses a micro-EPS offset (`EPS = 0.01mm`) on every box mesh to prevent face-sharing between adjacent color objects, which causes path conflicts in BambuStudio.
- Color meshes in the 3MF use local z=0–1 coordinates; when a base layer is enabled, the `<item transform>` matrix translates them +1mm in z (not baked into vertices) so BambuStudio doesn't drop each object to the floor independently.
- `no-unused-vars` is configured to ignore `^[A-Z_]` pattern (constants), so uppercase constants can be declared without triggering ESLint errors.
- `eslint-plugin-react-hooks` v7 enforces React Compiler rules: no ref writes during render, and no referencing a component-scope function before its declaration (e.g. in an effect cleanup).
