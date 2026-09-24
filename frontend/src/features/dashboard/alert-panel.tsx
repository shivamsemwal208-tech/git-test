import { AlertTriangle, Siren } from 'lucide-react'
import type { RiskLevel } from '../../types/risk'

export function AlertPanel({ level, title, action }: { level: RiskLevel; title: string; action: string }) {
  const isCritical = level === 'CRITICAL'
  return <section className={`rounded-3xl border p-5 sm:p-6 ${isCritical ? 'border-rose-300/25 bg-rose-500/[0.09]' : 'border-amber-300/20 bg-amber-300/[0.07]'}`}><div className="flex gap-4"><div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${isCritical ? 'bg-rose-400/15 text-rose-200' : 'bg-amber-300/15 text-amber-100'}`}>{isCritical ? <Siren size={22} /> : <AlertTriangle size={22} />}</div><div><p className={`text-[11px] font-bold tracking-[0.16em] ${isCritical ? 'text-rose-200' : 'text-amber-100'}`}>SIMULATED EARLY WARNING</p><h2 className="mt-1 text-lg font-bold text-white">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-300">{action}</p><p className="mt-3 text-[11px] leading-4 text-slate-500">For a real emergency, follow instructions from local authorities and emergency services.</p></div></div></section>
}
