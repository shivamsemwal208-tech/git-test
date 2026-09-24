import type {
  ContributingFactor,
  DemoAssessment,
  Metric,
  PredictionStatus,
  RiskFactor,
  RiskLevel,
  RiskOrigin,
  RiskUnavailableReason,
  ScenarioId,
} from '../types/risk'
import type { CommandWeatherValue } from '../types/weather'
import type { DemoLocation } from '../types/location'
import type { SafePlace } from '../types/safe-place'
import type { DemoRoute } from '../types/evacuation'
import type { AlertSeverity, DemoAlert } from '../types/alert'
import type { SeismicEvent, SecondaryHazard } from '../types/seismic'

const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://127.0.0.1:8001/api/v1'

/** Converts the frontend hyphenated scenario form to the backend underscore form. */
function toApiScenario(scenarioId: ScenarioId): string {
  return scenarioId.replace(/-/g, '_')
}

/** Builds the location_id query params for a DemoLocation, adding coordinates for arbitrary locations. */
function buildLocationQuery(location: DemoLocation): string {
  const id = encodeURIComponent(location.id)
  if (location.status === 'ARBITRARY') {
    return `location_id=${id}&latitude=${location.latitude}&longitude=${location.longitude}&location_name=${encodeURIComponent(location.name)}`
  }
  return `location_id=${id}`
}

/** Builds the location request-body fields, adding coordinate metadata for arbitrary locations. */
function buildLocationBody(
  location: DemoLocation,
  simulate = false,
): Record<string, string | number | boolean> {
  const body: Record<string, string | number | boolean> = { location_id: location.id }
  if (location.status === 'ARBITRARY') {
    body.latitude = location.latitude
    body.longitude = location.longitude
    body.location_name = location.name
  }
  if (simulate) body.simulate = true
  return body
}

export interface RiskTerrain {
  elevation: number | null
  slope: number | null
  aspect: string
  soil_moisture: number | null
  river_distance: number | null
  drainage: string
  historical: string
  exposure: string
}

export interface RiskWeather {
  temperature: number | null
  humidity: number | null
  current_rainfall: number | null
  rainfall_1h: number | null
  rainfall_3h: number | null
  rainfall_6h: number | null
  rainfall_24h: number | null
  rainfall_72h: number | null
  rainfall_7d: number | null
  antecedent_rainfall_7d: number | null
  forecast_rainfall: number | null
  precipitation_probability: number | null
  wind_speed: number | null
  wind_direction: string | null
  pressure: number | null
  soil_moisture: number | null
  soil_moisture_0_to_7cm: number | null
  hourly_rainfall: number[] | null
}

/**
 * Raw backend response for POST /api/v1/risk/assess.
 *
 * For arbitrary coordinates the backend now returns a real ML baseline
 * prediction (`prediction_status: "PREDICTION"`, `data_status: "LIVE"`) or an
 * honest unavailable result (`prediction_status: "UNAVAILABLE"` with a `reason`
 * and `missing_features`). Predefined demo locations keep deterministic
 * scenario data (`data_status: "DEMO"`, no `prediction_status`).
 */
export interface RiskAssessment {
  location_id: string
  scenario: string
  scenario_label: string
  probability: number | null
  risk_level: RiskLevel | null
  factors: string[]
  warning: string
  recommended_action: string
  terrain: RiskTerrain
  weather: RiskWeather
  model_status: string
  data_status: string
  is_simulated: boolean
  timestamp: string
  disclaimer: string
  prediction_status?: PredictionStatus | null
  reason?: RiskUnavailableReason | null
  missing_features?: string[] | null
  model_version?: string | null
  contributing_factors?: ContributingFactor[] | null
  explanation?: string | null
}

/** Shape produced by demoCommandService.assessment; API responses are mapped into it. */
export interface RiskCommand {
  id: ScenarioId
  label: string
  probability: number | null
  riskLevel: RiskLevel | null
  action: string
  warning: string
  factors: string[]
  weather: CommandWeatherValue
  location: DemoLocation
  terrain: {
    elevation: number | null
    slope: number | null
    aspect: string
    soilMoisture: number | null
    riverDistance: number | null
    drainage: string
    historical: string
    exposure: string
  }
  /** PRESENT for live ML results, ABSENT for demo/scenario results. */
  predictionStatus: PredictionStatus | null
  reason: RiskUnavailableReason | null
  missingFeatures: string[]
  modelVersion: string | null
  modelStatus: string
  contributingFactors: ContributingFactor[]
  explanation: string | null
  disclaimer: string | null
}

