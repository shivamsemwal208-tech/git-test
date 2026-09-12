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

## Feature engine contract (implemented — `backend/app/risk_engine/features.py`)

The risk engine owns the single feature contract used by both ML training and live inference:

- `FEATURE_SCHEMA` fixes feature names, units, canonical ordering, source group, and the missing-value/transform policy.
- `rainfall_1h/3h/6h/24h/72h/7d` + `antecedent_rainfall_7d` (mm) are accumulated by
  `weather_service` identically for the Open-Meteo forecast (live) and archive (training) sources.
- `soil_moisture_0_to_7cm` (%) uses the 0–7 cm depth band — the depth the Open-Meteo archive API
  exposes — so training and live inference share the same measurement.
- `elevation` (m) comes from the live Open-Meteo elevation API.
- `slope_degrees` / `aspect_degrees` are connected: derived from a batched 3x3 Open-Meteo
  elevation neighbourhood (~111 m spacing) with a least-squares plane fit
  (`terrain_provider`), using the same endpoint live and in training — never fabricated.
- `river_distance_m` is an **optional reported field with no source connected in this release**:
  it is always `None` by design (never a claim about water) and is excluded from the
  model contract, so it never blocks a prediction.
- Model contract: `MODEL_FEATURE_NAMES` / `CORE_FEATURE_NAMES` = the 11 non-optional features
  (rainfall windows, soil, elevation, slope, aspect); `FEATURE_NAMES` keeps all 12 for the
  schema/response.
- Null policy: a feature is `None` when its source is unavailable or its window is incomplete;
  nothing is estimated or imputed here. `transform_vector` applies the deterministic `log1p`
  rainfall transform shared by training and inference.

Consumers: `ml/src` (Step 4/5 of the roadmap build the dataset and train from `build_features` +
`transform_vector`), and the future predictor service (`backend/app/risk_engine/predictor.py`).

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
