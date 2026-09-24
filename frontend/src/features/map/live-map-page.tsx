import { useEffect, useState } from 'react'
import { useCommand } from '../command-center/command-context'
import { fetchNearbyRiverSegments } from '../../api/rivers-api'
import { fetchSafePlaces } from '../../api/safe-places-api'
import { formatRiverDistance, type RiskCommand } from '../../api/risk-api'
import { PageHeader } from '../../components/layout/page-header'
import type { DemoLocation } from '../../types/location'
import type { RiskOrigin } from '../../types/risk'
import { FloodIntelligenceMap } from './flood-intelligence-map'
import {
  EMPTY_PLACE_LAYER,
  EMPTY_RIVER_LAYER,
  type PlaceLayerState,
  type RiverLayerState,
} from './flood-intelligence-state'

/**
 * Live Map — the real-data flood intelligence surface.
 *
 * Every layer is backed by real source data: live Open-Meteo weather + the ML
 * baseline risk prediction, recorded DFO flood events (informational only),
 * HydroRIVERS v1.0 mapped river geometry, and potential safe/emergency
 * destinations discovered on OpenStreetMap. There is no illustrative demo
 * overlay here, and demo/simulation risk is surfaced with an explicit DEMO
 * label.
 */
export function LiveMapPage() {
  const { location, command, riskOrigin } = useCommand()

  return (
    <>
      <PageHeader
        eyebrow="LIVE MAP"
        title="Flood intelligence map"
        description="Live ML risk, recorded DFO flood events, real HydroRIVERS river geometry, and candidate emergency destinations for the selected location. No illustrative overlays — every layer here is real data."
      />
      {/* Keyed on the place id so switching location resets the map layers —
          no stale segments or places are ever shown for the wrong location. */}
      <LiveMapFeed key={location.id} location={location} command={command} riskOrigin={riskOrigin} />
    </>
  )
}

/**
 * Owns the real river-geometry and safe-place layers for one location. State is
 * only ever written from the async fetch callbacks, never synchronously from
 * the effect.
 */