/**
 * In-flight GET promises, keyed by URL. React StrictMode double-mounts effects
 * in development, which otherwise fires overlapping identical requests; sharing
 * one promise means a single network call and a single abort/timeout per URL.
 * Completed requests are dropped immediately, so a later call re-fetches.
 */
const inflightGets = new Map<string, Promise<unknown>>()

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? 'GET'
  const key = `${method} ${path} ${init?.body ?? ''}`
  const dedupeable = method === 'GET'
  if (dedupeable) {
    const pending = inflightGets.get(key)
    if (pending) return pending as Promise<T>
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  const promise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      })
      if (!response.ok) {
        throw new Error(`FlashGuard API ${path} failed with status ${response.status}`)
      }
      return (await response.json()) as T
    } finally {
      clearTimeout(timeout)
    }
  })().finally(() => {
    if (dedupeable) inflightGets.delete(key)
  })
  if (dedupeable) inflightGets.set(key, promise)
  return promise
}

/** GET /api/v1/locations — returns the demo location list from the backend. */
export async function getLocations(): Promise<DemoLocation[]> {
  const data = await request<{ locations: DemoLocation[] }>('/locations')
  return data.locations
}

/**
 * POST /api/v1/risk/assess — risk for the location.
 *
 * By default this requests the LIVE weather + ML risk pipeline for any
 * location (predefined demo locations are resolved to their own coordinates on
 * the backend). Pass `simulate` only for an explicit simulation/demo scenario
 * so the backend returns the deterministic scenario fixture instead.
 */
export async function postRiskAssessment(
  location: DemoLocation,
  scenarioId: ScenarioId,
  simulate = false,
): Promise<RiskAssessment> {
  return request<RiskAssessment>('/risk/assess', {
    method: 'POST',
    body: JSON.stringify({
      ...buildLocationBody(location, simulate),
      scenario: toApiScenario(scenarioId),
    }),
  })
}

/** Normalizes identical API and demo scenario forms to the frontend ScenarioId (hyphenated). */
export function toScenarioId(value: string): ScenarioId {
  const normalized = value.replace(/_/g, '-')
  if (['normal', 'heavy-rain', 'extreme-rain', 'critical-flood'].includes(normalized)) {
    return normalized as ScenarioId
  }
  return 'normal'
}

/** Maps the backend snake_case risk response into the frontend camelCase command shape. */
export function mapRiskAssessment(
  assessment: RiskAssessment,
  location: DemoLocation,
  scenarioId: ScenarioId,
): RiskCommand {
  return {
    id: scenarioId,
    label: assessment.scenario_label,
    probability: assessment.probability ?? null,
    riskLevel: assessment.risk_level ?? null,
    action: assessment.recommended_action,
    warning: assessment.warning,
    factors: assessment.factors ?? [],
    weather: {
      temperature: assessment.weather?.temperature ?? null,
      humidity: assessment.weather?.humidity ?? null,
      currentRainfall: assessment.weather?.current_rainfall ?? null,
      rainfall1h: assessment.weather?.rainfall_1h ?? null,
      rainfall3h: assessment.weather?.rainfall_3h ?? null,
      rainfall6h: assessment.weather?.rainfall_6h ?? null,
      rainfall24h: assessment.weather?.rainfall_24h ?? null,
      rainfall72h: assessment.weather?.rainfall_72h ?? null,
      rainfall7d: assessment.weather?.rainfall_7d ?? null,
      antecedentRainfall7d: assessment.weather?.antecedent_rainfall_7d ?? null,
      forecastRainfall: assessment.weather?.forecast_rainfall ?? null,
      precipitationProbability: assessment.weather?.precipitation_probability ?? null,
      windSpeed: assessment.weather?.wind_speed ?? null,
      windDirection: assessment.weather?.wind_direction ?? null,
      pressure: assessment.weather?.pressure ?? null,
      soilMoisture: assessment.weather?.soil_moisture ?? null,
      soilMoisture0to7cm: assessment.weather?.soil_moisture_0_to_7cm ?? null,
      hourlyRainfall: assessment.weather?.hourly_rainfall ?? null,
    },
    location,
    terrain: {
      elevation: assessment.terrain?.elevation ?? null,
      slope: assessment.terrain?.slope ?? null,
      aspect: assessment.terrain?.aspect ?? 'Unavailable',
      soilMoisture: assessment.terrain?.soil_moisture ?? null,
      riverDistance: assessment.terrain?.river_distance ?? null,
      drainage: assessment.terrain?.drainage ?? 'Unavailable',
      historical: assessment.terrain?.historical ?? 'Unavailable',
      exposure: assessment.terrain?.exposure ?? 'Unavailable',
    },
    predictionStatus: assessment.prediction_status ?? null,
    reason: assessment.reason ?? null,
    missingFeatures: assessment.missing_features ?? [],
    modelVersion: assessment.model_version ?? null,
    modelStatus: assessment.model_status,
    contributingFactors: (assessment.contributing_factors ?? []).map((factor) => ({
      feature: factor.feature,
      value: factor.value,
      unit: factor.unit,
      importance: factor.importance,
    })),
    explanation: assessment.explanation ?? null,
    disclaimer: assessment.disclaimer ?? null,
  }
}

