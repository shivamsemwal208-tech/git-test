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
GET  /api/v1/alerts?location_id=&scenario=
GET  /api/v1/seismic/latest?location_id=
POST /api/v1/evacuation/assess
```

Most endpoints return deterministic demo data, and the risk endpoint defaults to the **live ML
** pipeline for **predefined and arbitrary locations alike** (honest prediction or unavailable —
never fabricated). **Live integrations**: `weather/current` and `weather/forecast` (Open-Meteo
weather), elevation (Open-Meteo elevation API), slope/aspect (derived from Open-Meteo elevation),
arbitrary-coordinate seismic (USGS), and the **real ML flood-risk prediction** (calibrated Random
Forest baseline over live Open-Meteo features) from `backend/app/risk_engine/predictor.py`. The
model requires the **11 non-optional features**; the optional `river_distance_m` has no source in
this release (always `null`) and never blocks a prediction. Deterministic demo/scenario data is
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
  - Safe places / alerts: empty lists.
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
