# FlashGuard API design

## Current contract (Phase 3 — backend skeleton)

The FastAPI backend exposes these routes at `http://127.0.0.1:8000`:

```text
GET  /api/v1/health
GET  /api/v1/locations
POST /api/v1/risk/assess
GET  /api/v1/weather/current?location_id=&scenario=
GET  /api/v1/weather/forecast?location_id=&scenario=
GET  /api/v1/safe-places?location_id=
GET  /api/v1/safe-places/nearby?location_id=&latitude=&longitude=&radius_m=
GET  /api/v1/alerts?location_id=&scenario=
GET  /api/v1/seismic/latest?location_id=
GET  /api/v1/rivers/nearby?location_id=&latitude=&longitude=&radius_m=&max_segments=
POST /api/v1/evacuation/assess
```

Most endpoints return deterministic demo data, and the risk endpoint defaults to the **live ML
** pipeline for **predefined and arbitrary locations alike** (honest prediction or unavailable —
never fabricated). **Live integrations**: `weather/current` and `weather/forecast` (Open-Meteo
weather), elevation (Open-Meteo elevation API), slope/aspect (derived from Open-Meteo elevation),
arbitrary-coordinate seismic (USGS), the **real ML flood-risk prediction** (calibrated Random
Forest baseline over live Open-Meteo features) from `backend/app/risk_engine/predictor.py`,
`rivers/nearby` (real **HydroRIVERS v1.0** mapped river geometry from the local index), and
`safe-places/nearby` (real **OpenStreetMap** candidate destinations via the Overpass API). The
model requires the **11 non-optional features**; the optional `river_distance_m` has no source in
this release (always `null` in the risk response — river geometry is served separately by
`rivers/nearby`) and never blocks a prediction. Deterministic demo/scenario data is
produced **only** for an explicit simulation/demo request (`simulate: true`). No database is
connected yet; the ML baseline is a research artifact, not a production model.

## Live weather provider (Open-Meteo)

`GET /api/v1/weather/current` and `GET /api/v1/weather/forecast` are coordinate-based:

- Predefined demo locations (e.g. `dehradun`) resolve coordinates from the backend location
  fixtures and fetch weather for **their own** location.
- Arbitrary coordinates (`location_id` + `latitude` + `longitude`, optionally `location_name` to
  echo a friendly place name) are queried **exactly at those coordinates**; the weather of one
  location is never reused for another.

Request flow:

1. The route resolves the target coordinates (fixture or explicit lat/lng), validates them, and
   validates the (optional, echoed) `scenario` param.
2. `backend/app/data_sources/weather_provider.py` fetches the Open-Meteo Forecast API
   (`https://api.open-meteo.com/v1/forecast`) with the requested `latitude`/`longitude`,
   `past_days=7`, `forecast_days=2`, `timezone=GMT`, a 6s timeout, and the variables:
   `temperature_2m`, `relative_humidity_2m`, `precipitation`, `precipitation_probability`,
   `wind_speed_10m`, `wind_direction_10m`, `surface_pressure`, `soil_moisture_0_to_1cm`,
   `soil_moisture_0_to_7cm`.
3. `backend/app/services/weather_service.py` normalizes the response into the FlashGuard contract
   (current + forecast), guarded by a small in-memory TTL cache (10 minutes) keyed by coordinates.
   Any provider failure (timeout, HTTP error, malformed JSON, missing hourly variables, invalid
   coordinates) returns an honest `UNAVAILABLE` response — never fabricated values.

Supported fields returned by `/weather/current`:

```json
{
  "status": "LIVE",
  "source": "Open-Meteo",
  "latitude": 30.555,
  "longitude": 79.565,
  "temperature": 18.7,
  "humidity": 93.0,
  "current_rainfall": 0.1,
  "rainfall_1h": 0.1,
  "rainfall_3h": 0.5,
  "rainfall_6h": 1.4,
  "rainfall_24h": 12.7,
  "rainfall_72h": 33.2,
  "rainfall_7d": 108.9,
  "antecedent_rainfall_7d": 96.2,
  "forecast_rainfall": 6.7,
  "precipitation_probability": 76.0,
  "wind_speed": 0.8,
  "wind_direction": "ENE",
  "pressure": 822.3,
  "soil_moisture": 29.3,
  "soil_moisture_0_to_7cm": 31.8,
  "updated_at": "2026-09-11T13:15",
  "note": null
}
```

