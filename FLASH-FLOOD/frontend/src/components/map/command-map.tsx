import { useEffect, useState } from 'react'
import { Circle, CircleMarker, LayerGroup, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import { useCommand } from '../../features/command-center/command-context'
import { demoCommandService } from '../../services/demo-command-service'
import { riskOrigin } from '../../api/risk-api'
import type { RiskLevel } from '../../types/risk'
import type { DemoRoute } from '../../types/evacuation'
import 'leaflet/dist/leaflet.css'

export interface CommandMapLayers {
  risk?: boolean
  rivers?: boolean
  places?: boolean
  route?: boolean
  earthquakes?: boolean
  rainfall?: boolean
  landslide?: boolean
}

const DEFAULT_LAYERS: CommandMapLayers = {
  risk: true,
  rivers: true,
  places: true,
  route: false,
  earthquakes: false,
  rainfall: false,
  landslide: false,
}

const RISK_COLOR: Record<RiskLevel, string> = {
  LOW: '#34d399',
  MODERATE: '#fbbf24',
  HIGH: '#fb923c',
  CRITICAL: '#fb7185',
}

function FlyToSelected({ latitude, longitude }: { latitude: number; longitude: number }) {
  const map = useMap()
  useEffect(() => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return
    map.flyTo([latitude, longitude], 11, { duration: 0.8 })
  }, [latitude, longitude, map])
  return null
}

/**
 * Renders the OSM basemap and tracks tile health. Keyed by coordinates so the
 * counters reset for a newly-selected area. When the basemap fails to load the
 * UI shows an explicit banner (basemap unavailable) instead of a blank pane.
 */
function TileLayerWithHealth() {
  const [tileLoads, setTileLoads] = useState(0)
  const [tileErrors, setTileErrors] = useState(0)
  const basemapUnavailable = tileErrors > 0 && tileLoads === 0
  return (
    <>
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        eventHandlers={{
          tileload: () => setTileLoads((count) => count + 1),
          tileerror: () => setTileErrors((count) => count + 1),
        }}
      />
      {basemapUnavailable && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-[800] w-[min(92%,460px)] -translate-x-1/2 rounded-lg border border-amber-300/40 bg-[#07151a]/90 px-3 py-2 text-center text-[11px] font-semibold text-amber-200 shadow-lg">
          BASEMAP TILES UNAVAILABLE · OpenStreetMap basemap unreachable — application layers
          (risk zones, safe places, routes) remain active
        </div>
      )}
    </>
  )
}

