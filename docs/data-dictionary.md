# FlashGuard data dictionary (planned)

No dataset is included in Phase 1. This document defines the intended future training and inference fields so data collection remains consistent.

| Field | Type / unit | Purpose |
| --- | --- | --- |
| `location_id` | string | Stable identifier for a location |
| `latitude`, `longitude` | decimal degrees, WGS84 | Geographic position |
| `observed_at` | ISO 8601 timestamp with timezone | Observation time |
| `rainfall_1h`, `rainfall_3h`, `rainfall_6h`, `rainfall_24h` | millimetres | Accumulated rainfall windows |
| `rainfall_72h`, `rainfall_7d` | millimetres | ML rainfall windows (72h and 168h ending at the observation time) |
| `antecedent_rainfall_7d` | millimetres | Pre-wetting context: 144h (6 days) ending 24h before the observation time; never overlaps `rainfall_24h` |
| `forecast_rainfall` | millimetres | Forecast accumulation with stated forecast window |
| `temperature` | degrees Celsius | Weather feature |
| `humidity` | percent | Weather feature |
| `soil_moisture` | documented source unit | Soil wetness feature (0–1 cm depth band) |
| `soil_moisture_0_to_7cm` | documented source unit | Soil wetness feature at the 0–7 cm depth band — the depth the Open-Meteo archive API exposes, used for ML training/inference alignment |
| `elevation` | metres | Terrain feature |
| `slope` | degrees | Terrain feature |
| `aspect` | degrees | Optional terrain direction feature |
| `river_distance` | metres | Hydrology proximity feature |
| `historical_flood_indicator` | documented numeric/categorical value | Historical context feature |
| `flood_label` | 0 or 1 | Future training target only |
| `source_type` | `live`, `historical`, `derived`, or `demo` | Provenance label |
| `source_name` | string | Originating provider or fixture name |

## Recorded flood history — `historical` block (API context, informational)

Live `POST /api/v1/risk/assess` responses include `historical` series data, **not a model
feature** (`historical_flood_indicator` above stays out of the feature contract). Source:
DFO Global Flood Records v0.9.0 indexed from the local GeoPackage
(`data/processed/dfo_event_index/`, built by `ml/src/build_dfo_anchor_index.py`).

| Field | Type / unit | Meaning |
| --- | --- | --- |
| `status` | `AVAILABLE` \| `UNAVAILABLE` | Index loaded, or honest unavailable (`INDEX_UNAVAILABLE`). |
| `source`, `status_reason` | string, string\|null | Provenance, e.g. DFO v0.9.0 (CC0); reason when unavailable. |
| `coverage.start_date`, `coverage.end_date` | ISO 8601 date | Min BeginDate / max EndDate. Shipped index: 1985-01-01 → 2024-01-09. |
| `coverage.event_count`, `coverage.usable_event_count` | integer | 5,503 source records / 5,501 with usable geometry. |
| `search_radius_m` | metres | Default 50,000. |
| `distance_basis` | `ANCHOR_VERTEX` | Distance is to each event's anchor vertex (boundary vertex nearest the vertex mean), never local flood waters. |
| `nearest.*` | metres / dates / strings | Closest event: `fid`, `report_number`, `distance_m`, `begin_date`, `end_date`, `country`, `cause`, `severity` (1 minor / 1.5 major / 2 severe), `flood_impact_index`. |
| `events_nearby[]` | array | Up to 3 further events within radius; deterministic `(distance_m, fid)` order. |
| `polygon_contains_location` | boolean | Coarse point-in-ring test over all event geometry (bbox prefilter + even-odd, holes subtract). Broad regional outlines — containment ≠ local flooding. |
| `disclaimer` | string | States distance is to anchor vertex; no record does not prove no flood. |

## Dataset rules

- A training row represents one location-time observation.
- Units, geographic resolution, source, timestamp, and timezone must be documented.
- Flood labels require a traceable source.
- Train/test splitting must avoid mixing observations from the same event or location in a way that leaks information.