### Rainfall accumulation methodology

Open-Meteo `precipitation` (mm) is the sum during the hour *preceding* each timestamp, so the
value at hourly index `t` covers `t-1h -> t`. The service accumulates the hourly values ending
at the current observation hour:

- `rainfall_1h` = precipitation during the current hour (`current_rainfall` is the same value).
- `rainfall_3h` / `rainfall_6h` / `rainfall_24h` = sum of the last 3 / 6 / 24 hourly values.
- `rainfall_72h` = sum of the last 72 hourly values.
- `rainfall_7d` = sum of the last 168 hourly values (rolling 7-day total).
- `antecedent_rainfall_7d` = sum of the 144 hourly values from `now-167h` to `now-24h` — the six
  days that precede the most recent 24h window. It never overlaps `rainfall_24h`, so it is the
  clean "pre-wetting" context independent of the current-day burst.
- `forecast_rainfall` = sum of the next 24 hourly values after the current hour.
- `soil_moisture` is `soil_moisture_0_to_1cm` (volumetric m³/m³) shown as a percentage.
- `soil_moisture_0_to_7cm` is the 0–7 cm depth band (m³/m³) shown as a percentage. This matches
  the depth exposed by the Open-Meteo ARCHIVE/Historical API used for ML training, so live
  inference and training share the same depth band. The two soil depths are distinct
  measurements and are never treated as interchangeable.

The ML rainfall windows (`rainfall_72h`, `rainfall_7d`, `antecedent_rainfall_7d`) are computed
by the same accumulation functions that the future training pipeline reuses, so training and
live inference share identical definitions and units.

If a window has fewer values than needed, or any value in the window is missing, the corresponding
field is **`null`** — insufficient data is never estimated. With `past_days=7` the hourly series
covers the full 7-day rolling window for any time of day; the antecedent window may be `null`
shortly after midnight when fewer than 7 full days precede the current hour.

### Status vocabulary

| status         | meaning                                                                 |
| -------------- | ----------------------------------------------------------------------- |
| `LIVE`         | Data returned by the Open-Meteo provider for the requested coordinates. |
| `UNAVAILABLE`  | Honest failure (timeout, HTTP error, malformed response, bad coords). No substituted values. |
| `DEMO`         | Deterministic scenario/fixture data (risk, terrain, alerts, seismic…). |
| `DEMO_UNAVAILABLE` | Arbitrary-coordinates demo response without real data (non-risk resources). |

By default `POST /api/v1/risk/assess` runs the live ML pipeline for **every** location —
predefined demo locations are resolved to their own fixture coordinates/name and queried exactly
like arbitrary coordinates. Responses use `data_status: "LIVE"` with a companion
`prediction_status` (`PREDICTION` | `UNAVAILABLE`), a `reason`
(`MODEL_UNAVAILABLE` | `DATA_INCOMPLETE`), and `missing_features`: any live feature that cannot
be sourced makes the prediction unavailable honestly — **no demo/scenario probability is ever
substituted** for any location without an explicit simulation request.

### Explicit simulation override (`simulate: true`)

`POST /api/v1/risk/assess` accepts `simulate: bool` (default `false`). When `true`, the endpoint
returns the deterministic scenario fixture for predefined demo locations (`data_status: "DEMO"`,
`is_simulated: true`) and the deterministic arbitrary-coordinate demo for explicit coordinates.
This is used by the explicit Simulation/Demo surfaces in the frontend (Simulation control page,
"Simulate Emergency" control) and never presents demo values as live data. The frontend
guarantees `simulate` is **never** sent for arbitrary-coordinate locations, whose live ML
prediction is always preserved.

