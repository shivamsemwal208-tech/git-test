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
Flood risk score → risk classification → factor explanation
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

## Historical flood intelligence (implemented — informational only)

Recorded flood history is a **context layer, never an ML feature**. It is served beside the
prediction but never feeds the feature vector, so changing history can never change a
prediction.

```text
DFO Global Flood Records v0.9.0 (GeoPackage, data/raw/dfo/)
            ↓ ml/src/build_dfo_anchor_index.py
data/processed/dfo_event_index/   (meta.json + events.json, format_version 1)
            ↓ backend/app/data_sources/history_provider.py  (env: FLASHGUARD_HISTORY_INDEX_DIR)
POST /api/v1/risk/assess  →  risk_assessment.historical        (live responses only)
            ↓ frontend mapRiskAssessment → command.historical
FloodRiskPage "HISTORICAL FLOOD CONTEXT" card                  (demo mode: historical = null)
```

- Events carry a precomputed **anchor vertex** (polygon boundary vertex nearest the vertex
  mean — the same interpretation `ml/src/build_dataset.py` uses). `nearest`/`events_nearby`
  are great-circle distances in metres to that anchor, ordered deterministically by
  `(distance_m, fid)`, searched within a 50 km default radius.
- Each event also carries the **anchor vertex `latitude`/`longitude`**, so the live map can
  draw real (never fabricated) DFO event markers near the selected location; the frontend
  skips events whose coordinates are missing instead of inventing a position.
- `polygon_contains_location` is a coarse point-in-ring test over every event's
  geometry (bbox prefilter + even-odd, holes subtract). DFO polygons are broad regional
  outlines; containment or distance must not be read as local flooding.
- Missing/corrupt index → honest `status: "UNAVAILABLE"` (`INDEX_UNAVAILABLE`); no demo or
  fabricated history is ever substituted. Demo/simulation responses keep `historical: null`.
- Index format owner: `backend/app/data_sources/history_index.py` (single source of truth;
  `write_index` / `HistoricalIndex.load`).
- Constraints: no "no record implies no flood" claims, no flood-frequency statistics, no
  earthquake claims.

## Mapped river geometry (implemented — real, never fabricated)

HydroRIVERS v1.0 mapped streams are served as real line geometry for the live map. River data is
a **separate read-only surface from the ML pipeline** — never a feature, never changes a
prediction, and never fabricated.

```text
HydroRIVERS v1.0 (GeoPackage, data/raw/, not committed)
            ↓ build script → data/processed/river_index/  (env: FLASHGUARD_RIVER_INDEX_DIR)
            ↓ backend/app/data_sources/river_provider.py  (memory-mapped GeoIndex)
GET /api/v1/rivers/nearby?location_id=&latitude=&longitude=&radius_m=&max_segments=
            ↓ frontend fetchNearbyRiverSegments (radii ≤ 50 km, ≤ 1500 segments)
Live Map (flood-intelligence-map) real polylines          (unavailable → honest note, no fake line)
```

- `backend/app/data_sources/river_index.py` owns the index format: segments split into a coarse
  geographic grid (cells), queried per cell and filtered by true point-to-segment distance,
  deduplicated (5-decimal rounded anchors) and capped by `max_segments`.
- Missing/unreadable index → `status: "UNAVAILABLE"` / `INDEX_UNAVAILABLE` with empty segments.
  The frontend renders a note ("river geometry unavailable") instead of a fake corridor.
- Constraints: mapped streams only — absence of a mapped segment is not proof of no stream;
  distances are to HydroRIVERS segments, not measured channel geometry.

## Potential safe places / emergency destinations (implemented — real, never fabricated)

Real candidate emergency destinations are discovered live on OpenStreetMap via the public Overpass
API and surfaced on the Live Map. This is a **separate real surface** from the deterministic demo
`/api/v1/safe-places` route (which remains byte-for-byte unchanged for demo surfaces) and is
**never an ML feature**.

```text
OpenStreetMap  →  Overpass API (https://overpass-api.de, env: FLASHGUARD_OVERPASS_URL)
            ↓ backend/app/data_sources/safe_place_provider.py
               (nwr(around:…)[amenity=hospital|clinic|fire_station|police|school|community_centre],
                center coords for ways/relations, dedupe by (osm_type, osm_id),
                short-TTL cache keyed by (lat5, lon5, int radius))
GET /api/v1/safe-places/nearby?location_id=&latitude=&longitude=&radius_m=   (500–20000, default 5000)
            ↓ frontend fetchSafePlaces (src/api/safe-places-api.ts)
Live Map emerald markers + ranked aside panel (rank, distance, address,
elevation, nearest river, ranking_reason, VIEW ON MAP fly-to)
        (unavailable/error → honest note, no fabricated list)
```

- **Ranking is transparent**: `(priority, distance_m, osm_id)` — emergency services (hospital,
  clinic, fire station, police) first, then public buildings (school, community centre), nearest
  first; each place carries `rank`, `ranking_reason`, and its source. No AI score.
- **Best-effort enrichment** (`ENRICH_LIMIT = 20`): per-place `elevation_m`/`elevation_diff_m`
  (Open-Meteo elevation API) and `nearest_river_distance_m` (HydroRIVERS v1.0), each independent
  and `null` on failure — never invented.
- **Honest statuses**: `AVAILABLE` (even with `n_places: 0`); `UNAVAILABLE` /
  `PLACE_PROVIDER_UNAVAILABLE` on any provider failure — never a fabricated list.
- **Candidate, not certified**: popup/aside/warnings say "POTENTIAL SAFE / EMERGENCY DESTINATION"
  and disclaim certification, road closures, landslides, and official instructions; there is no
  routing — only "VIEW ON MAP".
- Constraints: no current-location/GPS, no hardcoded place lists, no safety guarantees.

## Core design rules

1. The backend risk engine is authoritative; a future AI assistant can explain outputs but cannot determine them.
2. All time-varying data must preserve timestamp, timezone, source, unit, and `live`/`historical`/`derived`/`demo` status.
3. The training row will represent one location-time observation.
4. Risk-level categories are LOW, MODERATE, HIGH, and CRITICAL using the bands in the root README.
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

The future risk service should return a risk score, category, source/data mode, timestamp, contributing factors, and warning guidance. It must identify whether a result came from a trained/evaluated model or from a demo scenario.
