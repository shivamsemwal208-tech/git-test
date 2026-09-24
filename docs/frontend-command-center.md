# FlashGuard frontend command center

## Scope

This frontend is a complete interface prototype. It has no FastAPI backend, ML model, database, live weather feed, seismic feed, satellite feed, routing engine, or notification delivery service.

Every operational-looking value is deterministic `DEMO / SIMULATION` fixture data. The map uses real OpenStreetMap tiles for geographic context, but all FlashGuard overlays are illustrative demo layers.

## Run and verify

```powershell
Set-Location frontend
npm install
npm run dev
npm run build
npm run lint
```

If PowerShell blocks `npm`, use `npm.cmd` in place of `npm`.

## Architecture

- `src/features/command-center/command-context.tsx` owns selected demo location and scenario state.
- `src/data/demo-locations.ts` contains the nine selectable Uttarakhand demo locations.
- `src/data/demo-scenarios.ts` contains deterministic weather/risk scenario fixtures.
- `src/services/demo-command-service.ts` is the single frontend demo adapter. It makes no HTTP calls.
- `src/api/geocoding.ts` searches real-world places by name via the Open-Meteo Geocoding API
  (with a Nominatim fallback) so any place on the globe can be selected, not just demo fixtures.
  Selected places are stored as `ARBITRARY` locations with their real latitude/longitude/name and
  the exact coordinates are sent to the backend weather and risk endpoints.
- `src/components/map/command-map.tsx` renders the React Leaflet/OpenStreetMap map plus illustrative layers.
- `src/features/*` contains independently maintainable feature pages.

## Future backend connection points

Replace or supplement `demo-command-service.ts` with API-backed adapters such as `ApiRiskService`, `ApiWeatherService`, `ApiSeismicService`, `ApiSafePlaceService`, and `ApiRouteService`. UI components should continue to consume typed service outputs rather than hard-coded values.

## Location and scenario behavior

Location search selects from local demo fixtures **and** real-world places resolved by name
through the Open-Meteo Geocoding API (Nominatim fallback). Selecting either updates the command
center location, moves the map and refresh all associated displays. For a geocoded place the
frontend sends its real `latitude`/`longitude` (plus echoed `location_name`) to the backend weather
and risk endpoints, so the dashboard shows actual Open-Meteo values — or an honest `UNAVAILABLE`
state, never a zero/default placeholder. Custom-coordinate input rejects empty fields so a
0.000, 0.000 location cannot be created accidentally; the map only renders when coordinates are
finite numeric values.

The frontend distinguishes three `UNAVAILABLE` causes on the risk command, so the UI never
misattributes blame:

- `DATA_INCOMPLETE` — **backend** verdict: required live features could not be sourced.
- `MODEL_UNAVAILABLE` — **backend** verdict: the ML model could not be loaded/run.
- `API_UNAVAILABLE` — **frontend-only** verdict: minted locally only when the risk endpoint could
  not be reached at all (network/API error). It is never a substitute for a backend diagnosis and
  the SCENARIO fallback never fabricates a probability to replace a missing live prediction.

## Safety wording

FlashGuard is decision support only. It does not replace official authorities, does not predict earthquakes, and does not guarantee safe locations or evacuation routes.
