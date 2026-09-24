import { useEffect, useState } from 'react'
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { formatRiverDistance, riskStatusLabel, type RiskCommand } from '../../api/risk-api'
import type { SafePlaceItem } from '../../api/safe-places-api'
import type { DemoLocation } from '../../types/location'
import type {
  HistoricalEvent,
  RiskLevel,
  RiskOrigin,
} from '../../types/risk'
import {
  DEFAULT_LAYER_STATE,
  historicalEventsWithCoords,
  validSafePlaceItems,
  type FloodIntelligenceLayerState,
  type PlaceLayerState,
  type RiverLayerState,
} from './flood-intelligence-state'
import { severity } from '../../components/severity/severity'

const RISK_COLOR: Record<RiskLevel, string> = {
  LOW: severity('LOW').hex,
  MODERATE: severity('MODERATE').hex,
  HIGH: severity('HIGH').hex,
  CRITICAL: severity('CRITICAL').hex,
}

const SELECTED_COLOR = '#67e8f9'
const HISTORICAL_COLOR = '#c0996b'
const RIVER_COLOR = '#22d3ee'
const PLACE_COLOR = '#10b981'
const PLACE_FILL = '#065f46'

function FlyToSelected({ latitude, longitude }: { latitude: number; longitude: number }) {
  const map = useMap()
  useEffect(() => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return
    map.flyTo([latitude, longitude], 11, { duration: 0.8 })
  }, [latitude, longitude, map])
  return null
}

/** Flies the viewport to a candidate destination when "View on Map" is chosen. */
function FlyToPlace({ place }: { place: SafePlaceItem | null }) {
  const map = useMap()
  useEffect(() => {
    if (!place || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) return
    map.flyTo([place.latitude, place.longitude], 15, { duration: 0.9 })
  }, [place, map])
  return null
}

/** Renders the current basemap and tracks its tile health (OSM or terrain). */
function TileLayerWithHealth({ terrain }: { terrain: boolean }) {
  const [tileLoads, setTileLoads] = useState(0)
  const [tileErrors, setTileErrors] = useState(0)
  const basemapUnavailable = tileErrors > 0 && tileLoads === 0
  const url = terrain
    ? 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
  const attribution = terrain
    ? '&copy; OpenStreetMap contributors &copy; SRTM | OpenTopoMap (CC-BY-SA)'
    : '&copy; OpenStreetMap contributors'
  return (
    <>
      <TileLayer
        attribution={attribution}
        url={url}
        eventHandlers={{
          tileload: () => setTileLoads((count) => count + 1),
          tileerror: () => setTileErrors((count) => count + 1),
        }}
      />
      {basemapUnavailable && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-[800] w-[min(92%,460px)] -translate-x-1/2 rounded-lg border border-sev-high/45 bg-abyss/90 px-3 py-2 text-center text-[11px] font-semibold text-sev-high-soft shadow-lg">
          BASEMAP TILES UNAVAILABLE · map tiles unreachable — live data layers (risk,
          flood records, rivers) remain active
        </div>
      )}
    </>
  )
}

