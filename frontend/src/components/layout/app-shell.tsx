import { Bell, ChevronRight, Menu, ShieldCheck, X } from 'lucide-react'
import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AlertDrawer } from '../alerts/alert-drawer'
import { DataStatusBadge } from '../status/data-status-badge'
import { EmergencyModeBanner } from '../emergency/emergency-mode-banner'
import { LocationSearch } from '../navigation/location-search'
import { Sidebar } from '../navigation/sidebar'
import { useCommand } from '../../features/command-center/command-context'
import { riskOrigin } from '../../api/risk-api'

const SECTION_LABELS: Record<string, string> = {
  '/': 'Command Center',
  '/map': 'Live Map',
  '/flood-risk': 'Flood Risk',
  '/weather': 'Weather',
  '/satellite-terrain': 'Satellite & Terrain',
  '/seismic': 'Seismic',
  '/safe-places': 'Safe Places',
  '/evacuation': 'Evacuation',
  '/alerts': 'Alerts',
  '/emergency': 'Emergency Mode',
  '/simulation': 'Simulation',
  '/about': 'System Status',
}

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const { pathname } = useLocation()
  const { alerts, location, isLoading, apiError, command, dataSource } = useCommand()
  const section = SECTION_LABELS[pathname] ?? 'Intelligence Hub'
  const origin = riskOrigin(command)
  const statusLabel =
    origin === 'live'
      ? 'LIVE · ML PREDICTION'
      : origin === 'unavailable'
        ? 'RISK · UNAVAILABLE'
        : dataSource === 'api'
          ? 'API · DEMO DATA'
          : 'DEMO / SIMULATION'
  const coordinateContext =
    location.status === 'ARBITRARY'
      ? origin === 'live'
        ? 'Custom coordinates · live ML risk prediction'
        : 'Custom coordinates · live risk prediction unavailable'
      : origin === 'demo'
        ? 'Built-in location · demo simulation'
        : origin === 'unavailable'
          ? 'Built-in location · live risk prediction unavailable'
          : 'Built-in location · live ML risk prediction'
  return (
    <div className="min-h-screen min-w-0 overflow-x-clip bg-abyss text-slate-100">
      <Sidebar mobileOpen={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 flex min-h-18 items-center justify-between gap-3 border-b border-white/[0.08] bg-abyss/90 px-4 py-3 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3 lg:hidden">
            <button aria-label="Open navigation" onClick={() => setMenuOpen(true)} className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
              <Menu size={18} />
            </button>
            <ShieldCheck className="text-command-soft" />
          </div>
          <div className="hidden min-w-0 lg:block">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              <span className="text-slate-400">FlashGuard</span>
              <ChevronRight size={10} className="text-slate-600" aria-hidden />
              <span className="truncate text-command-soft">{section}</span>
            </p>
            <p className="mt-0.5 flex items-center gap-2 text-sm font-semibold text-white">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-command" aria-hidden />
              {location.state ? `${location.name}, ${location.state}` : location.name}
              {isLoading && (
                <span className="pulse-dot" aria-label="Loading risk assessment" />
              )}
            </p>
            <p className="truncate text-[11px] text-slate-500">
              {location.latitude.toFixed(4)}°, {location.longitude.toFixed(4)}° · {coordinateContext}
            </p>
            {apiError && <p className="text-[10px] text-rose-300/80">{apiError}</p>}
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <span className="hidden sm:inline-flex"><DataStatusBadge label={statusLabel} /></span>
            <LocationSearch />
            <button
              aria-label="Open alerts"
              onClick={() => setAlertsOpen(true)}
              className="relative rounded-xl border border-white/10 bg-white/[0.035] p-2.5 text-slate-200 transition hover:border-command/30 hover:bg-white/[0.08]"
            >
              <Bell size={17} />
              {alerts.length > 0 && (
                <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                  {alerts.length}
                </span>
              )}
            </button>
          </div>
        </header>
        <EmergencyModeBanner />
        <main key={pathname} className="page-enter px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
      {alertsOpen && <AlertDrawer onClose={() => setAlertsOpen(false)} />}
      <button
        aria-label="Close navigation"
        onClick={() => setMenuOpen(false)}
        className={`fixed inset-0 z-40 bg-black/50 lg:hidden ${menuOpen ? 'block' : 'hidden'}`}
      >
        <X className="sr-only" />
      </button>
    </div>
  )
}