The weather endpoints never label simulated or reused data as live, and the demo scenario
`normal` / `heavy_rain` / `extreme_rain` / `critical_flood` values remain confined to the risk
simulation; the `scenario` param on the weather routes is only echoed as provenance metadata.

## Arbitrary-coordinate locations

A request may target coordinates that are not in the 9 predefined demo locations by supplying
`latitude` and `longitude` alongside a synthetic `location_id`:

- `POST /api/v1/risk/assess` body may add `latitude`, `longitude`, `location_name`.
- `GET` endpoints (`weather`, `safe-places`, `alerts`, `seismic`, `evacuation`) accept optional
  `latitude` and `longitude` query/body params.
- Validation: `latitude` must be within `[-90, 90]` and `longitude` within `[-180, 180]`.
  Out-of-range coordinates return `422` before any pipeline runs — including for
  simulation requests. In-range arbitrary coordinates are accepted as-is.

Behavior:

- Predefined demo locations are resolved to their own coordinates and run the **same live ML
  pipeline** as arbitrary coordinates by default; they never substitute a scenario probability
  unless the request is an explicit simulation (`simulate: true`).
- Unknown `location_id` **without** coordinates → `404` (live or simulated).
- Weather for arbitrary coordinates returns real provider data marked `LIVE` (or an honest
  `UNAVAILABLE` response when the provider cannot be reached).
- Risk for **any** location (predefined or arbitrary) returns a **real ML prediction**
  (`prediction_status: "PREDICTION"`, `data_status: "LIVE"`, `is_simulated: false`,
  `probability` 0–100 (relative flood risk score), `risk_level`, `contributing_factors`, `model_version`) built from live
  Open-Meteo/elevation/terrain features via the canonical feature engine. Predefined locations
  keep their own coordinates, `location_id`, and friendly `location_name` in the response. The
  production artifact is **v1** and requires its 9 trained features (7 rainfall windows, soil
  moisture, elevation); live slope/aspect are reported in the response but not required, and the
  optional `river_distance_m` field has no source in this release (`null` in the response) and
  never blocks a prediction. If the model artifact cannot be loaded (`MODEL_UNAVAILABLE`) or any
  required live feature is missing (`DATA_INCOMPLETE`, e.g. `rainfall_72h`/`rainfall_7d`/
  `antecedent_rainfall_7d` unavailable), `prediction_status: "UNAVAILABLE"` with `probability:
  null` and a listed `missing_features`.
- Other arbitrary-coordinate resources return `data_status: "DEMO_UNAVAILABLE"`:
  - Safe places (`/safe-places`) / alerts: empty lists. The **live** safe-places surface is
    `safe-places/nearby` (below), which serves real OpenStreetMap candidates for arbitrary
    coordinates.
  - Seismic: `seismic_status: "DATA UNAVAILABLE"`, empty `secondary_hazards`.
  - Evacuation: `route_status: "Unavailable"`, no fabricated geometry.

The backend never fabricates, reuses, or relabels another location's data for arbitrary
coordinates.

## Risk assessment response (live ML, predefined and arbitrary)

`POST /api/v1/risk/assess` returns a real baseline ML prediction for predefined locations
(resolved to their own coordinates) and arbitrary coordinates alike, when live features and the
artifact are available:

```json
{
  "location_id": "arbitrary-30.5-79.3",
  "scenario_label": "Live ML Flood Risk Score",
  "probability": 66.8,
  "risk_level": "HIGH",
  "prediction_status": "PREDICTION",
  "reason": null,
  "missing_features": [],
  "model_version": "rf_calibrated_baseline_v1",
  "contributing_factors": [
    {"feature": "rainfall_24h", "value": 7.1, "unit": "mm", "importance": 0.2064},
    {"feature": "rainfall_72h", "value": 19.5, "unit": "mm", "importance": 0.1394},
    {"feature": "soil_moisture_0_to_7cm", "value": 42.3, "unit": "%", "importance": 0.1326}
  ],
  "factors": ["rainfall_24h = 7.1 mm, importance 0.2064", "..."],
  "data_status": "LIVE",
  "is_simulated": false,
  "model_status": "Connected — rf_calibrated_baseline_v1 (READY)",
  "disclaimer": "Baseline research artifact; not a production prediction and not a substitute for official hydrological or emergency-authority warnings."
}
```

