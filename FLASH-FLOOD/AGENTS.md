# AGENTS.md — FlashGuard

## What this project is

FlashGuard is an AI-powered flash-flood risk assessment system for hilly/mountainous regions. **Currently at Phase 2**: a React frontend command center using deterministic demo/simulation data only. No backend, ML model, database, or live API exists yet.

## Critical constraint

**All displayed data is synthetic demo/scenario data.** Never represent simulated values as live or real data. The five reference files in the repo root (`OVERFLOW PROJECT.pdf`, `*.jpeg`) are source material and must never be modified.

## Running the frontend

```bash
cd frontend
npm install
npm run dev        # dev server at localhost:5173
npm run build      # production build (runs tsc -b then vite build)
npm run lint       # ESLint with react-hooks + react-refresh rules
```

On some Windows setups PowerShell blocks `npm` — use `npm.cmd` instead.

## Verification order

`npm run lint` → `npm run build` (includes `tsc -b`)

There is no test runner configured yet (`frontend/tests/` and `backend/tests/` are empty `.gitkeep`).

## Backend (Phase 3 — skeleton exists but not runnable)

- FastAPI app at `backend/app/main.py`
- Requires `pip install -r backend/requirements.txt` (fastapi, uvicorn)
- Run: `uvicorn backend.app.main:app --reload`
- CORS configured for localhost:5173/5174
- No real endpoints yet; health check returns `DEMO` status

## Architecture notes

- Frontend uses **feature-based structure**: `src/features/<feature>/` each with its own page component
- State flows through `CommandProvider` context (`src/features/command-center/command-context.tsx`)
- All data comes from `src/data/demo-*.ts` fixtures; the single service adapter is `src/services/demo-command-service.ts`
- Map rendering: React Leaflet + OpenStreetMap tiles (`src/components/map/command-map.tsx`)
- Styling: Tailwind CSS v4 via `@tailwindcss/vite` plugin
- Routing: React Router DOM v7

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
