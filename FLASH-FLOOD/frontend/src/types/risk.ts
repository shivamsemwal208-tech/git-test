export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL'

export type ScenarioId = 'normal' | 'heavy-rain' | 'extreme-rain' | 'critical-flood'

/**
 * ML prediction state from POST /risk/assess for arbitrary coordinates.
 * `PREDICTION` — a real baseline model forecast was produced from live features.
 * `UNAVAILABLE` — the prediction could not be produced (model or live data missing);
 * probabilities are never fabricated or replaced with a demo/scenario value.
 */
export type PredictionStatus = 'PREDICTION' | 'UNAVAILABLE'

export type RiskUnavailableReason = 'MODEL_UNAVAILABLE' | 'DATA_INCOMPLETE'

/** One ranked contributing factor returned by the ML predictor. */
export interface ContributingFactor {
  feature: string
  value: number | null
  unit: string
  importance: number
}

/** Distinguishes a LIVE ML prediction from DEMO/SIMULATION results or an honest unavailable state. */
export type RiskOrigin = 'live' | 'demo' | 'unavailable'

export interface Metric {
  label: string
  value: string
  detail: string
  icon: 'rain' | 'cloud-rain' | 'mountain' | 'triangle' | 'droplets' | 'route'
}

export interface RiskFactor {
  title: string
  description: string
  severity: 'watch' | 'elevated' | 'major'
}

export interface DemoAssessment {
  scenarioId: ScenarioId
  scenarioLabel: string
  location: string
  coordinates: string
  probability: number
  riskLevel: RiskLevel
  summary: string
  warningTitle: string
  warningAction: string
  updatedAt: string
  weatherMetrics: Metric[]
  terrainMetrics: Metric[]
  riskFactors: RiskFactor[]
}
