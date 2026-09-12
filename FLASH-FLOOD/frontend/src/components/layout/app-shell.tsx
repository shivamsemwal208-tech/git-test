import { Bell, Menu, ShieldCheck, X } from 'lucide-react'
import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AlertDrawer } from '../alerts/alert-drawer'
import { DataStatusBadge } from '../status/data-status-badge'
import { LocationSearch } from '../navigation/location-search'
import { Sidebar } from '../navigation/sidebar'
import { useCommand } from '../../features/command-center/command-context'
import { riskOrigin } from '../../api/risk-api'
export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const { alerts, location, isLoading, apiError, command, dataSource } = useCommand()
  const origin = riskOrigin(command)
  const statusLabel =
    origin === 'live'
      ? 'LIVE · ML PREDICTION'
      : origin === 'unavailable'
        ? 'DEMO / UNAVAILABLE'
        : dataSource === 'api'
          ? 'API · DEMO DATA'
          : 'DEMO / SIMULATION'
  const coordinateContext =
    location.status === 'ARBITRARY'
      ? origin === 'live'
        ? 'Custom coordinates · live ML risk prediction'
        : 'Custom coordinates · live risk prediction unavailable'
      : dataSource === 'api'
        ? 'Backend risk service'
        : 'Local demo fixtures'
  return (
    <div className="min-h-screen bg-[#07151a] text-slate-100">
      <Sidebar mobileOpen={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 flex min-h-18 items-center justify-between gap-3 border-b border-white/8 bg-[#07151a]/90 px-4 py-3 backdrop-blur-lg sm:px-6">
          <div className="flex items-center gap-3 lg:hidden">
            <button aria-label="Open navigation" onClick={() => setMenuOpen(true)} className="rounded-lg border border-white/10 p-2">
              <Menu size={18} />
            </button>
            <ShieldCheck className="text-cyan-200" />
          </div>
          <div className="hidden lg:block">
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              {location.state ? `${location.name}, ${location.state}` : location.name}
              {isLoading && (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" aria-label="Loading risk assessment" />
              )}
            </p>
            <p className="text-[11px] text-slate-500">
              {location.latitude.toFixed(4)}°, {location.longitude.toFixed(4)}° · {coordinateContext}
            </p>
            {apiError && <p className="text-[10px] text-amber-300/90">{apiError}</p>}
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <DataStatusBadge label={statusLabel} />
            <LocationSearch />
            <button aria-label="Open alerts" onClick={() => setAlertsOpen(true)} className="relative rounded-xl border border-white/10 bg-white/[.035] p-2.5 text-slate-200 hover:bg-white/[.08]">
              <Bell size={17} />
              {alerts.length > 0 && (
                <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                  {alerts.length}
                </span>
              )}
            </button>
          </div>
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
      {alertsOpen && <AlertDrawer onClose={() => setAlertsOpen(false)} />}
      <button aria-label="Close navigation" onClick={() => setMenuOpen(false)} className={`fixed inset-0 z-40 bg-black/50 lg:hidden ${menuOpen ? 'block' : 'hidden'}`}>
        <X className="sr-only" />
      </button>
    </div>
  )
}