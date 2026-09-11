# FlashGuard API design (planned)

No API exists in Phase 1. The routes below are future contracts only.

```text
GET  /api/v1/health
GET  /api/v1/locations
POST /api/v1/risk/assess
GET  /api/v1/risk/latest?location_id=
GET  /api/v1/map/layers
GET  /api/v1/safe-places?location_id=
GET  /api/v1/alerts/latest?location_id=
POST /api/v1/demo/scenarios/{scenario_id}/assess
GET  /api/v1/model/info
GET  /api/v1/data-status
```

## Intended risk-assessment response fields

```json
{
  "flood_probability": 0.87,
  "risk_level": "CRITICAL",
  "data_mode": "demo",
  "is_simulated": true,
  "assessed_at": "future ISO-8601 timestamp",
  "contributing_factors": [],
  "warning": "future evidence-based warning text",
  "model_or_scenario_version": "future version identifier"
}
```

The JSON is illustrative documentation only; it is not an active response or a claim of functionality.
