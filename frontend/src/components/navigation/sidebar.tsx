import {
  Activity,
  AlertTriangle,
  CloudRain,
  Globe2,
  HeartHandshake,
  House,
  Map,
  RadioTower,
  Route,
  Satellite,
  ShieldAlert,
  Siren,
  SlidersHorizontal,
  X,
  type LucideIcon,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'

interface NavLinkItem {
  to: string
  label: string
  icon: LucideIcon
  tone?: 'rose'
}

interface NavGroup {
  label: string
  links: NavLinkItem[]
}

const GROUPS: NavGroup[] = [
  {
    label: 'Core',
    links: [
      { to: '/', label: 'Command Center', icon: House },
      { to: '/map', label: 'Live Map', icon: Map },
      { to: '/flood-risk', label: 'Flood Risk', icon: Activity },
      { to: '/weather', label: 'Weather', icon: CloudRain },
    ],
  },
  {
    label: 'Intelligence',
    links: [
      { to: '/satellite-terrain', label: 'Satellite & Terrain', icon: Satellite },
      { to: '/seismic', label: 'Seismic', icon: RadioTower },
      { to: '/safe-places', label: 'Safe Places', icon: HeartHandshake },
    ],
  },
  {
    label: 'Response',
    links: [
      { to: '/evacuation', label: 'Evacuation', icon: Route },
      { to: '/alerts', label: 'Alerts', icon: AlertTriangle },
      { to: '/emergency', label: 'Emergency Mode', icon: Siren, tone: 'rose' },
    ],
  },
  {
    label: 'Tools',
    links: [
      { to: '/simulation', label: 'Simulation', icon: SlidersHorizontal },
      { to: '/about', label: 'System Status', icon: Globe2 },
    ],
  },
]

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-white/[0.08] bg-panel px-4 py-5 transition-transform lg:translate-x-0 ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="mb-6 flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-command/30 bg-gradient-to-br from-command/[0.22] to-command/[0.05] text-command-soft shadow-md shadow-command/10">
            <ShieldAlert size={21} />
          </div>
          <div>
            <p className="text-[15px] font-black tracking-tight text-white">FLASHGUARD</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-command-soft">
              <span className="pulse-dot" />
              Flash-flood command
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close navigation"
          className="rounded-lg border border-white/10 p-2 text-slate-300 transition hover:border-white/20 hover:bg-white/[0.06] lg:hidden"
        >
          <X size={16} />
        </button>
      </div>

      <nav className="thin-scroll flex-1 space-y-5 overflow-y-auto pr-1">
        {GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-2 text-[9px] font-bold uppercase tracking-[0.22em] text-slate-500">
              {group.label}
            </p>
            <div className="space-y-1">
              {group.links.map(({ to, label, icon: Icon, tone }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150 ${
                      isActive
                        ? 'bg-command/[0.14] text-command-soft ring-1 ring-inset ring-command/25'
                        : tone === 'rose'
                          ? 'text-rose-200/75 hover:bg-rose-500/[0.08] hover:text-rose-100'
                          : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-100'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-command" />
                      )}
                      <Icon
                        size={16}
                        className={`shrink-0 transition-colors duration-150 ${
                          isActive ? 'text-command' : tone === 'rose' ? 'text-rose-300/60' : 'text-slate-500 group-hover:text-slate-300'
                        }`}
                      />
                      <span className="truncate">{label}</span>
                      {to === '/alerts' && (
                        <span className="ml-auto rounded-full border border-white/15 bg-white/[0.06] px-1.5 py-0.5 text-[8px] font-black tracking-wider text-slate-300">
                          LIST
                        </span>
                      )}
                      {isActive && <span className="sr-only">(current)</span>}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-4 rounded-xl border border-command/[0.14] bg-gradient-to-b from-command/[0.08] to-transparent p-3">
        <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-command-soft">
          <span className="pulse-dot" /> Condition of system
        </p>
        <p className="mt-1.5 text-[11px] leading-4 text-slate-400">
          All overlay conditions and layer geometry are labelled simulation or live from their own
          source. Never assume a demo value is real.
        </p>
      </div>
    </aside>
  )
}