/**
 * Classifies a risk command for the UI:
 * - `live` — a real ML baseline prediction (PREDICTION status).
 * - `unavailable` — an honest unavailable result (model or live data missing).
 * - `demo` — deterministic demo/scenario/simulation (no ML involved).
 */
export function riskOrigin(command: RiskCommand): RiskOrigin {
  if (command.predictionStatus === 'PREDICTION') return 'live'
  if (command.predictionStatus === 'UNAVAILABLE') return 'unavailable'
  return 'demo'
}

/** Short badge label for the current risk origin. */
export function riskStatusLabel(origin: RiskOrigin): string {
  if (origin === 'live') return 'LIVE · ML PREDICTION'
  if (origin === 'unavailable') return 'RISK · UNAVAILABLE'
  return 'DEMO / SIMULATION'
}

/** True when the command carries a usable numeric ML/demo probability. */
export function hasRisk(probability: number | null, riskLevel: RiskLevel | null): boolean {
  return probability !== null && riskLevel !== null
}

// ─── Weather endpoints ────────────────────────────────────────────────

/**
 * Raw backend response for GET /api/v1/weather/current. Values are nullable
 * because the backend returns an honest UNAVAILABLE response (not fabricated
 * fallback data) when the live Open-Meteo provider cannot be reached.
 */
export interface WeatherCurrentResponse {
  status: string
  source: string | null
  data_status: string
  is_simulated: boolean
  timestamp: string
  updated_at: string | null
  disclaimer: string
  location_id: string
  location_name: string
  latitude: number | null
  longitude: number | null
  temperature: number | null
  humidity: number | null
  current_rainfall: number | null
  rainfall_1h: number | null
  rainfall_3h: number | null
  rainfall_6h: number | null
  rainfall_24h: number | null
  precipitation_probability: number | null
  forecast_rainfall: number | null
  wind_speed: number | null
  wind_direction: string | null
  pressure: number | null
  soil_moisture: number | null
  hourly_rainfall: number[] | null
  scenario: string | null
  note: string | null
}

/** Raw backend response for GET /api/v1/weather/forecast. */
export interface WeatherForecastResponse {
  status: string
  source: string | null
  data_status: string
  is_simulated: boolean
  timestamp: string
  updated_at: string | null
  disclaimer: string
  location_id: string
  location_name: string
  latitude: number | null
  longitude: number | null
  forecast_rainfall: number | null
  precipitation_probability: number | null
  hourly_rainfall: number[] | null
  entries: Array<Record<string, string | number | null>> | null
  scenario: string | null
  note: string | null
}

