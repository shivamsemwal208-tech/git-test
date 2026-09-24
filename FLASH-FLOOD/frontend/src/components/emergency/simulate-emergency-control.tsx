import { FlaskConical, Siren } from 'lucide-react'
import { useCommand } from '../../features/command-center/command-context'
import { DataStatusBadge } from '../status/data-status-badge'

/**
 * "Simulate Emergency" control for the hackathon walkthrough.
 *
 * For built-in demo locations it forces the CRITICAL-FLOOD scenario through the
 * shared CommandProvider, so risk, weather, alerts, safe places, the map and
 * Emergency Mode all update together. It is always clearly labelled
 * SIMULATION/DEMO and can be stopped at any time.
 *
 * Arbitrary (custom-coordinate) locations use the real ML risk prediction, which
 * is never overridden — the control explains that instead of fabricating data.
 */
export function SimulateEmergencyControl() {
  const { emergencySimulation, toggleEmergencySimulation, location } = useCommand()

  if (location.status === 'ARBITRARY') {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[.02] p-4">
        <p className="text-[11px] font-bold tracking-[.13em] text-slate-400">SIMULATE EMERGENCY</p>
        <p className="mt-2 text-xs leading-5 text-slate-400">
          This control is available for the built-in demo locations. Custom coordinates use the{' '}
          <b className="text-slate-200">live ML risk prediction</b>, which is never replaced or
          overridden by simulation.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-amber-300/25 bg-amber-300/[.06] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-black tracking-[.13em] text-amber-100">
          <FlaskConical size={16} />
          {emergencySimulation ? 'EMERGENCY SIMULATION ACTIVE' : 'SIMULATE EMERGENCY'}
        </p>
        <DataStatusBadge label="DEMO / SIMULATION" tone="amber" />
      </div>
      <p className="mt-3 text-xs leading-5 text-amber-100/75">
        {emergencySimulation
          ? 'Emergency Mode is showing the CRITICAL-FLOOD demo scenario. All displayed values are simulated and must not be presented as live or real data.'
          : 'Switches the whole command center to the CRITICAL-FLOOD demo scenario for a reliable hackathon walkthrough. Clearly labelled DEMO/SIMULATION; stop it any time.'}
      </p>
      <button
        onClick={toggleEmergencySimulation}
        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-amber-300/35 bg-amber-300/15 px-4 py-2 text-sm font-bold text-amber-100 transition hover:bg-amber-300/25"
      >
        {emergencySimulation ? (
          <>
            <Siren size={15} /> END SIMULATION
          </>
        ) : (
          <>
            <FlaskConical size={15} /> SIMULATE EMERGENCY
          </>
        )}
      </button>
      {emergencySimulation && (
        <p className="mt-3 text-[10px] leading-4 text-amber-100/60">
          The simulation runs on the shared command center state — switch tabs or locations and the
          DEMO scenario stays active until you end it.
        </p>
      )}
    </div>
  )
}