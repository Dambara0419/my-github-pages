# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server (Vite)
npm run build      # Build for production (also copies dist/index.html → dist/404.html for GitHub Pages SPA routing)
npm run lint       # Run ESLint
npm run preview    # Preview production build locally
npm run deploy     # Build + deploy to GitHub Pages via gh-pages
```

No test suite is configured.

## Architecture

React 19 SPA deployed to GitHub Pages at base path `/my-github-pages/` (set in `vite.config.js`). Uses `react-router-dom` with `BrowserRouter` and `basename={import.meta.env.BASE_URL}`. The `dist/404.html` copy in the build step is the standard workaround for GitHub Pages SPA routing (serving index.html on 404s).

**Routing** is defined in `src/App.jsx`. To add a new page: create `src/pages/YourPage.jsx`, import it in `App.jsx`, add a `<Route>`, and add a card entry to the `pages` array in `src/pages/Home.jsx`.

### Pages

- `/` — `Home.jsx`: Link grid to all experiment pages
- `/otohifu` — `otohifu.jsx`: Web Audio API oscillator with a vertical fader UI (100–2000 Hz, pointer events for touch/mouse)
- `/otohifu_accelator` — `otohifu_accelator.jsx`: Same oscillator but frequency driven by `DeviceMotionEvent` (accelerometer). Requires iOS permission prompt via `DeviceMotionEvent.requestPermission()`.
- `/ca` — `ca.jsx`: Conway's Game of Life on a `<canvas>` (50×50, 10px cells, ~10fps via `setTimeout` + `requestAnimationFrame`)
- `/img2obj` — `img2obj.jsx`: Image-to-3MF converter for Bambu Lab AMS multi-color printing. Pipeline: upload image → crop/zoom on canvas → K-means++ color quantization → build per-color box meshes → export `.3mf` (ZIP containing 3D Manufacturing Format XML). Three.js is used for the 3D preview with OrbitControls.

### Styling

Tailwind CSS v4 via the `@tailwindcss/vite` plugin (no `tailwind.config.js` needed). Write utility classes directly in JSX.

### Key implementation details

- `img2obj.jsx` uses a micro-EPS offset (`EPS = 0.01mm`) on every box mesh to prevent face-sharing between adjacent color objects, which causes path conflicts in BambuStudio.
- Color meshes in the 3MF use local z=0–1 coordinates; when a base layer is enabled, the `<item transform>` matrix translates them +1mm in z (not baked into vertices) so BambuStudio doesn't drop each object to the floor independently.
- `no-unused-vars` is configured to ignore `^[A-Z_]` pattern (constants), so uppercase constants can be declared without triggering ESLint errors.
