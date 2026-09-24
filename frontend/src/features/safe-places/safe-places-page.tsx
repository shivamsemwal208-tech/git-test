import { MapPin, Route } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../../components/layout/page-header'
import { DataStatusBadge } from '../../components/status/data-status-badge'
import { useCommand } from '../command-center/command-context'

export function SafePlacesPage() {
  const { safePlaces, dataSource, isLoading, location } = useCommand()
  const navigate = useNavigate()
  return (
    <>
      <PageHeader
        eyebrow="SAFE PLACES"
        title="Suggested lower-risk locations"
        description={
          dataSource === 'api'
            ? `Backend-sourced suggested places for ${location.name}. These illustrative locations are not guaranteed safe. Availability and access must be confirmed with official authorities.`
            : 'These illustrative locations are not guaranteed safe. Availability and access must be confirmed with official authorities.'
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DataStatusBadge
          label={location.status === 'ARBITRARY' ? 'DEMO / UNAVAILABLE' : dataSource === 'api' ? 'API · DEMO DATA' : 'DEMO / SIMULATION'}
        />
        {isLoading && (
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <span className="pulse-dot" />
            Updating safe places…
          </p>
        )}
      </div>
      {safePlaces.length === 0 && (
        <p className="mt-4 border border-dashed border-white/15 p-8 text-center text-slate-400">
          No safe-place data is available for this location. Availability must be confirmed with
          official authorities.
        </p>
      )}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {safePlaces.map((place) => (
          <article key={place.id} className="hover-lift panel overflow-hidden rounded-2xl border-l-4 border-l-emerald-400/70 p-5">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
                <MapPin size={17} />
              </span>
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-emerald-300">Potential safe destination</p>
            </div>
            <h2 className="mt-4 text-lg font-bold text-white">{place.name}</h2>
            <p className="mt-1 text-sm text-slate-400">{place.category}</p>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <p className="rounded-lg bg-emerald-400/[0.06] px-2.5 py-2">
                <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-300/80">Distance</span>
                <b className="text-base text-emerald-200">{place.distanceKm} km</b>
              </p>
              <p className="rounded-lg bg-white/[0.03] px-2.5 py-2">
                <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Elevation</span>
                <b className="text-base text-white">{place.elevationM} m</b>
              </p>
              <p className="rounded-lg bg-white/[0.03] px-2.5 py-2">
                <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Status</span>
                <b className="text-base text-white">{place.status}</b>
              </p>
              <p className="rounded-lg bg-white/[0.03] px-2.5 py-2">
                <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Accessibility</span>
                <b className="text-base text-white">{place.accessibility}</b>
              </p>
            </div>
            <div className="mt-5 flex gap-2 border-t border-white/8 pt-4">
              <MapPin size={14} className="mt-0.5 shrink-0 text-emerald-300" />
              <p className="text-xs leading-5 text-slate-500">
                {place.recommendation ?? 'Suggested lower-risk destination based on demo data; not certified safe and not guaranteed.'}
              </p>
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={() => navigate('/map')} className="btn-cyan px-3 py-2">
                VIEW ON MAP
              </button>
              <button onClick={() => navigate('/evacuation')} className="btn-solid px-3 py-2">
                <Route size={13} /> SUGGEST ROUTE
              </button>
            </div>
          </article>
        ))}
      </div>
    </>
  )
}