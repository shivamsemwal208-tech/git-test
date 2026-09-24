import { AlertTriangle, Siren, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCommand } from '../../features/command-center/command-context'
import { hasRisk, riskOrigin } from '../../api/risk-api'

/**
 * Global emergency strip shown above the page content.
 *
 * Two states (never both at once):
 * - SIMULATION ACTIVE: the "Simulate Emergency" demo control has forced the
 *   CRITICAL-FLOOD scenario. Clearly labelled DEMO/SIMULATION with an exit.
 * - FLOOD WARNING ACTIVE: the displayed risk is genuinely HIGH or CRITICAL.
 *   For live ML predictions it says so; for demo scenario data it is labelled
 *   illustrative and never masquerades as a real warning.
 */
export function EmergencyModeBanner() {
  const { command, emergencySimulation, toggleEmergencySimulation } = useCommand()
  const origin = riskOrigin(command)
  const activeWarning =
    hasRisk(command.probability, command.riskLevel) &&
    (command.riskLevel === 'HIGH' || command.riskLevel === 'CRITICAL')

  if (emergencySimulation) {
    return (
      <div className="border-b border-sev-high/35 bg-sev-high/10 px-4 py-2.5 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs sm:text-sm">
          <Siren size={15} className="shrink-0 text-sev-high-soft" />
          <span className="font-black tracking-[.13em] text-sev-high-soft">
            EMERGENCY SIMULATION ACTIVE
          </span>
          <span className="text-sev-high-soft/80">
            DEMO/SIMULATION · showing the CRITICAL-FLOOD scenario — these values are simulated, not
            live or real data.
          </span>
          <button
            onClick={toggleEmergencySimulation}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-sev-high/45 px-2.5 py-1 font-bold text-sev-high-soft transition hover:bg-sev-high/15"
          >
            <XCircle size={13} /> END SIMULATION
          </button>
        </div>
      </div>
    )
  }

  if (!activeWarning) return null

  return (
    <div className="border-b border-sev-crit/40 bg-sev-crit/10 px-4 py-2.5 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs sm:text-sm">
        <AlertTriangle size={15} className="shrink-0 text-sev-crit-soft" />
        <span className="font-black tracking-[.13em] text-sev-crit-soft">
          FLOOD WARNING ACTIVE · {command.riskLevel}
        </span>
        <span className="text-sev-crit-soft/80">
          {origin === 'live'
            ? 'Live ML baseline estimate for these coordinates — follow official emergency instructions.'
            : 'Demonstration scenario — illustrative, not a live warning.'}
        </span>
        <Link
          to="/emergency"
          className="ml-auto rounded-md border border-sev-crit/45 px-2.5 py-1 font-bold text-sev-crit-soft transition hover:bg-sev-crit/15"
        >
          OPEN EMERGENCY MODE →
        </Link>
      </div>
    </div>
  )
}