/** Frontend (camelCase) view of live weather for the current location. */
export interface LiveWeatherCurrent {
  status: string
  source: string | null
  updatedAt: string | null
  locationName: string
  latitude: number | null
  longitude: number | null
  temperature: number | null
  humidity: number | null
  currentRainfall: number | null
  rainfall1h: number | null
  rainfall3h: number | null
  rainfall6h: number | null
  rainfall24h: number | null
  precipitationProbability: number | null
  forecastRainfall: number | null
  windSpeed: number | null
  windDirection: string | null
  pressure: number | null
  soilMoisture: number | null
  hourlyRainfall: number[] | null
  note: string | null
}

/** Frontend (camelCase) view of the live weather forecast. */
export interface LiveWeatherForecast {
  status: string
  source: string | null
  updatedAt: string | null
  locationName: string
  latitude: number | null
  longitude: number | null
  forecastRainfall: number | null
  precipitationProbability: number | null
  hourlyRainfall: number[] | null
  entries: Array<Record<string, string | number | null>> | null
  note: string | null
}

/** Converts the live backend weather response into the camelCase view. */
export function mapLiveWeatherCurrent(res: WeatherCurrentResponse): LiveWeatherCurrent {
  return {
    status: res.status,
    source: res.source,
    updatedAt: res.updated_at,
    locationName: res.location_name,
    latitude: res.latitude,
    longitude: res.longitude,
    temperature: res.temperature,
    humidity: res.humidity,
    currentRainfall: res.current_rainfall,
    rainfall1h: res.rainfall_1h,
    rainfall3h: res.rainfall_3h,
    rainfall6h: res.rainfall_6h,
    rainfall24h: res.rainfall_24h,
    precipitationProbability: res.precipitation_probability,
    forecastRainfall: res.forecast_rainfall,
    windSpeed: res.wind_speed,
    windDirection: res.wind_direction,
    pressure: res.pressure,
    soilMoisture: res.soil_moisture,
    hourlyRainfall: res.hourly_rainfall,
    note: res.note,
  }
}

/** Converts the live forecast response into the camelCase view. */
export function mapLiveWeatherForecast(res: WeatherForecastResponse): LiveWeatherForecast {
  return {
    status: res.status,
    source: res.source,
    updatedAt: res.updated_at,
    locationName: res.location_name,
    latitude: res.latitude,
    longitude: res.longitude,
    forecastRainfall: res.forecast_rainfall,
    precipitationProbability: res.precipitation_probability,
    hourlyRainfall: res.hourly_rainfall,
    entries: res.entries,
    note: res.note,
  }
}

/** GET /api/v1/weather/current — live weather for the selected coordinates. */
export async function getWeatherCurrent(
  location: DemoLocation,
): Promise<WeatherCurrentResponse> {
  return request<WeatherCurrentResponse>(`/weather/current?${buildLocationQuery(location)}`)
}

/** GET /api/v1/weather/forecast — live forecast for the selected coordinates. */
export async function getWeatherForecast(
  location: DemoLocation,
): Promise<WeatherForecastResponse> {
  return request<WeatherForecastResponse>(`/weather/forecast?${buildLocationQuery(location)}`)
}

// ─── Safe-place endpoints ─────────────────────────────────────────────

/** Raw backend record from GET /api/v1/safe-places. */
export interface SafePlaceRecord {
  id: string
  name: string
  category: string
  distance_km: number
  elevation_m: number
  status: 'Available' | 'Monitor access'
  accessibility: string
  latitude: number
  longitude: number
  data_status: string
  recommendation?: string
}

/** Raw backend response for GET /api/v1/safe-places. */
export interface SafePlacesResponse {
  data_status: string
  is_simulated: boolean
  timestamp: string
  disclaimer: string
  location_id: string
  places: SafePlaceRecord[]
}

/** Maps the backend snake_case safe-place record into the frontend SafePlace shape. */
export function mapSafePlace(record: SafePlaceRecord): SafePlace {
  return {
    id: record.id,
    name: record.name,
    category: record.category,
    distanceKm: record.distance_km,
    elevationM: record.elevation_m,
    status: record.status,
    accessibility: record.accessibility,
    latitude: record.latitude,
    longitude: record.longitude,
    recommendation: record.recommendation,
    dataStatus: record.data_status,
  }
}

