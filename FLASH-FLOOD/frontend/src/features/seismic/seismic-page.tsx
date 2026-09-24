import { RadioTower } from 'lucide-react'
import { PageHeader } from '../../components/layout/page-header'
import { DataStatusBadge } from '../../components/status/data-status-badge'
import { useCommand } from '../command-center/command-context'

export function SeismicPage() {
  const { seismic, dataSource, isLoading, location } = useCommand()
  const event = seismic[0]
  const hazards = event?.secondaryHazards ?? []
  const live = event?.dataStatus === 'LIVE'
  const sourceLabel = live
    ? 'LIVE SOURCE'
    : dataSource === 'api'
      ? 'API · DEMO DATA'
      : 'DEMO / SIMULATION'
  return (
    <>
      <PageHeader
        eyebrow="SEISMIC MONITORING"
        title="Earthquake events and secondary-hazard awareness"
        description="FlashGuard does not predict earthquakes. This module represents monitored/detected event information and possible secondary-hazard context from the backend, not a prediction."
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DataStatusBadge
          label={dataSource === 'api' ? 'API · DEMO DATA' : 'DEMO / SIMULATION'}
        />
        {isLoading && (
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
            Refreshing seismic data…
          </p>
        )}
      </div>
      {event ? (
        <div className="mt-4 grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
          <section className="border border-amber-300/20 bg-amber-300/[.06] p-6">
            <RadioTower className="text-amber-100" />
            <p className="mt-5 text-[11px] font-bold tracking-[.15em] text-amber-100">
              {event.status === 'NO RECENT EVENT'
                ? 'SEISMIC MONITORING · NO RECENT EVENT'
                : event.status === 'DATA UNAVAILABLE'
                  ? 'SEISMIC MONITORING · DATA UNAVAILABLE'
                  : `RECENT EVENT · ${sourceLabel}`}
            </p>
            {event.magnitude != null ? (
              <h2 className="mt-2 text-3xl font-black text-white">M {event.magnitude}</h2>
            ) : (
              <h2 className="mt-2 text-xl font-bold text-white">
                No detected event in the monitored radius
              </h2>
            )}
            {event.latitude != null && event.longitude != null && event.depthKm != null && (
              <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
                <p>
                  <span className="block text-xs text-slate-500">Depth</span>
                  {event.depthKm} km
                </p>
                <p>
                  <span className="block text-xs text-slate-500">Distance</span>
                  {event.distanceKm != null ? `${event.distanceKm} km` : '—'}
                </p>
                <p>
                  <span className="block text-xs text-slate-500">Epicenter</span>
                  {event.latitude.toFixed(3)}, {event.longitude.toFixed(3)}
                </p>
                <p>
                  <span className="block text-xs text-slate-500">Event time</span>
                  {event.time || '—'}
                </p>
                <p>
                  <span className="block text-xs text-slate-500">Seismic status</span>
                  {event.status}
                </p>
                <p>
                  <span className="block text-xs text-slate-500">Monitored region</span>
                  {location.name}
                </p>
              </div>
            )}
            <p className="mt-5 border-t border-white/10 pt-4 text-xs leading-5 text-slate-400">
              {event.note || 'Monitoring only. FlashGuard does not predict earthquakes.'}
            </p>
          </section>
          <section className="border border-white/8 bg-white/[.03] p-6">
            <p className="text-[11px] font-bold tracking-[.15em] text-slate-400">
              SECONDARY HAZARD WATCH
            </p>
            <h2 className="mt-2 text-xl font-bold text-white">Potential concerns</h2>
            {hazards.length > 0 ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {hazards.map((hazard) => (
                  <div key={hazard.name} className="border-l-2 border-amber-300/50 bg-black/10 p-3">
                    <p className="font-semibold text-white">{hazard.name}</p>
                    <p className="mt-1 text-xs text-amber-100">{hazard.status}</p>
                    {event.dataStatus !== 'LIVE' && (
                      <p className="mt-2 text-xs text-slate-500">Demo status; not a real detection.</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-5 border border-dashed border-white/15 p-4 text-sm text-slate-400">
                No monitored secondary hazards are currently reported near {location.name}.
              </p>
            )}
            <p className="mt-5 text-xs leading-5 text-slate-500">
              Earthquake prediction is not provided and no earthquake prediction data is stored.
              FlashGuard monitors seismic events only.
            </p>
          </section>
        </div>
      ) : (
        <p className="mt-4 border border-dashed border-white/15 p-8 text-center text-slate-400">
          No seismic event data is available.
        </p>
      )}
    </>
  )
}