`risk_level` bands: `LOW` 0–<30, `MODERATE` 30–<60, `HIGH` 60–<80, `CRITICAL` 80–100.
`probability` is a **relative flood risk score** on a 0–100 scale produced by the baseline model
and mapped to the bands — it is a ranking signal (higher = higher relative risk), not a literal
probability/chance of flooding; absolute values are not calibrated to real-world flood
frequency. Risk-level text (warning/recommended_action) always
communicates that the ML estimate is advisory only and never guarantees safety. When live
features or the model artifact are unavailable, `prediction_status: "UNAVAILABLE"` with
`probability: null`, `risk_level: null`, and an explicit `reason` + `missing_features`; the
response never falls back to a demo/scenario probability for any location except an explicit
simulation request (`simulate: true`). The `terrain.river_distance` field is always `null` in
this release (no river source connected); the ML prediction is made from the v1 artifact's 9
required features regardless.

## Historical flood context (`historical`)

Live `POST /api/v1/risk/assess` responses (prediction **or** unavailable) include an
informational `historical` block sourced from the **DFO Global Flood Records v0.9.0** event
index (built by `ml/src/build_dfo_anchor_index.py`, default dir
`data/processed/dfo_event_index/`, dir overridable with `FLASHGUARD_HISTORY_INDEX_DIR`).
Explicit simulation/demo responses (`simulate: true`) return `historical: null` — demo mode is
byte-for-byte unchanged.

```json
{
  "historical": {
    "status": "AVAILABLE",
    "status_reason": null,
    "source": "DFO Global Flood Records v0.9.0 (CC0)",
    "coverage": {
      "start_date": "1985-01-01",
      "end_date": "2024-01-09",
      "event_count": 5503,
      "usable_event_count": 5501
    },
    "search_radius_m": 50000,
    "distance_basis": "ANCHOR_VERTEX",
    "nearest": {
      "fid": 2027,
      "report_number": "2027",
      "distance_m": 21718,
      "distance_basis": "ANCHOR_VERTEX",
      "latitude": 29.9985,
      "longitude": 78.1467,
      "begin_date": "2002-08-11",
      "end_date": "2002-08-13",
      "country": "India",
      "cause": "Heavy rain",
      "severity": 1,
      "flood_impact_index": 4.3
    },
    "polygon_contains_location": true,
    "events_nearby": [],
    "disclaimer": "Recorded floods are regional polygons; distance is to the anchor vertex."
  }
}
```

Semantics and honesty rules:

- **Status**: `AVAILABLE` when the index loads and `UNAVAILABLE` when it is missing, unreadable,
  or version-mismatched (`status_reason: "INDEX_UNAVAILABLE"`, data fields `null`, and a
  disclaimer stating no fabricated history was produced). No demo event is ever substituted.
- **Search**: great-circle distance in metres from the requested coordinates to each event's
  **anchor vertex** — the polygon boundary vertex nearest the vertex mean, the same
  interpretation used by `ml/src/build_dataset.py`. Default search radius 50 km. `nearest` is
  the closest event; `events_nearby` lists up to 3 further events within radius, ordered by
  `(distance, fid)` for determinism. Distance is to the anchor — **never** presented as
  distance to flood waters.
- **Anchor coordinates**: every event record (`nearest` and each `events_nearby` entry) carries
  `latitude`/`longitude` of its anchor vertex, enabling the frontend to draw real (not fabricated)
  event markers. Values are `null` only when the anchor is unavailable; the frontend skips such
  events rather than inventing a position.
- **Coverage / containment**: `polygon_contains_location` is a coarse point-in-ring test over
  all events' rings (bbox prefilter + even-odd; holes subtract). DFO polygons are broad
  regional outlines, so containment does not mean the exact location flooded.