/** GET /api/v1/safe-places — safe places for the selected location. */
export async function getSafePlaces(location: DemoLocation): Promise<SafePlace[]> {
  const data = await request<SafePlacesResponse>(
    `/safe-places?${buildLocationQuery(location)}`,
  )
  return data.places.map(mapSafePlace)
}

// ─── Evacuation endpoints ─────────────────────────────────────────────

/** Raw backend response for POST /api/v1/evacuation/assess. */
export interface EvacuationAssessResponse {
  data_status: string
  is_simulated: boolean
  timestamp: string
  disclaimer: string
  location_id: string
  route_id: string
  destination_id: string
  route_status: string
  distance_km: number
  destination_elevation_m: number
  hazard_warning: string
  recommendation: string
  coordinates: [number, number][]
  illustrative: boolean
}

/** Maps the backend snake_case evacuation assessment into the frontend DemoRoute shape. */
export function mapEvacuationRoute(response: EvacuationAssessResponse): DemoRoute {
  return {
    id: response.route_id,
    destinationId: response.destination_id,
    distanceKm: response.distance_km,
    destinationElevationM: response.destination_elevation_m,
    status: response.route_status,
    warning: response.hazard_warning,
    reason: response.recommendation,
    coordinates: response.coordinates,
    illustrative: response.illustrative,
  }
}

/** POST /api/v1/evacuation/assess — suggested demo route to a selected destination. */
export async function postEvacuationAssessment(
  location: DemoLocation,
  destinationId: string,
  scenarioId: ScenarioId,
): Promise<EvacuationAssessResponse> {
  return request<EvacuationAssessResponse>('/evacuation/assess', {
    method: 'POST',
    body: JSON.stringify({
      ...buildLocationBody(location),
      destination_id: destinationId,
      scenario: toApiScenario(scenarioId),
    }),
  })
}

// ─── Alerts endpoints ──────────────────────────────────────────────────

/** Raw backend alert record from GET /api/v1/alerts. */
export interface AlertRecord {
  id: string
  severity: AlertSeverity
  title: string
  time: string
  location: string
  reason: string
  recommended_action: string
  data_status: string
}

/** Raw backend response for GET /api/v1/alerts. */
export interface AlertsResponse {
  data_status: string
  is_simulated: boolean
  timestamp: string
  disclaimer: string
  location_id: string
  alerts: AlertRecord[]
}

/** Maps the backend snake_case alert record into the frontend DemoAlert shape. */
export function mapAlert(record: AlertRecord): DemoAlert {
  return {
    id: record.id,
    severity: record.severity,
    title: record.title,
    timestamp: record.time,
    reason: record.reason,
    action: record.recommended_action,
    location: record.location,
    dataStatus: record.data_status,
  }
}

/** GET /api/v1/alerts — demo alerts for the selected location and scenario. */
export async function getAlerts(
  location: DemoLocation,
  scenarioId: ScenarioId,
): Promise<DemoAlert[]> {
  const data = await request<AlertsResponse>(
    `/alerts?${buildLocationQuery(location)}&scenario=${toApiScenario(scenarioId)}`,
  )
  return data.alerts.map(mapAlert)
}

// ─── Seismic endpoints ─────────────────────────────────────────────────

/** Raw backend secondary-hazard entry from GET /api/v1/seismic/latest. */
export interface SecondaryHazardRecord {
  name: string
  status: string
}

/** Raw backend response for GET /api/v1/seismic/latest. */
export interface SeismicLatestResponse {
  data_status: string
  is_simulated: boolean
  timestamp: string
  disclaimer: string
  location_id: string
  event_id: string | null
  magnitude: number | null
  depth_km: number | null
  distance_km: number | null
  event_time: string | null
  latitude: number | null
  longitude: number | null
  seismic_status: string
  note: string
  earthquake_prediction_provided: boolean
  secondary_hazards: SecondaryHazardRecord[]
}

/** Maps the backend seismic_status value to the frontend status union. */
function normalizeSeismicStatus(value: string): SeismicEvent['status'] {
  if (
    value === 'MONITORING' ||
    value === 'NO RECENT EVENT' ||
    value === 'DATA UNAVAILABLE' ||
    value === 'DEMO ALERT'
  ) {
    return value
  }
  return 'DATA UNAVAILABLE'
}

