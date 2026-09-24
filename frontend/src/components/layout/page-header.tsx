import { DataStatusBadge } from '../status/data-status-badge'

export function PageHeader({
  eyebrow,
  title,
  description,
  statusLabel,
  statusTone = 'cyan',
}: {
  eyebrow: string
  title: string
  description: string
  statusLabel?: string
  statusTone?: 'cyan' | 'amber'
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 border-b border-white/[0.08] pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="h-px w-6 bg-command/70" aria-hidden />
          <p className="eyebrow-command">{eyebrow}</p>
        </div>
        <h1 className="mt-2 text-2xl font-bold leading-tight tracking-tight text-white sm:text-[1.75rem]">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{description}</p>
      </div>
      <div className="shrink-0 sm:pb-1">
        <DataStatusBadge label={statusLabel} tone={statusTone} />
      </div>
    </div>
  )
}