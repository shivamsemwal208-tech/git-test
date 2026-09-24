export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL'

export type ScenarioId = 'normal' | 'heavy-rain' | 'extreme-rain' | 'critical-flood'

/**
 * ML prediction state from POST /risk/assess for arbitrary coordinates.
 * `PREDICTION` — a real baseline model forecast was produced from live features.
 * `UNAVAILABLE` — the prediction could not be produced (model or live data missing);
 * probabilities are never fabricated or replaced with a demo/scenario value.
 */
export type PredictionStatus = 'PREDICTION' | 'UNAVAILABLE'

/**
 * Why an ML prediction is unavailable.
 * Backend-sourced: `MODEL_UNAVAILABLE` / `DATA_INCOMPLETE` (from /risk/assess).
 * Frontend-sourced: `API_UNAVAILABLE` is minted locally ONLY when the risk
 * endpoint could not be reached at all (network/API failure) — it is never a
 * substitute for a backend diagnosis and never claims the model or the live
 * data were the problem.
 */
export type RiskUnavailableReason =
  | 'MODEL_UNAVAILABLE'
  | 'DATA_INCOMPLETE'
  | 'API_UNAVAILABLE'

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

/**
 * One recorded flood event near the location, returned by the backend's
 * `historical` block (DFO Global Flood Records). `distanceM` is measured to
 * the event's anchor vertex, not to its local flood extent.
 */
export interface HistoricalEvent {
  fid: number
  reportNumber: string
  distanceM: number
  distanceBasis: 'ANCHOR_VERTEX'
  /** Anchor-vertex coordinates (WGS84) of the recorded flood polygon. */
  latitude: number | null
  longitude: number | null
  beginDate: string | null
  endDate: string | null
  country: string
  cause: string
  severity: number | null
  floodImpactIndex: number | null
}

/** Coverage summary of the DFO catalogue behind the historical block. */
export interface HistoricalCoverage {
  startDate: string | null
  endDate: string | null
  eventCount: number | null
  usableEventCount: number | null
}

/**
 * Frontend (camelCase) view of the backend `historical` intelligence block.
 * Present ONLY for live risk results; `null` for demo/simulation results and
 * when the API could not be reached. Informational only — never an ML feature.
 */
export interface HistoricalContext {
  status: 'AVAILABLE' | 'UNAVAILABLE'
  statusReason: string | null
  source: string | null
  coverage: HistoricalCoverage | null
  searchRadiusM: number
  distanceBasis: 'ANCHOR_VERTEX'
  nearest: HistoricalEvent | null
  /** Coarse point-in-polygon flag; see the frontend disclaimer for limits. */
  polygonContainsLocation: boolean | null
  eventsNearby: HistoricalEvent[]
  disclaimer: string | null
}
