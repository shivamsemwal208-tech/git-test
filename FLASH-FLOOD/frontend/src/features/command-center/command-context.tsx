import { createContext, useContext, useMemo, useState } from 'react'
import { demoLocations } from '../../data/demo-locations'
import { demoCommandService } from '../../services/demo-command-service'
import type { DemoLocation } from '../../types/location'
import type { ScenarioId } from '../../types/risk'

interface CommandContextValue { location: DemoLocation; scenarioId: ScenarioId; setLocationId: (id: string) => void; setScenarioId: (id: ScenarioId) => void; command: ReturnType<typeof demoCommandService.assessment>; safePlaces: ReturnType<typeof demoCommandService.safePlaces>; alerts: ReturnType<typeof demoCommandService.alerts>; seismic: ReturnType<typeof demoCommandService.seismic> }
const CommandContext = createContext<CommandContextValue | null>(null)

export function CommandProvider({ children }: { children: React.ReactNode }) {
  const [locationId, setLocationId] = useState('dehradun')
  const [scenarioId, setScenarioId] = useState<ScenarioId>('critical-flood')
  const location = demoLocations.find((item) => item.id === locationId) ?? demoLocations[0]
  const value = useMemo(() => ({ location, scenarioId, setLocationId, setScenarioId, command: demoCommandService.assessment(location, scenarioId), safePlaces: demoCommandService.safePlaces(location), alerts: demoCommandService.alerts(location, scenarioId), seismic: demoCommandService.seismic(location) }), [location, scenarioId])
  return <CommandContext.Provider value={value}>{children}</CommandContext.Provider>
}
// eslint-disable-next-line react-refresh/only-export-components
export function useCommand() { const context = useContext(CommandContext); if (!context) throw new Error('useCommand must be used within CommandProvider'); return context }
