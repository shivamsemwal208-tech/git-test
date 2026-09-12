import { useEffect, useState } from 'react'
import { AlertTriangle, PhoneCall, Siren } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { CommandMap } from '../../components/map/command-map'
import { DataStatusBadge } from '../../components/status/data-status-badge'
import { useCommand } from '../command-center/command-context'
import { demoCommandService } from '../../services/demo-command-service'
import { hasRisk, mapEvacuationRoute, postEvacuationAssessment, riskOrigin } from '../../api/risk-api'
import type { DemoRoute } from '../../types/evacuation'

interface RouteFetchState {
  key: string
  route: DemoRoute | null
  error: string | null
}

export function EmergencyPage() {
  const { command, safePlaces, alerts, seismic, location, scenarioId, dataSource, isLoading } =
    useCommand()
  const navigate = useNavigate()
  const place = safePlaces[0]
  const [routeState, setRouteState] = useState<RouteFetchState>({ key: '', route: null, error: null })

  useEffect(() => {
    if (!place) return
    const requestKey = `${location.id}:${place.id}:${scenarioId}`
    let active = true
    postEvacuationAssessment(location, place.id, scenarioId)
      .then((assessment) => {
        if (!active) return
        setRouteState({ key: requestKey, route: mapEvacuationRoute(assessment), error: null })
      })
      .catch(() => {
        if (!active) return
        setRouteState({
          key: requestKey,
          route: null,
          error: location.status === 'ARBITRARY'
            ? 'No evacuation guidance available for arbitrary coordinates'
            : 'Evacuation API unavailable — using demo route',
        })
      })
    return () => {
      active = false
    }
  }, [location, place, scenarioId])

  const routeKey = `${location.id}:${place?.id}:${scenarioId}`
  const current = routeState.key === routeKey
  const route = current && routeState.route ? routeState.route : place ? demoCommandService.route(location, place) : null
  const event = seismic[0]
  const activeAlert = alerts[0]
  const origin = riskOrigin(command)
  const riskAvailable = hasRisk(command.probability, command.riskLevel)
  const label =
    origin === 'live'
      ? 'LIVE · ML PREDICTION'
      : origin === 'unavailable'
        ? 'LIVE · UNAVAILABLE'
        : dataSource === 'api'
          ? 'API · DEMO DATA'
          : 'DEMO / SIMULATION'

  return (
    <div className="mx-auto max-w-6xl bg-[#090d12] p-1">
      <section className="border-2 border-rose-400/70 bg-gradient-to-b from-rose-950/35 to-[#090d12] p-5 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-rose-100">
            <Siren size={30} />
            <p className="font-black tracking-[.14em]">EMERGENCY MODE · {label}</p>
          </div>
          <DataStatusBadge label={label} />
        </div>
        {isLoading && (
          <p className="mt-3 flex items-center gap-2 text-xs text-slate-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
            Updating situation data for {location.name}…
          </p>
        )}
        <h1 className="mt-8 text-4xl font-black tracking-tight text-white sm:text-6xl">
          {riskAvailable ? `${command.riskLevel} FLOOD RISK` : 'FLOOD RISK UNAVAILABLE'}
        </h1>
        <p className="mt-3 text-sm font-bold text-cyan-200">
          {command.probability != null
            ? `Flood probability — ${command.probability}%`
            : 'Flood probability — unavailable (no prediction at these coordinates)'}
        </p>
        {origin === 'live' && (
          <p className="mt-1 text-xs text-slate-400">
            Live ML baseline estimate · model {command.modelVersion ?? '—'}
          </p>
        )}
        {origin === 'unavailable' && (
          <p className="mt-1 text-xs text-slate-400">
            Prediction reason: {command.reason ?? 'unknown'} — no demo/scenario probability was substituted.
          </p>
        )}
        <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-200">{command.action}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {command.factors.map((factor) => (
            <span
              key={factor}
              className="border border-rose-300/30 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-100"
            >
              {factor}
            </span>
          ))}
        </div>
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <p>
            <span className="font-bold">Warning:</span> {command.warning}
            {activeAlert ? ` — ${activeAlert.title}. ${activeAlert.action}` : ''}
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={() => navigate('/evacuation')}
            className="bg-cyan-200 px-5 py-3 text-sm font-bold text-[#062125]"
          >
            VIEW EVACUATION ROUTE
          </button>
          <button
            onClick={() => navigate('/safe-places')}
            className="border border-cyan-300/40 px-5 py-3 text-sm font-bold text-cyan-100"
          >
            VIEW SAFE PLACES
          </button>
          <button
            onClick={() => navigate('/alerts')}
            className="border border-rose-300/40 px-5 py-3 text-sm font-bold text-rose-100"
          >
            VIEW CURRENT ALERTS
          </button>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="border border-white/15 bg-black/25 p-5">
            <p className="text-xs font-bold tracking-[.14em] text-cyan-200">RECOMMENDED SAFE PLACE</p>
            <h2 className="mt-2 text-xl font-bold text-white">{place?.name}</h2>
            <p className="mt-2 text-slate-300">
              {place?.distanceKm} km · {place?.elevationM} m elevation · {place?.status}
            </p>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              {place?.recommendation ??
                'Suggested lower-risk destination based on demo data; not guaranteed safe.'}
            </p>
          </div>
          <div className="border border-white/15 bg-black/25 p-5">
            <p className="text-xs font-bold tracking-[.14em] text-cyan-200">EVACUATION ROUTE</p>
            <h2 className="mt-2 text-xl font-bold text-white">{place?.name}</h2>
            <p className="mt-2 text-slate-300">
              {route
                ? `${route.distanceKm} km · ${route.destinationElevationM} m elevation · ${route.status}`
                : 'Calculating route…'}
            </p>
            <p className="mt-3 text-xs leading-5 text-slate-500">{route?.warning}</p>
          </div>
          <div className="border border-white/15 bg-black/25 p-5">
            <p className="text-xs font-bold tracking-[.14em] text-cyan-200">EMERGENCY CONTACTS</p>
            <p className="mt-3 text-sm text-slate-300">
              Official emergency contacts are not connected in this prototype.
            </p>
            <div className="mt-4 flex items-center gap-2 text-amber-100">
              <PhoneCall size={18} /> Contact local emergency authorities
            </div>
          </div>
        </div>

        {activeAlert && (
          <div className="mt-4 border border-white/15 bg-black/25 p-5">
            <p className="text-xs font-bold tracking-[.14em] text-rose-200">
              ACTIVE WARNING · {activeAlert.severity} · {activeAlert.location}
            </p>
            <h3 className="mt-2 font-bold text-white">{activeAlert.title}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-400">{activeAlert.reason}</p>
            <p className="mt-1 text-sm leading-6 text-slate-300">{activeAlert.action}</p>
          </div>
        )}

        {event && (
          <div className="mt-4 border border-white/15 bg-black/25 p-5">
            <p className="text-xs font-bold tracking-[.14em] text-amber-100">
              SEISMIC MONITORING · {event.status}
            </p>
            {event.magnitude != null ? (
              <p className="mt-2 text-sm leading-6 text-slate-300">
                M {event.magnitude}
                {event.depthKm != null ? ` · ${event.depthKm} km deep` : ''}
                {event.distanceKm != null ? ` · ${event.distanceKm} km away` : ''}
                {event.time ? ` · ${event.time}` : ''}
              </p>
            ) : (
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {event.status === 'NO RECENT EVENT'
                  ? 'No recent earthquake detected in the monitored radius.'
                  : 'Seismic monitoring data is currently unavailable.'}
              </p>
            )}
            {event.secondaryHazards && event.secondaryHazards.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {event.secondaryHazards.map((hazard) => (
                  <span
                    key={hazard.name}
                    className="border border-amber-300/25 bg-amber-300/10 px-2 py-1 text-xs text-amber-100"
                  >
                    {hazard.name}: {hazard.status}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-3 text-xs text-slate-500">
              FlashGuard does not predict earthquakes. Monitoring only.
            </p>
          </div>
        )}

        <div className="mt-5">
          <CommandMap layers={{ risk: true, rivers: true, places: true, route: true }} route={route ?? undefined} />
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-500">
          FlashGuard is a decision-support prototype and does not replace official authorities. The
          displayed risk is {origin === 'live' ? 'a live ML baseline estimate based on current features at these coordinates' : dataSource === 'api' ? 'backend demo data' : 'simulated demo data'};
          demonstration locations and routes are not guaranteed safe.
        </p>
      </section>
    </div>
  )
}