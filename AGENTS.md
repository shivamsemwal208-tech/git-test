# AGENTS.md — FlashGuard

## What this project is

FlashGuard is an AI-powered flash-flood risk assessment system for hilly/mountainous regions. The backend (Phase 3) now serves **real live data** — Open-Meteo weather, a baseline ML risk prediction, and DFO recorded-flood history — while the frontend command center also retains deterministic demo/simulation surfaces that must never be presented as live.

## Critical constraint

**Demo/simulation data must never be presented as live or real data.** Never relabel simulated values as live; live sources (weather, ML prediction, recorded history) must preserve their own source/status labels. The five reference files in the repo root (`OVERFLOW PROJECT.pdf`, `*.jpeg`) are source material and must never be modified.

## Running the frontend

```bash
cd frontend
npm install
npm run dev        # dev server at localhost:5173
npm test           # vitest test suite (frontend/tests/)
npm run build      # production build (runs tsc -b then vite build)
npm run lint       # ESLint with react-hooks + react-refresh rules
```

On some Windows setups PowerShell blocks `npm` — use `npm.cmd` instead.

## Verification order

Frontend: `npm run lint` → `npm test` → `npm run build` (includes `tsc -b`)

Backend: `python -m pytest` from the repo root (with `backend/requirements.txt` installed).

## Backend (Phase 3 — live services)

- FastAPI app at `backend/app/main.py`; run `uvicorn backend.app.main:app --reload`
- CORS configured for localhost:5173/5174
- Live endpoints: `/api/v1/weather/*` (Open-Meteo), `POST /api/v1/risk/assess` (rainforce ML
  baseline, `backend/app/risk_engine/`), `/api/v1/seismic/latest` (USGS),
  `/api/v1/rivers/nearby` (real HydroRIVERS v1.0 river geometry),
  `/api/v1/safe-places/nearby` (real OpenStreetMap candidate destinations via the Overpass API),
  plus the shared resources. Explicit `simulate: true` returns deterministic demo data — demo
  values are never substituted into live responses.
- Data-source adapters live in `backend/app/data_sources/` (`weather_provider`,
  `terrain_provider`, `history_provider`, `river_provider`, `safe_place_provider`). Recorded
  flood history comes from the local DFO event index (`data/processed/dfo_event_index/`, built by
  `ml/src/build_dfo_anchor_index.py`; dir overridable via `FLASHGUARD_HISTORY_INDEX_DIR`) and is
  **informational only** — it is never an ML feature and never changes a prediction. River
  geometry comes from the local HydroRIVERS index (`data/processed/river_index/`, dir
  overridable via `FLASHGUARD_RIVER_INDEX_DIR`) and is also never an ML feature. Safe places come
  live from Overpass (`FLASHGUARD_OVERPASS_URL`, default `https://overpass-api.de/api/interpreter`)
  and are candidate destinations only — never certified safe sites and never an ML feature. The
  legacy `/api/v1/safe-places` route is 100% demo and must not be relabeled live.

## Architecture notes

- Frontend uses **feature-based structure**: `src/features/<feature>/` each with its own page component
- State flows through `CommandProvider` context (`src/features/command-center/command-context.tsx`)
- Demo/simulation fixtures live in `src/data/demo-*.ts` and flow through the single fixture
  adapter `src/services/demo-command-service.ts`. Real/live surfaces bypass fixtures: the Live
  Map (`src/features/map/live-map-page.tsx`) calls the backend directly via `src/api/risk-api.ts`,
  `src/api/rivers-api.ts` (`fetchNearbyRiverSegments`) and
  `src/api/safe-places-api.ts` (`fetchSafePlaces`, candidate destinations on OpenStreetMap).
- Map rendering: React Leaflet + OpenStreetMap/OpenTopoMap tiles. Two surfaces:
  - `src/components/map/command-map.tsx` — shared by command-center, emergency, and evacuation
    pages (deterministic demo/simulation overlays, never labeled live).
  - `src/features/map/flood-intelligence-map.tsx` — the **Live Map** (`/map`): real-selected
    location marker, real DFO event markers anchored by anchor-vertex coordinates, real
    HydroRIVERS polylines, candidate safe-place markers (OpenStreetMap, candidates only — never
    certified safe sites, never routing, never an ML feature), a compact risk-status overlay with
    honest unavailable/demo labels, layer control and legend limited to real-data-backed layers.
    Pure layer state/selectors live in `src/features/map/flood-intelligence-state.ts`.
- Styling: Tailwind CSS v4 via `@tailwindcss/vite` plugin
- Routing: React Router DOM v7
- Recorded-history context (implemented): `backend/app/data_sources/history_index.py` owns the
  `data/processed/dfo_event_index/` format (anchor-vertex semantics shared with
  `ml/src/build_dataset.py`); `history_provider.py` serves it; the live risk response carries
  the `historical` block (including anchor `latitude`/`longitude` on each event) and the
  FloodRiskPage and Live Map render it. Informational only — never a feature.

## Repo conventions

- Branch from `main` with focused names (e.g., `feat/dashboard-shell`)
- One feature or fix per PR
- Update `docs/` when API, data contract, or model decisions change
- Never commit: `.env`, `node_modules/`, `dist/`, `ml/models/*`, `data/raw/*`, `data/processed/*`
- `.env.example` files exist as templates for future phases

## Safety rules

- FLASHGUARD must never claim earthquake prediction
- Safe-place/route guidance must communicate assumptions, never guarantee safety
- Model accuracy claims require location/time-aware validation on real data
- All time-varying data must preserve timestamp, timezone, source, unit, and status label