- **Catalogue**: 5,503 DFO v0.9.0 source records; the shipped index contains 5,501 usable
  events (2 skipped for corrupt/out-of-range geometry). Recorded dates span 1985-01-01 to
  2024-01-09 (EndDate max). Absence of a nearby record does **not** prove flooding never
  occurred.
- **Informational only**: the block never feeds the feature vector, never changes the
  prediction, and never claims flood-frequency statistics.

## Potential safe places / emergency destinations (`GET /api/v1/safe-places/nearby`)

Serves **real OpenStreetMap** candidate destinations near a location (hospitals, clinics, fire
stations, police stations, schools, community centres), discovered live via the public Overpass
API. This is a separate real surface from the demo `/api/v1/safe-places` route (which stays
100% deterministic for the demo surfaces) — it is **not** an ML feature and never changes a
prediction.

```text
GET /api/v1/safe-places/nearby?location_id=dehradun
GET /api/v1/safe-places/nearby?location_id=search-rome&latitude=41.9&longitude=12.48&radius_m=5000
```

Query parameters:

- `location_id` — predefined location (resolved to its own coordinates). Optional when
  `latitude`/`longitude` are supplied. An unknown `location_id` without coordinates → `404`
  (same `get_location` semantics as the other routes).
- `latitude`, `longitude` — arbitrary coordinates (an unknown location id plus these coords is
  treated as an arbitrary location, like the risk route).
- `radius_m` — search radius, default `5000`, allowed `500–20000`.

Example response (`status: "AVAILABLE"`):

```json
{
  "location_id": "dehradun",
  "latitude": 30.3165,
  "longitude": 78.0322,
  "radius_m": 5000,
  "status": "AVAILABLE",
  "status_reason": null,
  "source": "OpenStreetMap via Overpass API (https://overpass-api.de)",
  "n_places": 3,
  "selected_elevation_m": 652.0,
  "selected_elevation_source": "Open-Meteo elevation API",
  "ranking_note": "Ranked by category priority (emergency services first), then linear distance from the location.",
  "places": [
    {
      "osm_type": "node",
      "osm_id": 7362337109,
      "name": "SelaQui Hospital",
      "category": "hospital",
      "category_label": "Hospital",
      "priority": 1,
      "rank": 1,
      "latitude": 30.3299,
      "longitude": 78.049,
      "distance_m": 900,
      "address": "Rajpur Road, Dehradun",
      "elevation_m": 700.0,
      "elevation_diff_m": 48.0,
      "elevation_source": "Open-Meteo elevation API",
      "nearest_river_distance_m": 250,
      "river_distance_source": "HydroRIVERS v1.0",
      "ranking_reason": "Emergency service — nearest first",
      "source": "OpenStreetMap via Overpass API (https://overpass-api.de)"
    }
  ],
  "data_status": "LIVE",
  "disclaimer": "Candidate emergency destinations discovered on OpenStreetMap... No fabricated list is ever produced."
}
```

Semantics and honesty rules:

- **Data source**: the public Overpass API (`https://overpass-api.de/api/interpreter`, env
  override `FLASHGUARD_OVERPASS_URL`). A single `nwr(around:…)` query for
  `amenity in (hospital, clinic, fire_station, police, school, community_centre)` with resolved
  center coordinates for ways/relations. Node coordinates come from `lat`/`lon`; way/relation
  coordinates from `center`; malformed records (missing/non-finite/string coordinates, unknown
  amenity, missing center) are skipped, never fatal. Results are deduplicated by `(osm_type,
  osm_id)` and capped at `MAX_PLACES = 40`.
- **Ranking (transparent)**: `(priority, distance_m, osm_id)` — emergency services (hospital,
  clinic, fire station, police) before public buildings (school, community centre), then nearest
  first; ties broken by `osm_id` for determinism. Every place carries its `rank`,
  `ranking_reason`, and the source string. Linear (haversine) distance is in metres from the
  requested coordinates. There is no AI/fabricated score.
