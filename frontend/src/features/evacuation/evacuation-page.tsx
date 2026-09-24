import { useEffect, useState } from 'react'
import { ArrowDown, Navigation } from 'lucide-react'
import { CommandMap } from '../../components/map/command-map'
import { PageHeader } from '../../components/layout/page-header'
import { DataStatusBadge } from '../../components/status/data-status-badge'
import { useCommand } from '../command-center/command-context'
import { demoCommandService } from '../../services/demo-command-service'
import { mapEvacuationRoute, postEvacuationAssessment } from '../../api/risk-api'
import type { DemoRoute } from '../../types/evacuation'

interface RouteFetchState {
  key: string
  route: DemoRoute | null
  error: string | null
}

export function EvacuationPage() {
  const { location, safePlaces, scenarioId } = useCommand()
  const [destinationId, setDestinationId] = useState<string | null>(null)
  const [routeState, setRouteState] = useState<RouteFetchState>({ key: '', route: null, error: null })

  const destination = safePlaces.find((place) => place.id === destinationId) ?? safePlaces[0]

  useEffect(() => {
    if (!destination) return
    const requestKey = `${location.id}:${destination.id}:${scenarioId}`
    let active = true
    postEvacuationAssessment(location, destination.id, scenarioId)
      .then((assessment) => {
        if (!active) return
        setRouteState({ key: requestKey, route: mapEvacuationRoute(assessment), error: null })
      })
      .catch(() => {
        if (!active) return
        setRouteState({
          key: requestKey,
          route: null,
          error: 'Evacuation API unavailable — using demo route',
        })
      })
    return () => {
      active = false
    }
  }, [location, destination, scenarioId])

  const current = routeState.key === `${location.id}:${destination?.id}:${scenarioId}`
  const fromApi = current && routeState.route !== null
  const route =
    current && routeState.route
      ? routeState.route
      : destination
        ? demoCommandService.route(location, destination)
        : null

  return (
    <>
      <PageHeader
        eyebrow="EVACUATION ASSISTANCE"
        title="Illustrative lower-risk route context"
        description="The suggested route is based on available demo data and is not guaranteed safe. Follow official instructions and current road conditions."
      />
      {!current && <div className="mb-4 text-xs text-slate-500">Loading route assessment…</div>}
      {routeState.error && current && (
        <div className="mb-4 rounded-lg border border-sev-high/40 bg-sev-high/15 px-4 py-2 text-xs text-sev-high-soft">
          {routeState.error}
        </div>
      )}
      <div className="flex justify-end">
        <DataStatusBadge
          label={
            location.status === 'ARBITRARY'
              ? 'DEMO / UNAVAILABLE'
              : fromApi
                ? 'API · DEMO DATA'
                : 'DEMO / SIMULATION'
          }
        />
      </div>
      {safePlaces.length === 0 && (
        <div className="mb-4 border border-white/10 bg-white/[.02] px-4 py-3 text-xs text-slate-400">
          No safe-place data is available for this location, so no evacuation route can be
          rendered. Follow official local instructions in a real emergency.
        </div>
      )}
      <div className="mt-4 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,.75fr)_minmax(0,1.25fr)]">
        <section className="panel p-6">
          <p className="eyebrow-command">SELECT DESTINATION</p>
          <div className="mt-3 space-y-2">
            {safePlaces.map((place) => {
              const active = place.id === destination?.id
              return (
                <button
                  key={place.id}
                  onClick={() => setDestinationId(place.id)}
                  className={`flex w-full items-start gap-3 border px-3 py-2.5 text-left ${active ? 'border-command/60 bg-command/10' : 'border-white/8 bg-white/[.02] hover:border-white/20'}`}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${active ? 'bg-command' : 'bg-slate-600'}`} />
                  <span>
                    <span className="block text-sm font-semibold text-white">{place.name}</span>
                    <span className="block text-xs text-slate-400">
                      {place.category} · {place.distanceKm} km · {place.status}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
          <p className="mt-4 border-t border-white/8 pt-4 text-[11px] font-bold tracking-[.15em] text-command-soft">
            ILLUSTRATIVE DEMO ROUTE
          </p>
          <div className="mt-4 space-y-3">
            <div>
              <p className="text-xs text-slate-500">YOUR LOCATION</p>
              <p className="mt-1 font-semibold text-white">
                {location.name}, {location.state}
              </p>
            </div>
            <ArrowDown className="text-command-soft" />
            <div>
              <p className="text-xs text-slate-500">SUGGESTED DESTINATION</p>
              <p className="mt-1 font-semibold text-white">{destination?.name}</p>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 border-y border-white/8 py-4">
            <p>
              <span className="block text-xs text-slate-500">Distance</span>
              {route?.distanceKm ?? '—'} km
            </p>
            <p>
              <span className="block text-xs text-slate-500">Destination elevation</span>
              {route?.destinationElevationM ?? '—'} m
            </p>
          </div>
          <p className="mt-5 text-sm font-semibold text-command-soft">{route?.status}</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">{route?.reason}</p>
          <p className="mt-4 text-xs leading-5 text-slate-500">{route?.warning}</p>
        </section>
        <section>
          <CommandMap layers={{ risk: true, rivers: true, places: true, route: true }} route={route ?? undefined} />
          <div className="mt-3 flex gap-2 text-xs text-slate-500">
            <Navigation size={15} className="text-command-soft" />
            Route geometry sourced from {fromApi ? 'the backend demo service' : 'the frontend demo fixture'} · not a
            routing-engine result.
          </div>
        </section>
      </div>
    </>
  )
}