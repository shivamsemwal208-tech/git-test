import { AlertTriangle, Siren, Info, Mountain, Droplets } from 'lucide-react'
import { PageHeader } from '../../components/layout/page-header'
import { DataStatusBadge } from '../../components/status/data-status-badge'
import { useCommand } from '../command-center/command-context'
import type { AlertSeverity } from '../../types/alert'

const SEVERITY_STYLE: Record<
  AlertSeverity,
  { card: string; badge: string; chip: string; icon: 'siren' | 'warning' | 'info' | 'rain' | 'mountain'; label: string }
> = {
  CRITICAL: {
    card: 'border-l-sev-crit border-sev-crit/30 bg-sev-crit/[.08]',
    badge: 'text-sev-crit-soft',
    chip: 'border-sev-crit/55 bg-sev-crit/15 text-sev-crit-soft',
    icon: 'siren',
    label: 'CRITICAL PRIORITY',
  },
  HIGH: {
    card: 'border-l-alert-high border-alert-high/30 bg-alert-high/[.06]',
    badge: 'text-alert-high-soft',
    chip: 'border-alert-high/50 bg-alert-high/15 text-alert-high-soft',
    icon: 'warning',
    label: 'HIGH PRIORITY',
  },
  WARNING: {
    card: 'border-l-sev-high border-sev-high/30 bg-sev-high/[.05]',
    badge: 'text-sev-high-soft',
    chip: 'border-sev-high/50 bg-sev-high/15 text-sev-high-soft',
    icon: 'warning',
    label: 'WARNING PRIORITY',
  },
  WATCH: {
    card: 'border-l-sev-mod border-sev-mod/25 bg-sev-mod/[.05]',
    badge: 'text-sev-mod-soft',
    chip: 'border-sev-mod/45 bg-sev-mod/15 text-sev-mod-soft',
    icon: 'rain',
    label: 'WATCH PRIORITY',
  },
  INFO: {
    card: 'border-l-sky-300/70 border-white/10 bg-white/[.03]',
    badge: 'text-slate-300',
    chip: 'border-white/15 bg-white/[.06] text-slate-200',
    icon: 'info',
    label: 'INFO PRIORITY',
  },
}

function SeverityIcon({ icon, className }: { icon: 'siren' | 'warning' | 'info' | 'rain' | 'mountain'; className: string }) {
  const props = { size: 20, className }
  switch (icon) {
    case 'siren':
      return <Siren {...props} />
    case 'rain':
      return <Droplets {...props} />
    case 'mountain':
      return <Mountain {...props} />
    case 'info':
      return <Info {...props} />
    default:
      return <AlertTriangle {...props} />
  }
}

export function AlertsPage() {
  const { alerts, dataSource, isLoading, location } = useCommand()
  const originLabel = dataSource === 'api' ? 'API · DEMO DATA' : 'DEMO / SIMULATION'
  return (
    <>
      <PageHeader
        eyebrow="ALERT CENTER"
        title="Simulation alerts and recommended actions"
        description={
          dataSource === 'api'
            ? `Alerts served by the FlashGuard backend for ${location.name}. This is a frontend alert interface only — it does not send SMS, email, push notifications, or official warnings.`
            : 'This is a frontend alert interface only. It does not send SMS, email, push notifications, or official warnings.'
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DataStatusBadge label={originLabel} />
        {isLoading && (
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <span className="pulse-dot" />
            Refreshing alerts…
          </p>
        )}
      </div>
      {alerts.length ? (
        <div className="mt-4 space-y-4">
          {alerts.map((alert) => {
            const style = SEVERITY_STYLE[alert.severity]
            return (
              <article
                key={alert.id}
                className={`rounded-2xl border-2 border-l-4 p-5 transition duration-150 hover:border-l-rose-500/70 ${style.card}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border ${style.chip}`}>
                      <SeverityIcon icon={style.icon} className="text-current" />
                    </span>
                    <div className="min-w-0">
                      <p className={`text-[10px] font-black uppercase tracking-[.16em] ${style.badge}`}>{alert.severity} ALERT</p>
                      <h2 className="mt-1 text-lg font-bold text-white">{alert.title}</h2>
                      <p className="mt-1 text-xs leading-5 text-slate-400">{alert.reason}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black tracking-[0.14em] ${style.chip}`}>
                    {style.label}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 border-t border-white/8 pt-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <div className="min-w-0">
                    <span className="block text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Location</span>
                    <p className="mt-0.5 truncate text-slate-200" title={alert.location}>{alert.location}</p>
                  </div>
                  <div className="min-w-0">
                    <span className="block text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Timestamp</span>
                    <p className="mt-0.5 text-slate-200">{alert.timestamp}</p>
                  </div>
                  <div className="min-w-0">
                    <span className="block text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Source</span>
                    <DataStatusBadge label={dataSource === 'api' ? 'API · DEMO DATA' : (alert.dataStatus ?? 'SIMULATION')} />
                  </div>
                </div>
                <div className="mt-4 flex gap-2.5 rounded-lg bg-white/[0.03] p-3 text-sm text-slate-300">
                  <AlertTriangle size={16} className={style.badge} />
                  <p>
                    <span className="font-semibold text-slate-200">Recommended action: </span>
                    {alert.action}
                  </p>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <p className="mt-4 border border-dashed border-white/15 p-8 text-center text-slate-400">
          No demo alerts are available.
        </p>
      )}
    </>
  )
}