- **Status**: `AVAILABLE` when real places are returned (even `n_places: 0` for an honest empty
  result). If the Overpass provider is unreachable, times out, or the network call fails, the
  route returns `status: "UNAVAILABLE"` (`status_reason: "PLACE_PROVIDER_UNAVAILABLE"`,
  `places: []`, `data_status: "UNAVAILABLE"`) — a provider failure is an honest state, **never**
  a fabricated list.
- **Best-effort enrichment**: for up to `ENRICH_LIMIT = 20` places (and the selected location)
  the route adds `elevation_m`/`elevation_source` (Open-Meteo elevation API),
  `elevation_diff_m` (vs. the location), and `nearest_river_distance_m`/`river_distance_source`
  (HydroRIVERS v1.0). Each enrichment is independent and best-effort: if a sub-provider fails,
  those fields are `null` — never invented.
- **Candidate, not certified**: the disclaimer states these are OpenStreetMap places, not
  certified safe sites; reachability during a flood (roads, landslides, official instructions) is
  not modelled — there is **no routing**. The frontend labels them "POTENTIAL SAFE / EMERGENCY
  DESTINATION".
- **Caching**: short-TTL in-memory cache (10 minutes) keyed by (5-decimal lat, 5-decimal lon,
  integer radius) to keep the public Overpass service usage modest.

## Mapped river geometry (`GET /api/v1/rivers/nearby`)

Serves **real HydroRIVERS v1.0** mapped river segments near a location from the local GeoPackage
index, so the frontend can draw genuine river geometry (never fabricated polylines). This is a
separate read-only surface from the risk endpoint — it is **not** an ML feature and never changes
a prediction.

```text
GET /api/v1/rivers/nearby?location_id=dehradun
GET /api/v1/rivers/nearby?latitude=30.3165&longitude=78.0322&radius_m=12000
```

Query parameters:

- `location_id` — predefined location (resolved to its own coordinates). Optional when
  `latitude`/`longitude` are supplied. An unknown `location_id` without coordinates → `404`
  (same `get_location` semantics as the other routes).
- `latitude`, `longitude` — arbitrary coordinates (an unknown location id plus these coords is
  treated as an arbitrary location, like the risk route).
- `radius_m` — search radius, default `12000`, allowed `100–50000`.
- `max_segments` — cap on returned segments, default `1500`, allowed `1–5000`. Larger radii may
  be truncated; `truncated: true` signals that more segments exist but were capped.

Example response:

```json
{
  "location_id": "dehradun",
  "latitude": 30.3165,
  "longitude": 78.0322,
  "radius_m": 12000,
  "status": "AVAILABLE",
  "status_reason": null,
  "source": "HydroRIVERS v1.0",
  "n_segments": 2,
  "truncated": false,
  "segments": [
    [77.908, 30.182, 78.106, 30.198],
    [78.106, 30.198, 78.248, 30.221]
  ],
  "data_status": "LIVE",
  "disclaimer": "Mapped streams only — absence of a mapped segment is not proof of no stream."
}
```

Semantics and honesty rules:

- **Geometry**: each segment is `[x0, y0, x1, y1]` (lon/lat of both endpoints) read from the
  HydroRIVERS v1.0 index in `data/processed/river_index/`. Segments are filtered by true
  point-to-segment distance in metres, then deduplicated (rounded 5-decimal anchors) and capped
  by `max_segments`.
- **Status**: `AVAILABLE` when the index loads; `UNAVAILABLE` (`status_reason:
  "INDEX_UNAVAILABLE"`, `segments: []`, `data_status: "UNAVAILABLE"`) when the index is missing
  or unreadable. No river segment is ever fabricated — the frontend shows an explicit note
  instead of a fake line.
- **Index-driven**: the index is generated from the raw HydroRIVERS GeoPackage (kept out of the
  repo). Works out of the box against the shipped index; the index dir is overridable via
  `FLASHGUARD_RIVER_INDEX_DIR` (see `backend/app/data_sources/river_provider.py`).
