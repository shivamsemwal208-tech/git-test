import type { demoCommandService } from '../../services/demo-command-service'
import type { RiskCommand } from '../../api/risk-api'
import type { LiveWeatherCurrent, LiveWeatherForecast } from '../../api/risk-api'
import type { DemoLocation } from '../../types/location'
import type { RiskOrigin, ScenarioId } from '../../types/risk'

export interface CommandWeather {
  current: LiveWeatherCurrent | null
  forecast: LiveWeatherForecast | null
  error: string | null
}

export interface CommandContextValue {
  location: DemoLocation
  locations: DemoLocation[]
  scenarioId: ScenarioId
  setLocation: (location: DemoLocation) => void
  setScenarioId: (id: ScenarioId) => void
  command: RiskCommand
  safePlaces: ReturnType<typeof demoCommandService.safePlaces>
  alerts: ReturnType<typeof demoCommandService.alerts>
  seismic: ReturnType<typeof demoCommandService.seismic>
  weather: CommandWeather
  isLoading: boolean
  apiError: string | null
  dataSource: 'api' | 'demo'
  /**
   * LIVE — a real ML baseline prediction from arbitrary coordinates.
   * DEMO — deterministic scenario/simulation (predefined locations or fixtures).
   * UNAVAILABLE — the ML prediction could not be produced; no fabricated values.
   */
  riskOrigin: RiskOrigin
}