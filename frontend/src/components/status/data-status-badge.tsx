import { DatabaseZap } from 'lucide-react'

const TONES = {
  cyan: 'border-command/25 bg-command/10 text-command-soft',
  amber: 'border-sev-high/45 bg-sev-high/15 text-sev-high-soft',
  rose: 'border-sev-crit/45 bg-sev-crit/15 text-sev-crit-soft',
  slate: 'border-white/[0.12] bg-white/[0.04] text-slate-300',
} as const

export function DataStatusBadge({
  label = 'DEMO / SIMULATION',
  tone = 'cyan',
}: {
  label?: string
  tone?: keyof typeof TONES
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-bold tracking-[0.12em] ${TONES[tone]}`}
    >
      <DatabaseZap size={11} />
      {label}
    </span>
  )
}