/** Maps the backend snake_case seismic response into the frontend SeismicEvent shape. */
export function mapSeismicEvent(response: SeismicLatestResponse): SeismicEvent {
  const hazards: SecondaryHazard[] = (response.secondary_hazards ?? []).map((hazard) => ({
    name: hazard.name,
    status: hazard.status,
  }))
  return {
    id: response.event_id,
    magnitude: response.magnitude,
    depthKm: response.depth_km,
    distanceKm: response.distance_km,
    time: response.event_time ?? '',
    latitude: response.latitude,
    longitude: response.longitude,
    status: normalizeSeismicStatus(response.seismic_status),
    note: response.note,
    dataStatus: response.data_status,
    secondaryHazards: hazards,
  }
}

/** GET /api/v1/seismic/latest — the most recent monitored demo event. */
export async function getLatestSeismic(location: DemoLocation): Promise<SeismicEvent> {
  const data = await request<SeismicLatestResponse>(
    `/seismic/latest?${buildLocationQuery(location)}`,
  )
  return mapSeismicEvent(data)
}

/** Backward-compatible export for the legacy dashboard path; uses the API when reachable. */
export async function getDemoAssessment(
  scenarioId: ScenarioId,
  location: DemoLocation = {
    id: 'dehradun', name: 'Dehradun', district: 'Dehradun', state: 'Uttarakhand',
    latitude: 30.3165, longitude: 78.0322, elevation: 640, status: 'DEMO',
  },
): Promise<DemoAssessment> {
  // The legacy demo dashboard is an explicit DEMO/SIMULATION surface, so it
  // requests the deterministic scenario fixture rather than the live ML path.
  const assessment = await postRiskAssessment(location, scenarioId, true)
  const weatherMetrics: Metric[] = [
    { label: 'Current rainfall', value: `${assessment.weather.current_rainfall} mm/h`, detail: 'Rain gauge (illustrative)', icon: 'rain' },
    { label: 'Rainfall 24h', value: `${assessment.weather.rainfall_24h} mm`, detail: 'Last 24 hours (illustrative)', icon: 'cloud-rain' },
    { label: 'Forecast rainfall', value: `${assessment.weather.forecast_rainfall} mm`, detail: 'Next period (illustrative)', icon: 'cloud-rain' },
    { label: 'Precipitation probability', value: `${assessment.weather.precipitation_probability}%`, detail: 'Forecast chance', icon: 'droplets' },
  ]
  const terrainMetrics: Metric[] = [
    { label: 'Elevation', value: `${assessment.terrain.elevation} m`, detail: 'Location elevation', icon: 'mountain' },
    { label: 'Slope', value: `${assessment.terrain.slope}°`, detail: 'Terrain slope', icon: 'triangle' },
    { label: 'Soil moisture', value: `${assessment.terrain.soil_moisture}%`, detail: 'Estimated soil saturation', icon: 'droplets' },
    { label: 'River distance', value: `${assessment.terrain.river_distance} m`, detail: 'Proximity to river corridor', icon: 'route' },
  ]
  const riskFactors: RiskFactor[] = assessment.factors.map((title) => ({
    title,
    description: 'Identified by deterministic demo scenario logic; not ML-generated.',
    severity: assessment.risk_level === 'CRITICAL' || assessment.risk_level === 'HIGH' ? 'major' : 'elevated',
  }))
  return {
    scenarioId,
    scenarioLabel: assessment.scenario_label,
    location: assessment.location_id,
    coordinates: assessment.location_id,
    // Demo locations always return numeric risk from the scenario service; the
    // null-coalescing fallbacks only satisfy the legacy demo dashboard typing.
    probability: assessment.probability ?? 0,
    riskLevel: assessment.risk_level ?? 'LOW',
    summary: assessment.factors.join(' + '),
    warningTitle: assessment.warning,
    warningAction: assessment.recommended_action,
    updatedAt: 'API · ' + new Date().toISOString(),
    weatherMetrics,
    terrainMetrics,
    riskFactors,
  }
}