import type { RiskLevel } from '../types/risk'
import { severity } from './severity/severity'

/** Compact pill showing the risk level. Text matches RiskBadge's bare level name. */
export function RiskBadge({ level }: { level: RiskLevel }) {
  const tone = severity(level)
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-[0.14em] ${tone.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden />
      {level}
    </span>
  )
}