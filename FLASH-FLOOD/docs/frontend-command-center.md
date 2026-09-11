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
- `src/components/map/command-map.tsx` renders the React Leaflet/OpenStreetMap map plus illustrative layers.
- `src/features/*` contains independently maintainable feature pages.

## Future backend connection points

Replace or supplement `demo-command-service.ts` with API-backed adapters such as `ApiRiskService`, `ApiWeatherService`, `ApiSeismicService`, `ApiSafePlaceService`, and `ApiRouteService`. UI components should continue to consume typed service outputs rather than hard-coded values.

## Location and scenario behavior

Location search and navigation select from local demo fixtures. A selection moves the map and refreshes all associated display fixtures. Simulation selection updates the displayed risk, weather, terrain context, alerts, safety recommendations, map context, and emergency view.

## Safety wording

FlashGuard is decision support only. It does not replace official authorities, does not predict earthquakes, and does not guarantee safe locations or evacuation routes.
