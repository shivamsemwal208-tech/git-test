import { Check, FlaskConical, Radio } from 'lucide-react'
import { scenarioFixtures } from '../../data/demo-scenarios'
import { PageHeader } from '../../components/layout/page-header'
import { DataStatusBadge } from '../../components/status/data-status-badge'
import { useCommand } from '../command-center/command-context'
export function SimulationPage() {
  const { scenarioId, setScenarioId, command, simulationActive, setSimulationActive } = useCommand()
  return (
    <>
      <PageHeader
        eyebrow="SIMULATION CONTROL"
        title="Drive the command-center demo"
        description="Selecting a deterministic fixture engages an explicit DEMO/SIMULATION scenario that updates risk, weather, terrain context, alerts, map layers, safe places, and emergency presentation across the frontend for the built-in locations. Exit to return to the live ML risk pipeline."
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <DataStatusBadge
          label={simulationActive ? 'DEMO / SIMULATION ACTIVE' : 'LIVE · ML PIPELINE'}
          tone={simulationActive ? 'amber' : 'cyan'}
        />
        {simulationActive ? (
          <button
            onClick={() => setSimulationActive(false)}
            className="inline-flex items-center gap-2 rounded-lg border border-command/40 px-4 py-2 text-xs font-bold tracking-[.13em] text-command-soft transition hover:bg-command/10"
          >
            <Radio size={14} /> EXIT SIMULATION · VIEW LIVE
          </button>
        ) : (
          <button
            onClick={() => setSimulationActive(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-sev-high/45 px-4 py-2 text-xs font-bold tracking-[.13em] text-sev-high-soft transition hover:bg-sev-high/15"
          >
            <FlaskConical size={14} /> ENGAGE DEMO SIMULATION
          </button>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Object.values(scenarioFixtures).map((scenario) => (
          <button
            onClick={() => {
              setScenarioId(scenario.id)
              setSimulationActive(true)
            }}
            key={scenario.id}
            className={`border p-5 text-left transition ${
              simulationActive && scenarioId === scenario.id ? 'border-command/60 bg-command/10' : 'border-white/8 bg-white/[.03] hover:bg-white/[.06]'
            }`}
          >
            <div className="flex justify-between">
              <p className="font-bold text-white">{scenario.label}</p>
              {simulationActive && scenarioId === scenario.id && <Check size={17} className="text-command-soft" />}
            </div>
            <p className="mt-4 text-3xl font-black text-white">{scenario.probability}<span className="text-base text-slate-400">/100</span></p>
            <p className="mt-1 text-xs font-bold tracking-[.13em] text-command-soft">RISK SCORE · {scenario.riskLevel}</p>
            <p className="mt-4 text-xs leading-5 text-slate-400">{scenario.factors.join(' · ')}</p>
          </button>
        ))}
      </div>
      <section className="mt-6 rounded-2xl border border-command/15 bg-command/[.05] p-6">
        <p className="eyebrow-command">CURRENT STATE</p>
        <h2 className="mt-2 text-xl font-bold text-white">{command.label} · {command.location.name}</h2>
        <p className="mt-2 text-sm text-slate-400">
          {simulationActive
            ? 'This is an explicit DEMO/SIMULATION scenario. The displayed values are deterministic demo data and must not be presented as live or real data. Exit to return to the live ML risk pipeline for this location.'
            : 'No demo simulation is active — the command center uses the live weather/environmental and ML risk pipeline whenever real data is available.'}
        </p>
      </section>
    </>
  )
}