import { CheckCircle2, ShieldAlert } from 'lucide-react'
import type { RiskFactor } from '../../types/risk'

const accent = { watch: 'bg-cyan-300', elevated: 'bg-amber-300', major: 'bg-rose-400' }

export function RiskFactors({ factors }: { factors: RiskFactor[] }) {
  return <section className="rounded-3xl border border-white/8 bg-white/[0.035] p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold tracking-[0.16em] text-slate-400">EXPLAINABLE RISK</p><h2 className="mt-2 text-lg font-semibold text-white">Why is the risk elevated?</h2></div><ShieldAlert className="text-amber-200" size={22} /></div><div className="mt-5 space-y-3">{factors.map((factor) => <div key={factor.title} className="flex gap-3 rounded-2xl border border-white/7 bg-black/10 p-3.5"><div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${accent[factor.severity]}`} /><div><p className="text-sm font-semibold text-slate-100">{factor.title}</p><p className="mt-1 text-xs leading-5 text-slate-400">{factor.description}</p></div></div>)}</div><div className="mt-4 flex gap-2 text-[11px] leading-4 text-slate-500"><CheckCircle2 size={15} className="shrink-0 text-cyan-200" /> Factors are shown from the selected simulation; they are not live sensor readings or ML explanations.</div></section>
}
