export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL'

export type ScenarioId = 'normal' | 'heavy-rain' | 'extreme-rain' | 'critical-flood'

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
