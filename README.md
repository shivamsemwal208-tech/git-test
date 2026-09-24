# FLASHGUARD

FLASHGUARD is an AI-powered flash-flood risk assessment and early-warning project for hilly and mountainous regions. Its future workflow will combine weather, rainfall accumulation, terrain, hydrology, soil, and historical flood information to estimate flood probability for a selected location.

> **Current status: Frontend command-center transformation complete.** The interface uses deterministic simulated scenario data and illustrative map overlays only. No backend, ML model, database, live API, or flood prediction logic has been implemented yet.

## Project goals

- Present a location-specific flood probability and risk category.
- Explain evidence-based contributing factors such as rainfall, saturated soil, steep slope, and river proximity.
- Visualize risk through an interactive map.
- Provide clearly qualified warnings and safe-place guidance.
- Keep demo/simulated data visibly distinct from real/live data.

## Planned risk bands

| Flood probability | Risk level |
| --- | --- |
| 0% to below 30% | LOW |
| 30% to below 60% | MODERATE |
| 60% to below 80% | HIGH |
| 80% to 100% | CRITICAL |

These bands are a planned product rule, not a currently implemented risk engine.

## Repository layout

- `frontend/`: planned React dashboard and GIS interface
- `backend/`: planned FastAPI service
- `ml/`: planned data preparation, training, and evaluation work
- `data/`: data contracts plus future demo, geospatial, and local datasets
- `docs/`: architecture, setup, API, data, and model documentation
- `tests/`: cross-project tests when implementation starts

See [architecture.md](docs/architecture.md) for the planned design and [setup.md](docs/setup.md) for Phase 1 setup notes.

## Reference materials

The following files are source reference material and must remain untouched:

- `OVERFLOW PROJECT.pdf`
- `recover better.jpeg`
- `reduce the impact.jpeg`
- `tech.jpeg`
- `what can we do.jpeg`

## Development status

| Phase | Status |
| --- | --- |
| 1. Foundation and documentation | Complete |
| 2. Frontend command center | Complete — simulated data only |
| 3. FastAPI demo service | Not started |
| 4+. Risk engine, GIS, data, ML, and integrations | Not started |

## Safety and data integrity

- FLASHGUARD must not claim earthquake prediction.
- Do not represent simulated data as live data.
- Do not claim model accuracy or other metrics until they are evaluated on suitable real data.
- Follow official local authority guidance during an emergency.
- Never commit secrets; use a local `.env` file when future integrations require it.

## Run the Phase 2 dashboard

```powershell
Set-Location frontend
npm install
npm run dev
```

Open the local URL displayed by Vite, usually `http://localhost:5173`.

See [frontend-command-center.md](docs/frontend-command-center.md) for the frontend architecture, demo-data boundaries, and future API adapter points.
