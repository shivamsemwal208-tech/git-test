import { Activity, ArrowUpRight } from 'lucide-react'
import { RiskBadge } from '../../components/risk-badge'
import type { RiskLevel } from '../../types/risk'

const stroke: Record<RiskLevel, string> = { LOW: '#34d399', MODERATE: '#fbbf24', HIGH: '#fb923c', CRITICAL: '#fb7185' }

/**
 * Flood-risk gauge. `probability`/`riskLevel` may be null when the prediction is
 * honestly unavailable — the gauge then renders an explicit "unavailable" state
 * and never shows a fake 0%/LOW value.
 */
export function RiskGauge({ probability, riskLevel, summary }: { probability: number | null; riskLevel: RiskLevel | null; summary: string }) {
  const radius = 80
  const circumference = 2 * Math.PI * radius
  const available = probability !== null && riskLevel !== null
  const progress = available ? circumference - (probability / 100) * circumference : circumference
  const color = available ? stroke[riskLevel] : '#64748b'
  return <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0d272b] p-5 shadow-2xl shadow-black/20 sm:p-6">
    <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-rose-400/10 blur-3xl" />
    <div className="relative flex items-center justify-between"><div><p className="text-xs font-bold tracking-[0.16em] text-slate-400">FLOOD RISK ASSESSMENT</p><h2 className="mt-2 text-lg font-semibold text-white">Current risk outlook</h2></div><Activity className="text-cyan-200" size={22} /></div>
    <div className="relative mt-5 flex items-center gap-5"><div className="relative grid h-40 w-40 shrink-0 place-items-center"><svg className="absolute -rotate-90" width="160" height="160" aria-label={available ? `${probability}% flood risk` : 'Flood risk unavailable'}><circle cx="80" cy="80" r={radius} fill="transparent" stroke="rgba(255,255,255,0.08)" strokeWidth="11" /><circle cx="80" cy="80" r={radius} fill="transparent" stroke={color} strokeWidth="11" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={progress} /></svg><div className="text-center">{available ? (<><p className="text-4xl font-black tracking-tighter text-white">{probability}<span className="text-lg text-slate-400">%</span></p><p className="mt-1 text-[10px] font-bold tracking-[0.14em] text-slate-400">FLOOD PROBABILITY</p></>) : (<><p className="text-4xl font-black tracking-tighter text-white">—</p><p className="mt-1 text-[10px] font-bold tracking-[0.14em] text-slate-400">RISK UNAVAILABLE</p></>)}</div></div><div className="min-w-0">{available ? (<><RiskBadge level={riskLevel} /><p className="mt-3 text-sm leading-6 text-slate-300">{summary}</p><div className="mt-4 flex items-center gap-1 text-xs font-semibold text-cyan-200">Risk assessment <ArrowUpRight size={14} /></div></>) : (<><p className="text-sm font-bold text-slate-300">No prediction available</p><p className="mt-2 text-sm leading-6 text-slate-400">{summary}</p></>)}</div></div>
  </section>
}
