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
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
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
          <article key={place.id} className="border border-white/8 bg-white/[.03] p-5">
            <MapPin className="text-emerald-200" />
            <p className="mt-4 text-[11px] font-bold tracking-[.15em] text-cyan-200">
              {dataSource === 'api' ? 'API · DEMO DATA' : 'DEMO / SIMULATION'}
            </p>
            <h2 className="mt-1 text-lg font-bold text-white">{place.name}</h2>
            <p className="mt-1 text-sm text-slate-400">{place.category}</p>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <p>
                <span className="block text-xs text-slate-500">Distance</span>
                {place.distanceKm} km
              </p>
              <p>
                <span className="block text-xs text-slate-500">Elevation</span>
                {place.elevationM} m
              </p>
              <p>
                <span className="block text-xs text-slate-500">Status</span>
                {place.status}
              </p>
              <p>
                <span className="block text-xs text-slate-500">Accessibility</span>
                {place.accessibility}
              </p>
            </div>
            <p className="mt-5 border-t border-white/8 pt-4 text-xs text-slate-500">
              {place.recommendation ?? 'Suggested lower-risk destination based on demo data; not guaranteed safe.'}
            </p>
            <div className="mt-6 flex gap-2">
              <button
                onClick={() => navigate('/map')}
                className="border border-cyan-300/30 px-3 py-2 text-xs font-bold text-cyan-100"
              >
                VIEW ON MAP
              </button>
              <button
                onClick={() => navigate('/evacuation')}
                className="inline-flex items-center gap-1 bg-cyan-200 px-3 py-2 text-xs font-bold text-[#062125]"
              >
                <Route size={13} /> SUGGEST ROUTE
              </button>
            </div>
          </article>
        ))}
      </div>
    </>
  )
}