# Phantom Analysis Workbench — Site Vision

## 1. Vision
An interactive, browser-based command center for Phantom's chaos math engine. It allows researchers and traders to visualize attractors, detect regime shifts, and tune high-dimensional parameters (FTLE, ESN, Embedding) with real-time visual feedback.

## 2. Stitch Project
- **Project Name:** Phantom Analysis Workbench
- **Project ID:** (Will be populated on first run)

## 3. Tech Stack
- **Frontend:** Next.js + React + Plotly.js + Tailwind CSS
- **Backend:** Rust + Axum (Existing Phantom library)

## 4. Sitemap
- [ ] **Main Workbench (`/`)** — 2x2 grid of chaos visualizations (Chaos Timeline, Phase Space, FTLE Heatmap, ESN Prediction).
- [ ] **Parameter Sidebar** — Interactive sliders for $m, \tau, k_{fit}, \lambda$, etc.
- [ ] **Data Loader** — Live feed status and manual data entry (Paste/CSV).

## 5. Roadmap
- [ ] Phase 1: Main Dashboard Layout & Chaos Score Timeline (View 1)
- [ ] Phase 2: 3D Phase Space Embedding (View 2)
- [ ] Phase 3: FTLE Field Heatmap (View 3)
- [ ] Phase 4: ESN Prediction vs Actual (View 4)
- [ ] Phase 5: Parameter Tuner Sidebar & API Integration (View 5)
- [ ] Phase 6: Feed Status & Data Loader (View 6)

## 6. Creative Freedom
- [ ] Add a "Chaos Playback" mode that animates the attractor's growth.
- [ ] Add a "Regime Alert" notification system in the UI.
- [ ] Support for comparing two different assets' attractors side-by-side.
