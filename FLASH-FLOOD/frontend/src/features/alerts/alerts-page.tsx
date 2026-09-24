import { AlertTriangle, Siren } from 'lucide-react'
import { PageHeader } from '../../components/layout/page-header'
import { DataStatusBadge } from '../../components/status/data-status-badge'
import { useCommand } from '../command-center/command-context'
import type { AlertSeverity } from '../../types/alert'

const SEVERITY_STYLE: Record<
  AlertSeverity,
  { card: string; badge: string; icon: string }
> = {
  CRITICAL: {
    card: 'border-rose-300/40 bg-rose-500/[.09]',
    badge: 'text-rose-200',
    icon: 'bg-rose-400/15 text-rose-200',
  },
  HIGH: {
    card: 'border-amber-300/30 bg-amber-300/[.07]',
    badge: 'text-amber-200',
    icon: 'bg-amber-300/15 text-amber-100',
  },
  WARNING: {
    card: 'border-amber-300/25 bg-amber-300/[.05]',
    badge: 'text-amber-200',
    icon: 'bg-amber-300/10 text-amber-100',
  },
  WATCH: {
    card: 'border-cyan-300/20 bg-cyan-300/[.05]',
    badge: 'text-cyan-200',
    icon: 'bg-cyan-300/10 text-cyan-100',
  },
  INFO: {
    card: 'border-white/8 bg-white/[.03]',
    badge: 'text-slate-300',
    icon: 'bg-white/8 text-slate-200',
  },
}

export function AlertsPage() {
  const { alerts, dataSource, isLoading, location } = useCommand()
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
        <DataStatusBadge
          label={dataSource === 'api' ? 'API · DEMO DATA' : 'DEMO / SIMULATION'}
        />
        {isLoading && (
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
            Refreshing alerts…
          </p>
        )}
      </div>
      {alerts.length ? (
        <div className="mt-4 space-y-4">
          {alerts.map((alert) => {
            const style = SEVERITY_STYLE[alert.severity]
            const prominent = alert.severity === 'CRITICAL' || alert.severity === 'HIGH'
            return (
              <article key={alert.id} className={`border p-5 ${style.card}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${style.icon}`}>
                      {prominent ? <Siren size={20} /> : <AlertTriangle size={18} />}
                    </span>
                    <div>
                      <p className={`text-xs font-bold tracking-[.14em] ${style.badge}`}>{alert.severity}</p>
                      <h2 className="mt-1 text-lg font-bold text-white">{alert.title}</h2>
                    </div>
                  </div>
                  <DataStatusBadge
                    label={dataSource === 'api' ? 'API · DEMO DATA' : (alert.dataStatus ?? 'SIMULATION')}
                  />
                </div>
                <div className="mt-4 grid gap-4 text-sm md:grid-cols-3">
                  <p>
                    <span className="block text-xs text-slate-500">Location</span>
                    {alert.location}
                  </p>
                  <p>
                    <span className="block text-xs text-slate-500">Timestamp</span>
                    {alert.timestamp}
                  </p>
                  <p>
                    <span className="block text-xs text-slate-500">Reason / Factors</span>
                    {alert.reason}
                  </p>
                </div>
                <div className="mt-4 flex gap-2 border-t border-white/8 pt-4">
                  <AlertTriangle size={16} className="text-amber-100" />
                  <p className="text-sm text-slate-300">{alert.action}</p>
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