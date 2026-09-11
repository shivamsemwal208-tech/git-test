# FlashGuard data dictionary (planned)

No dataset is included in Phase 1. This document defines the intended future training and inference fields so data collection remains consistent.

| Field | Type / unit | Purpose |
| --- | --- | --- |
| `location_id` | string | Stable identifier for a location |
| `latitude`, `longitude` | decimal degrees, WGS84 | Geographic position |
| `observed_at` | ISO 8601 timestamp with timezone | Observation time |
| `rainfall_1h`, `rainfall_3h`, `rainfall_6h`, `rainfall_24h` | millimetres | Accumulated rainfall windows |
| `forecast_rainfall` | millimetres | Forecast accumulation with stated forecast window |
| `temperature` | degrees Celsius | Weather feature |
| `humidity` | percent | Weather feature |
| `soil_moisture` | documented source unit | Soil wetness feature |
| `elevation` | metres | Terrain feature |
| `slope` | degrees | Terrain feature |
| `aspect` | degrees | Optional terrain direction feature |
| `river_distance` | metres | Hydrology proximity feature |
| `historical_flood_indicator` | documented numeric/categorical value | Historical context feature |
| `flood_label` | 0 or 1 | Future training target only |
| `source_type` | `live`, `historical`, `derived`, or `demo` | Provenance label |
| `source_name` | string | Originating provider or fixture name |

## Dataset rules

- A training row represents one location-time observation.
- Units, geographic resolution, source, timestamp, and timezone must be documented.
- Flood labels require a traceable source.
- Train/test splitting must avoid mixing observations from the same event or location in a way that leaks information.
