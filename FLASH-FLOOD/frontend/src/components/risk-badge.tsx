import type { RiskLevel } from '../types/risk'

const styles: Record<RiskLevel, string> = {
  LOW: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  MODERATE: 'border-amber-400/30 bg-amber-400/10 text-amber-100',
  HIGH: 'border-orange-400/30 bg-orange-400/10 text-orange-100',
  CRITICAL: 'border-rose-400/35 bg-rose-500/15 text-rose-100',
}

export function RiskBadge({ level }: { level: RiskLevel }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-[0.14em] ${styles[level]}`}>{level}</span>
}
