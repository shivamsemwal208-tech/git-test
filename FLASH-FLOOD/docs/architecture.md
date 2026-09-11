# FlashGuard planned architecture

## Scope of this document

This is an approved design reference for future phases. It does not indicate that any service, model, map, route, API, or database already exists.

## System flow

```text
Location + weather/terrain/hydrology inputs
            ↓
Data validation and feature preparation
            ↓
ML inference or labelled demo scenario logic
            ↓
Flood probability → risk classification → factor explanation
            ↓
FastAPI response → dashboard, GIS map, and warning UI
```

## Module boundaries

| Area | Future responsibility |
| --- | --- |
| `frontend/` | React/TypeScript dashboard, map, emergency mode, and data-status indicators |
| `backend/` | FastAPI routes, validation, orchestration, risk service, and future source adapters |
| `ml/` | Dataset preparation, model training, evaluation, versioning, and inference artifacts |
| `data/` | Documented raw, processed, demo, and geospatial data assets |
| `docs/` | Team agreements, data contracts, API documentation, model limitations, and demo script |

## Core design rules

1. The backend risk engine is authoritative; a future AI assistant can explain outputs but cannot determine them.
2. All time-varying data must preserve timestamp, timezone, source, unit, and `live`/`historical`/`derived`/`demo` status.
3. The training row will represent one location-time observation.
4. Probability categories are LOW, MODERATE, HIGH, and CRITICAL using the bands in the root README.
5. A model must be evaluated with location/time-aware validation before performance claims are made.
6. Safe-place and route guidance must communicate assumptions and must not guarantee safety.
7. Earthquake functionality, if added later, may report events or secondary-hazard changes but must never claim earthquake prediction.

## Planned technology choices

| Technology | Planned use | Why |
| --- | --- | --- |
| React + Vite + TypeScript | Frontend | Fast, typed, team-friendly web interface |
| Tailwind CSS | Styling | Supports a consistent, professional command-center UI |
| React Leaflet + Leaflet | Mapping | Practical web GIS without building GIS from scratch |
| FastAPI + Pydantic | Backend | Python-native API with clear validation and documentation |
| Pandas + NumPy | Data preparation | Well suited to tabular data work |
| scikit-learn Random Forest | First ML baseline | Readable, beginner-friendly classifier |
| XGBoost | Later model comparison | Strong structured-data option when suitable data exists |
| PostgreSQL + PostGIS | Later persistence/geospatial queries | Useful when multi-location spatial data becomes necessary |

## Planned risk and explanation contract

The future risk service should return a probability, category, source/data mode, timestamp, contributing factors, and warning guidance. It must identify whether a result came from a trained/evaluated model or from a demo scenario.