function LiveMapFeed({
  location,
  command,
  riskOrigin,
}: {
  location: DemoLocation
  command: RiskCommand
  riskOrigin: RiskOrigin
}) {
  const [riverState, setRiverState] = useState<RiverLayerState>(EMPTY_RIVER_LAYER)
  const [placeState, setPlaceState] = useState<PlaceLayerState>(EMPTY_PLACE_LAYER)
  const [focusedPlaceKey, setFocusedPlaceKey] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const coordinatesAvailable =
      Number.isFinite(location.latitude) && Number.isFinite(location.longitude)

    const riverRequest = coordinatesAvailable
      ? fetchNearbyRiverSegments(location)
      : Promise.resolve(null)

    riverRequest
      .then((result) => {
        if (!active) return
        if (result === null) {
          setRiverState({
            status: 'UNAVAILABLE',
            segments: [],
            truncated: false,
            disclaimer: 'Location coordinates are unavailable.',
          })
          return
        }
        setRiverState(
          result.status === 'AVAILABLE'
            ? {
                status: 'AVAILABLE',
                segments: result.segments,
                truncated: result.truncated,
                disclaimer: result.disclaimer,
              }
            : {
                status: 'UNAVAILABLE',
                segments: [],
                truncated: false,
                disclaimer: result.disclaimer,
              },
        )
      })
      .catch(() => {
        if (!active) return
        setRiverState({
          status: 'ERROR',
          segments: [],
          truncated: false,
          disclaimer: null,
        })
      })

    const placeRequest = coordinatesAvailable
      ? fetchSafePlaces(location)
      : Promise.resolve(null)

    placeRequest
      .then((result) => {
        if (!active) return
        if (result === null) {
          setPlaceState({
            status: 'UNAVAILABLE',
            places: [],
            disclaimer: 'Location coordinates are unavailable.',
          })
          return
        }
        setPlaceState(
          result.status === 'AVAILABLE'
            ? {
                status: 'AVAILABLE',
                places: result.places,
                disclaimer: result.disclaimer,
              }
            : {
                status: 'UNAVAILABLE',
                places: [],
                disclaimer: result.disclaimer,
              },
        )
      })
      .catch(() => {
        if (!active) return
        setPlaceState({
          status: 'ERROR',
          places: [],
          disclaimer: null,
        })
      })

    return () => {
      active = false
    }
  }, [location])

  const riverLine = (() => {
    if (riverState.status === 'AVAILABLE' && riverState.segments.length > 0)
      return `${riverState.segments.length} real mapped segments · HydroRIVERS v1.0`
    if (riverState.status === 'AVAILABLE')
      return 'Index available · no mapped river segment in range (HydroRIVERS)'
    if (riverState.status === 'ERROR') return 'River geometry unavailable — request failed'
    return 'River geometry unavailable — local index not built'
  })()

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <FloodIntelligenceMap
        location={location}
        command={command}
        riskOrigin={riskOrigin}
        rivers={riverState}
        places={placeState}
        focusedPlaceKey={focusedPlaceKey}
      />
      <aside className="min-w-0 space-y-5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
        <div>
          <p className="eyebrow">MAP LAYERS</p>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            Layer toggles, the risk status panel and the legend are overlaid on
            the map. Every option is backed by real data — there are no
            illustrative overlays.
          </p>
        </div>
        <div>
          <p className="eyebrow">DATA SOURCES</p>
          <ul className="mt-2 space-y-2.5 text-xs leading-5 text-slate-300">
            <li>
              <span className="font-semibold text-command-soft">Risk &amp; weather</span>
              <br />
              Live Open-Meteo weather + ML baseline risk prediction
              {riskOrigin === 'demo' ? '. Demo/simulation only right now.' : '.'}
            </li>
            <li>
              <span className="font-semibold text-historical">Flood records</span>
              <br />
              DFO Global Flood Records (informational only — never an ML feature)
            </li>
            <li>
              <span className="font-semibold text-emerald-400">Safe places</span>
              <br />
              {placeState.status === 'AVAILABLE'
                ? `${placeState.places.length} candidate destinations · OpenStreetMap`
                : placeState.status === 'LOADING'
                  ? 'Discovering candidate destinations…'
                  : 'OpenStreetMap unreachable — no destinations shown'}
            </li>
            <li>
              <span className="font-semibold text-command-soft">Rivers</span>
              <br />
              {riverLine}
            </li>
          </ul>
        </div>
        <div>
          <p className="eyebrow-safe">
            SAFE PLACES / EMERGENCY DESTINATIONS
          </p>
          {placeState.status === 'LOADING' ? (
            <p className="mt-2 text-xs leading-5 text-slate-400">
              Discovering candidate destinations near the location…
            </p>
          ) : placeState.status === 'ERROR' ? (
            <p className="mt-2 text-xs leading-5 text-sev-high-soft">
              Request failed — no destinations shown.
            </p>
          ) : placeState.status === 'UNAVAILABLE' ? (
            <p className="mt-2 text-xs leading-5 text-sev-high-soft">
              OpenStreetMap unreachable or coordinates unavailable — no
              destinations shown.
            </p>
          ) : placeState.places.length === 0 ? (
            <p className="mt-2 text-xs leading-5 text-slate-400">
              No candidate destination within the search radius
              (OpenStreetMap).
            </p>
          ) : (
            <>
              <ul className="mt-2 max-h-[300px] space-y-2 overflow-y-auto pr-1">
                {placeState.places.map((place) => (
                  <li
                    key={place.key}
                    className={
                      'rounded-lg border px-3 py-2.5 text-xs transition ' +
                      (focusedPlaceKey === place.key
                        ? 'border-emerald-400/60 bg-emerald-400/10'
                        : 'border-white/10 bg-white/[.03] hover:border-emerald-400/40')
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-emerald-100">
                        <span
                          data-testid={`place-rank-${place.rank}`}
                          className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400/20 text-[9px] font-bold text-emerald-300"
                        >
                          {place.rank}
                        </span>
                        {place.name ?? place.categoryLabel}
                      </span>
                      <span className="shrink-0 text-right text-[10px] text-slate-400">
                        {place.distanceM != null
                          ? formatRiverDistance(place.distanceM)
                          : '—'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] uppercase tracking-wide text-emerald-500/80">
                      {place.categoryLabel}
                    </p>
                    {place.address ? (
                      <p className="mt-1 leading-4 text-slate-400">{place.address}</p>
                    ) : null}
                    <p className="mt-1 text-[10px] leading-4 text-slate-500">
                      {place.latitude.toFixed(4)}, {place.longitude.toFixed(4)}
                      {place.elevationM != null ? ` · ${Math.round(place.elevationM)} m elevation` : ''}
                      {place.nearestRiverDistanceM != null
                        ? ` · river ${formatRiverDistance(place.nearestRiverDistanceM)}`
                        : ''}
                    </p>
                    {place.rankingReason ? (
                      <p className="mt-1 text-[10px] leading-4 text-emerald-400/70">
                        {place.rankingReason}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setFocusedPlaceKey(place.key)}
                      className="mt-2 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold tracking-wider text-emerald-200 hover:bg-emerald-400/20"
                    >
                      VIEW ON MAP ▲
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 border-t border-white/10 pt-2 text-[10px] leading-4 text-slate-500">
                Candidates are OpenStreetMap hospitals, clinics, fire/police
                stations, schools and community centres, ranked by type then
                distance. They are not certified safe and not guaranteed
                reachable during a flood — verify local authority guidance before
                evacuating.
              </p>
            </>
          )}
        </div>
        <div>
          <p className="eyebrow">HONESTY NOTE</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Recorded flood events are DFO catalogue entries near the location —
            not every flood and not active alerts. River geometry is limited to
            mapped streams. Candidate destinations are OpenStreetMap places, not
            certified safe sites. No value on this map is fabricated; unavailable
            sources are reported as unavailable.
          </p>
        </div>
      </aside>
    </div>
  )
}