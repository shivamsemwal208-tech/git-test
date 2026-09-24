import { CloudLightning } from 'lucide-react'
import { scenarioOptions } from '../../data/demo-assessments'
import type { ScenarioId } from '../../types/risk'

export function ScenarioSelector({ activeScenario, onChange }: { activeScenario: ScenarioId; onChange: (id: ScenarioId) => void }) {
  return <section className="rounded-3xl border border-cyan-300/15 bg-cyan-300/[0.055] p-4 sm:p-5"><div className="mb-4 flex items-center gap-3"><div className="rounded-xl bg-cyan-300/10 p-2 text-cyan-100"><CloudLightning size={19} /></div><div><p className="text-xs font-bold tracking-[0.14em] text-cyan-100">DEMO SCENARIO CONTROL</p><p className="mt-0.5 text-xs text-slate-400">Switching scenarios updates simulated dashboard inputs.</p></div></div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{scenarioOptions.map((scenario) => <button key={scenario.id} type="button" onClick={() => onChange(scenario.id)} className={`rounded-2xl border p-3 text-left transition ${activeScenario === scenario.id ? 'border-cyan-200/45 bg-cyan-200/10 shadow-lg shadow-cyan-950/20' : 'border-white/8 bg-black/10 hover:border-white/20 hover:bg-white/[0.04]'}`}><p className={`text-sm font-bold ${activeScenario === scenario.id ? 'text-cyan-100' : 'text-slate-200'}`}>{scenario.label}</p><p className="mt-1 text-[11px] leading-4 text-slate-500">{scenario.detail}</p></button>)}</div></section>
}
