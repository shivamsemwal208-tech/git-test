import type { ReactNode } from 'react'

export function KeyValue({
  label,
  value,
  sub,
  className = '',
}: {
  label: string
  value: ReactNode
  sub?: string
  className?: string
}) {
  return (
    <div className={`rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3 ${className}`.trim()}>
      <p className="eyebrow">{label}</p>
      <p className="tabular mt-1.5 text-lg font-bold text-white">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{sub}</p>}
    </div>
  )
}