export function CommandMap({
  layers = DEFAULT_LAYERS,
  route: routeOverride,
}: {
  layers?: CommandMapLayers
  route?: DemoRoute
}) {
  const { location, safePlaces, seismic, command, dataSource } = useCommand()
  const route = routeOverride ?? (safePlaces[0] ? demoCommandService.route(location, safePlaces[0]) : undefined)
  const origin = riskOrigin(command)
  const sourceLabel =
    origin === 'live'
      ? 'live ML prediction'
      : origin === 'unavailable'
        ? 'prediction unavailable at these coordinates'
        : dataSource === 'api'
          ? 'backend demo scenario'
          : 'demo scenario fixture'
  const riskAvailable = command.probability !== null && command.riskLevel !== null
  const riskRadius = 1800 + (command.probability ?? 0) * 32
  const rainRadius = 1200 + (command.weather.currentRainfall ?? 0) * 20
  const elevatedExposure = command.terrain.exposure === 'Elevated'
  const hasSafeCenter = Number.isFinite(location.latitude) && Number.isFinite(location.longitude)

  return (
    <div className="relative h-[430px] overflow-hidden rounded-2xl border border-white/10">
      {hasSafeCenter ? (
      <MapContainer
        center={[location.latitude, location.longitude]}
        zoom={11}
        scrollWheelZoom
        className="h-full w-full"
        aria-label="Interactive FlashGuard demonstration map"
      >
        <TileLayerWithHealth key={`${location.latitude}-${location.longitude}`} />
        <FlyToSelected latitude={location.latitude} longitude={location.longitude} />
        <CircleMarker
          center={[location.latitude, location.longitude]}
          radius={11}
          pathOptions={{ color: '#67e8f9', fillColor: '#0e7490', fillOpacity: 0.9 }}
        >
          <Popup>
            <b>{location.name}</b>
            <br />
            Selected location · {sourceLabel}
          </Popup>
        </CircleMarker>
        {layers.risk && riskAvailable && (
          <Circle
            center={[location.latitude + 0.018, location.longitude + 0.024]}
            radius={riskRadius}
            pathOptions={{ color: RISK_COLOR[command.riskLevel as RiskLevel], fillColor: RISK_COLOR[command.riskLevel as RiskLevel], fillOpacity: 0.18 }}
          >
            <Popup>
              {origin === 'live'
                ? `Live ML risk zone · score ${command.probability}/100 · ${command.riskLevel} (baseline model · ${command.modelVersion ?? '—'})`
                : `Illustrative demo risk zone · score ${command.probability}/100 · ${command.riskLevel} (${sourceLabel})`}
            </Popup>
          </Circle>
        )}
        {layers.rainfall && (
          <Circle
            center={[location.latitude - 0.03, location.longitude + 0.02]}
            radius={rainRadius}
            pathOptions={{ color: '#38bdf8', fillColor: '#38bdf8', fillOpacity: 0.25 }}
          >
            <Popup>
              Illustrative rainfall band · {command.weather.currentRainfall} mm/h
            </Popup>
          </Circle>
        )}
        {layers.landslide && (
          <Circle
            center={[location.latitude + 0.035, location.longitude - 0.028]}
            radius={1500}
            pathOptions={{ color: '#fbbf24', fillColor: '#fbbf24', fillOpacity: elevatedExposure ? 0.35 : 0.12 }}
          >
            <Popup>
              Illustrative landslide exposure zone · {command.terrain.exposure} · {sourceLabel}
            </Popup>
          </Circle>
        )}
        {layers.rivers && (
          <Polyline
            positions={[
              [location.latitude - 0.08, location.longitude - 0.1],
              [location.latitude - 0.02, location.longitude - 0.03],
              [location.latitude + 0.07, location.longitude + 0.09],
            ]}
            pathOptions={{ color: '#38bdf8', weight: 4, dashArray: '8 6' }}
          >
            <Popup>Illustrative river corridor</Popup>
          </Polyline>
        )}
        {layers.places && (
          <LayerGroup>
            {safePlaces.map((place) => (
              <CircleMarker
                key={place.id}
                center={[place.latitude, place.longitude]}
                radius={7}
                pathOptions={{ color: '#34d399', fillColor: '#34d399', fillOpacity: 0.9 }}
              >
                <Popup>
                  <b>{place.name}</b>
                  <br />
                  Suggested lower-risk location · {place.dataStatus ?? 'DEMO'}
                </Popup>
              </CircleMarker>
            ))}
          </LayerGroup>
        )}
        {layers.route && route && (
          <Polyline positions={route.coordinates} pathOptions={{ color: '#fbbf24', weight: 5 }}>
            <Popup>Illustrative demo route</Popup>
          </Polyline>
        )}
        {layers.earthquakes &&
          seismic
            .filter((event) => event.latitude != null && event.longitude != null)
            .map((event) => (
              <CircleMarker
                key={event.id ?? `${event.latitude}-${event.longitude}`}
                center={[event.latitude as number, event.longitude as number]}
                radius={9}
                pathOptions={{ color: '#fb923c', fillColor: '#fb923c', fillOpacity: 0.9 }}
              >
                <Popup>
                  {event.dataStatus === 'LIVE' ? 'Monitored seismic event' : 'Demo seismic event'} · M
                  {event.magnitude ?? '—'}
                </Popup>
              </CircleMarker>
            ))}
      </MapContainer>
      ) : (
        <div className="flex h-full items-center justify-center bg-[#0b2025] p-6">
          <p className="text-sm leading-6 text-slate-400">
            Location coordinates unavailable — select a place or enter coordinates to centre the map.
          </p>
        </div>
      )}
      <div className="absolute bottom-3 left-3 z-[500] rounded-lg border border-white/20 bg-[#07151a]/90 px-3 py-2 text-[10px] font-semibold text-cyan-100 shadow-lg">
        APPLICATION LAYERS · OpenStreetMap basemap
      </div>
    </div>
  )
}