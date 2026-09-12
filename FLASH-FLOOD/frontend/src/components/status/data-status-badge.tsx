import { DatabaseZap } from 'lucide-react'

const TONES = {
  cyan: 'border-cyan-300/25 bg-cyan-300/10 text-cyan-100',
  emerald: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100',
  amber: 'border-amber-300/25 bg-amber-300/10 text-amber-100',
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
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-bold tracking-[.12em] ${TONES[tone]}`}
    >
      <DatabaseZap size={12} />
      {label}
    </span>
  )
}