function RiskStatusPanel({
  command,
  riskOrigin,
}: {
  command: RiskCommand
  riskOrigin: RiskOrigin
}) {
  const { weather, terrain } = command
  const riskAvailable = command.probability !== null && command.riskLevel !== null
  const historical = command.historical
  const nearest = historical?.status === 'AVAILABLE' ? historical?.nearest : null
  const historicalLine = nearest
    ? `${nearest.beginDate ?? 'Date not recorded'} · ${formatRiverDistance(nearest.distanceM)}`
    : historical?.status === 'AVAILABLE'
      ? `No recorded DFO event within ${Math.round(historical.searchRadiusM / 1000)} km`
      : 'Historical flood records unavailable'

  return (
    <div className="w-full max-w-[16rem] rounded-xl border border-white/10 bg-abyss/92 p-4 shadow-2xl backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold tracking-[.15em] text-slate-400">RISK STATUS</p>
        <span
          className={
            'rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider ' +
            (riskOrigin === 'live'
              ? 'bg-command/15 text-command-soft'
              : riskOrigin === 'unavailable'
                ? 'bg-slate-400/15 text-slate-300'
                : 'bg-slate-400/15 text-slate-300')
          }
        >
          {riskStatusLabel(riskOrigin)}
        </span>
      </div>

      <div className="mt-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-300">Risk level</span>
          {riskAvailable ? (
            <span
              className="rounded px-2 py-0.5 text-xs font-bold tracking-wide"
              style={{
                color: RISK_COLOR[command.riskLevel as RiskLevel],
                backgroundColor: `${RISK_COLOR[command.riskLevel as RiskLevel]}22`,
              }}
            >
              {command.riskLevel} {command.probability != null ? `· ${Math.round(command.probability)}/100` : ''}
            </span>
          ) : (
            <span className="rounded bg-slate-400/15 px-2 py-0.5 text-xs font-bold text-slate-300">
              Unavailable
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-300">Rainfall now / 24h</span>
          <span className="text-xs font-medium text-slate-100">
            {weather.currentRainfall != null ? `${weather.currentRainfall} mm/h` : '—'}
            <span className="text-slate-400"> / </span>
            {weather.rainfall24h != null ? `${weather.rainfall24h} mm` : '—'}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-300">Nearest mapped river</span>
          <span className="text-xs font-medium text-slate-100">
            {formatRiverDistance(terrain.riverDistance)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-300">Historical context</span>
          <span className="max-w-[55%] text-right text-[11px] leading-4 text-slate-200">
            {historicalLine}
          </span>
        </div>
      </div>

      {riskOrigin === 'unavailable' && (
        <p className="mt-3 border-t border-white/10 pt-2 text-[10px] leading-4 text-slate-400">
          No ML prediction — no demo value was substituted.
        </p>
      )}
      {riskOrigin === 'demo' && (
        <p className="mt-3 border-t border-white/10 pt-2 text-[10px] leading-4 text-slate-400">
          Deterministic demo/simulation scenario — not live, not a forecast.
        </p>
      )}
    </div>
  )
}

function HistoricalEventMarker({ event }: { event: HistoricalEvent }) {
  return (
    <CircleMarker
      center={[event.latitude as number, event.longitude as number]}
      radius={9}
      pathOptions={{
        color: HISTORICAL_COLOR,
        weight: 3,
        dashArray: '3 4',
        fillColor: HISTORICAL_COLOR,
        fillOpacity: 0.25,
      }}
    >
      <Popup>
        <div className="max-w-[240px] text-[12px]">
          <p className="text-[9px] font-bold tracking-[.12em] text-historical">
            HISTORICAL FLOOD RECORD
          </p>
          <p className="mt-1 text-sm font-semibold">
            DFO report #{event.reportNumber || event.fid}
          </p>
          <p className="text-[11px] text-slate-600">
            {event.beginDate ?? event.endDate ?? 'Date not recorded'}
            {event.endDate && event.endDate !== event.beginDate ? ` – ${event.endDate}` : ''}
          </p>
          <dl className="mt-1.5 space-y-0.5 text-[11px]">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Anchored ~</dt>
              <dd>{formatRiverDistance(event.distanceM)}</dd>
            </div>
            {event.country ? (
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Country</dt>
                <dd>{event.country}</dd>
              </div>
            ) : null}
            {event.cause ? (
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Cause</dt>
                <dd className="text-right">{event.cause}</dd>
              </div>
            ) : null}
            {event.severity != null ? (
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Severity</dt>
                <dd>{event.severity}</dd>
              </div>
            ) : null}
            {event.floodImpactIndex != null ? (
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Flood impact</dt>
                <dd>{event.floodImpactIndex}</dd>
              </div>
            ) : null}
          </dl>
          <p className="mt-1.5 text-[10px] leading-4 text-slate-500">
            Recorded event from the DFO Global Flood Records catalogue — not an
            active flood, and not a guarantee that the exact point flooded.
          </p>
        </div>
      </Popup>
    </CircleMarker>
  )
}

function SafePlaceMarker({
  place,
  focused,
}: {
  place: SafePlaceItem
  focused: boolean
}) {
  return (
    <CircleMarker
      center={[place.latitude, place.longitude]}
      radius={10}
      pathOptions={{
        color: PLACE_COLOR,
        weight: 4,
        fillColor: PLACE_FILL,
        fillOpacity: 0.9,
      }}
    >
      {focused && (
        <Tooltip direction="top" offset={[0, -14]} permanent>
          <span className="text-[11px] font-bold">
            #{place.rank} · {place.name ?? place.categoryLabel}
          </span>
        </Tooltip>
      )}
      <Popup>
        <div className="max-w-[250px] text-[12px]">
          <p className="text-[9px] font-bold tracking-[.12em] text-emerald-600">
            POTENTIAL SAFE / EMERGENCY DESTINATION
          </p>
          <p className="mt-1 text-sm font-semibold">{place.name ?? place.categoryLabel}</p>
          <p className="text-[11px] text-slate-600">{place.categoryLabel}</p>
          <dl className="mt-1.5 space-y-0.5 text-[11px]">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">from location</dt>
              <dd>{formatRiverDistance(place.distanceM)}</dd>
            </div>
            {place.address ? (
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Address</dt>
                <dd className="text-right">{place.address}</dd>
              </div>
            ) : null}
            {place.elevationM != null ? (
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Elevation</dt>
                <dd>
                  {Math.round(place.elevationM)} m
                  {place.elevationDiffM != null
                    ? ` (${place.elevationDiffM >= 0 ? '+' : ''}${Math.round(place.elevationDiffM)} m vs location)`
                    : ''}
                </dd>
              </div>
            ) : null}
            {place.nearestRiverDistanceM != null ? (
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Nearest river</dt>
                <dd>{formatRiverDistance(place.nearestRiverDistanceM)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Coordinates</dt>
              <dd>
                {place.latitude.toFixed(4)}, {place.longitude.toFixed(4)}
              </dd>
            </div>
          </dl>
          <p className="mt-1.5 text-[10px] leading-4 text-slate-500">
            #{place.rank} in a transparent ranking ({place.rankingReason}; source:{' '}
            {place.source}). Candidate destination — not officially certified and not a
            guarantee of safety. Verify local authority guidance before evacuating.
          </p>
        </div>
      </Popup>
    </CircleMarker>
  )
}

function LayerControl({
  layers,
  onLayersChange,
}: {
  layers: FloodIntelligenceLayerState
  onLayersChange: (next: FloodIntelligenceLayerState) => void
}) {
  const items: Array<{ key: keyof FloodIntelligenceLayerState; label: string; hint?: string }> = [
    { key: 'selected', label: 'Selected location' },
    { key: 'historical', label: 'Historical flood records', hint: 'DFO catalogue' },
    { key: 'places', label: 'Potential safe places', hint: 'OpenStreetMap' },
    { key: 'rivers', label: 'Rivers / hydrology', hint: 'HydroRIVERS v1.0' },
    { key: 'terrain', label: 'Terrain basemap', hint: 'OpenTopoMap' },
  ]
  return (
    <div className="w-full max-w-[13rem] rounded-xl border border-white/10 bg-abyss/92 p-4 shadow-2xl backdrop-blur-sm">
      <p className="text-[10px] font-bold tracking-[.15em] text-slate-400">MAP LAYERS</p>
      <div className="mt-3 space-y-2.5">
        {items.map((item) => (
          <label key={item.key} className="flex cursor-pointer items-center gap-2.5 text-[12px] text-slate-200">
            <input
              type="checkbox"
              checked={layers[item.key]}
              onChange={() => onLayersChange({ ...layers, [item.key]: !layers[item.key] })}
              className="accent-command"
            />
            <span>
              {item.label}
              {item.hint ? (
                <>
                  <br />
                  <span className="text-[10px] text-slate-500">{item.hint}</span>
                </>
              ) : null}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

function Legend() {
  return (
    <div className="w-56 rounded-xl border border-white/10 bg-abyss/92 p-4 shadow-2xl backdrop-blur-sm">
      <p className="text-[10px] font-bold tracking-[.15em] text-slate-400">LEGEND</p>
      <ul className="mt-3 space-y-2 text-[11px] text-slate-300">
        <li className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-full border-2"
            style={{ borderColor: SELECTED_COLOR, backgroundColor: 'rgba(103,232,249,0.35)' }}
          />
          Selected location
        </li>
        <li className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-full border-2 border-dashed"
            style={{ borderColor: HISTORICAL_COLOR }}
          />
          Historical flood record
        </li>
        <li className="flex items-center gap-2">
          <span className="h-0.5 w-5 rounded" style={{ backgroundColor: RIVER_COLOR }} />
          Mapped river (real)
        </li>
        <li className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-full border-2"
            style={{ borderColor: PLACE_COLOR, backgroundColor: PLACE_FILL }}
          />
          Potential safe / emergency destination
        </li>
      </ul>
      <p className="mt-3 border-t border-white/10 pt-2 text-[10px] leading-4 text-slate-500">
        Records are DFO catalogue events found near the selected location — not
        every flood, and not active flood alerts.
      </p>
    </div>
  )
}

function RiverNote({ rivers }: { rivers: RiverLayerState }) {
  let text: string
  if (rivers.status === 'LOADING') text = 'Loading mapped river geometry…'
  else if (rivers.status === 'ERROR') text = 'River geometry unavailable (request failed)'
  else if (rivers.status === 'UNAVAILABLE') text = 'River geometry unavailable (local index missing)'
  else if (rivers.segments.length === 0)
    text = 'No mapped river segment within the search radius (HydroRIVERS)'
  else if (rivers.truncated) text = `River geometry truncated — first ${rivers.segments.length} segments shown`
  else text = `${rivers.segments.length} mapped river segments (real)`
  return (
    <div className="pointer-events-none absolute bottom-3 right-3 z-[600] rounded-md border border-white/10 bg-abyss/85 px-2.5 py-1.5 text-[10px] font-semibold text-slate-300 shadow-lg">
      {text}
    </div>
  )
}

function PlaceNote({ places }: { places: PlaceLayerState }) {
  let text: string
  if (places.status === 'LOADING') text = 'Loading candidate emergency destinations…'
  else if (places.status === 'ERROR') text = 'Safe places unavailable (request failed — no data shown)'
  else if (places.status === 'UNAVAILABLE')
    text = 'Safe places unavailable (OpenStreetMap unreachable — no data shown)'
  else if (places.places.length === 0)
    text = 'No candidate destination within the search radius (OpenStreetMap)'
  else
    text = `${places.places.length} candidate destinations · ranked by type then distance (OpenStreetMap)`
  return (
    <div className="pointer-events-none absolute bottom-14 right-3 z-[600] rounded-md border border-white/10 bg-abyss/85 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-200 shadow-lg">
      {text}
    </div>
  )
}

export function FloodIntelligenceMap({
  location,
  command,
  riskOrigin,
  rivers,
  places,
  focusedPlaceKey,
  initialLayers = DEFAULT_LAYER_STATE,
}: {
  location: DemoLocation
  command: RiskCommand
  riskOrigin: RiskOrigin
  rivers: RiverLayerState
  places: PlaceLayerState
  focusedPlaceKey?: string | null
  initialLayers?: FloodIntelligenceLayerState
}) {
  const [layers, setLayers] = useState<FloodIntelligenceLayerState>(initialLayers)
  const coordinatesAvailable =
    Number.isFinite(location.latitude) && Number.isFinite(location.longitude)
  const historicalEvents = historicalEventsWithCoords(command.historical)
  const safePlaces = validSafePlaceItems(places)
  const showHistoricalLayer = layers.historical && historicalEvents.length > 0
  const showPlaceLayer = layers.places && coordinatesAvailable && safePlaces.length > 0
  const focusedPlace =
    (focusedPlaceKey
      ? safePlaces.find((place) => place.key === focusedPlaceKey)
      : null) ?? null
  const showRiverLines =
    layers.rivers && rivers.status === 'AVAILABLE' && rivers.segments.length > 0
  const historicalNote = (() => {
    if (!layers.historical) return null
    if (riskOrigin === 'demo') return 'Historical flood records unavailable in demo/simulation mode'
    const historical = command.historical
    if (!historical || historical.status === 'UNAVAILABLE')
      return 'Historical flood records unavailable (local index missing)'
    if (historicalEvents.length === 0)
      return `No recorded DFO flood event within ${Math.round(historical.searchRadiusM / 1000)} km`
    return null
  })()

  return (
    <div className="relative h-[420px] overflow-hidden rounded-2xl border border-white/10 sm:h-[540px]">
      {coordinatesAvailable ? (
        <MapContainer
          center={[location.latitude, location.longitude]}
          zoom={11}
          scrollWheelZoom
          className="h-full w-full"
          aria-label="Flood intelligence map — live risk, DFO flood records, mapped rivers and potential safe places"
        >
          <TileLayerWithHealth key={`${location.latitude}-${location.longitude}`} terrain={layers.terrain} />
          <FlyToSelected latitude={location.latitude} longitude={location.longitude} />
          {showPlaceLayer && (
            <FlyToPlace place={focusedPlaceKey ? focusedPlace : null} />
          )}

          {layers.selected && (
            <CircleMarker
              center={[location.latitude, location.longitude]}
              radius={11}
              pathOptions={{ color: SELECTED_COLOR, fillColor: '#0e7490', fillOpacity: 0.9 }}
            >
              <Popup>
                <div className="max-w-[200px] text-[12px]">
                  <p className="text-[9px] font-bold tracking-[.12em] text-command-deep">
                    SELECTED LOCATION
                  </p>
                  <p className="mt-1 text-sm font-semibold">{location.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-500">
                    {location.status === 'ARBITRARY' ? 'Searched coordinates' : 'Selected place'} ·{' '}
                    {riskStatusLabel(riskOrigin)}
                  </p>
                </div>
              </Popup>
            </CircleMarker>
          )}

          {showHistoricalLayer &&
            historicalEvents.map((event) => (
              <HistoricalEventMarker key={event.fid} event={event} />
            ))}

          {showPlaceLayer &&
            safePlaces.map((place) => (
              <SafePlaceMarker
                key={place.key}
                place={place}
                focused={place.key === focusedPlaceKey}
              />
            ))}

          {showRiverLines &&
            rivers.segments.map((seg, index) => (
              <Polyline
                key={`${seg.join(',')}-${index}`}
                positions={[
                  [seg[1], seg[0]],
                  [seg[3], seg[2]],
                ]}
                pathOptions={{ color: RIVER_COLOR, weight: 3 }}
              >
                <Popup>Mapped river segment (HydroRIVERS v1.0 — real data)</Popup>
              </Polyline>
            ))}
        </MapContainer>
      ) : (
        <div className="flex h-full items-center justify-center bg-panel-2 p-6">
          <p className="text-sm leading-6 text-slate-400">
            Location coordinates unavailable — select a place or enter coordinates to centre the map.
          </p>
        </div>
      )}

      <RiverNote rivers={rivers} />

      <PlaceNote places={places} />

      {historicalNote && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-[600] w-[min(92%,440px)] -translate-x-1/2 rounded-lg border border-white/10 bg-[#07151a]/90 px-3 py-2 text-center text-[10px] font-semibold text-slate-300 shadow-lg">
          {historicalNote}
        </div>
      )}

      <div className="absolute inset-x-3 top-3 z-[700] flex flex-wrap items-start justify-between gap-2">
        <RiskStatusPanel command={command} riskOrigin={riskOrigin} />
        <LayerControl layers={layers} onLayersChange={setLayers} />
      </div>

      <div className="absolute bottom-16 left-3 z-[700]">
        <Legend />
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 z-[600] rounded-md border border-white/10 bg-abyss/85 px-2.5 py-1.5 text-[10px] font-semibold text-command-soft shadow-lg">
        {layers.terrain ? 'TERRAIN · OpenTopoMap' : 'BASEMAP · OpenStreetMap'}
      </div>
    </div>
  )
}