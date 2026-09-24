import { describe, expect, it } from 'vitest'
import {
  formatRiverDistance,
  hasRisk,
  mapHistoricalContext,
  mapRiskAssessment,
  riskOrigin,
  riskStatusLabel,
  toScenarioId,
  type RiskAssessment,
  type RiskHistoricalContext,
} from '../src/api/risk-api'
import type { DemoLocation } from '../src/types/location'

const arbitraryLocation: DemoLocation = {
  id: 'arbitrary-30.5-79.3',
  name: 'Gangotri approach',
  district: '',
  state: '',
  latitude: 30.5,
  longitude: 79.3,
  elevation: 0,
  status: 'ARBITRARY',
}

const demoLocation: DemoLocation = {
  id: 'dehradun',
  name: 'Dehradun',
  district: 'Dehradun',
  state: 'Uttarakhand',
  latitude: 30.3165,
  longitude: 78.0322,
  elevation: 640,
  status: 'DEMO',
}

/** Shape of the real Step-7 backend response for an arbitrary coordinate. */
const livePredictionPayload: RiskAssessment = {
  location_id: 'arbitrary-30.5-79.3',
  scenario: 'normal',
  scenario_label: 'Live ML prediction',
  probability: 66.8,
  risk_level: 'HIGH',
  factors: ['rainfall_24h = 7.1 mm, importance 0.2064'],
  warning: 'HIGH flood risk — ML baseline estimate (not official guidance).',
  recommended_action: 'Avoid low-lying areas and river channels. Follow official local guidance; treat this estimate as advisory only.',
  terrain: {
    elevation: 652, slope: null, aspect: 'Unavailable', soil_moisture: 42.0,
    river_distance: null, drainage: 'Unavailable', historical: 'Unavailable', exposure: 'Unavailable',
  },
  weather: {
    temperature: 18.7, humidity: 93, current_rainfall: 0.1, rainfall_1h: 0.1,
    rainfall_3h: 0.5, rainfall_6h: 1.4, rainfall_24h: 7.1, rainfall_72h: 19.5,
    rainfall_7d: 108.9, antecedent_rainfall_7d: 96.2, forecast_rainfall: 6.7,
    precipitation_probability: 76, wind_speed: 0.8, wind_direction: 'ENE',
    pressure: 822.3, soil_moisture: 42.0, soil_moisture_0_to_7cm: 42.3,
    hourly_rainfall: [0.1, 0.2],
  },
  model_status: 'Connected — rf_calibrated_baseline_v1 (READY)',
  data_status: 'LIVE',
  is_simulated: false,
  timestamp: '2026-09-12T07:52:19.526873+00:00',
  disclaimer: 'Baseline research artifact; not a production prediction and not a substitute for official hydrological or emergency-authority warnings.',
  prediction_status: 'PREDICTION',
  reason: null,
  missing_features: [],
  model_version: 'rf_calibrated_baseline_v1',
  contributing_factors: [
    { feature: 'rainfall_24h', value: 7.1, unit: 'mm', importance: 0.2064 },
    { feature: 'rainfall_72h', value: 19.5, unit: 'mm', importance: 0.1394 },
    { feature: 'soil_moisture_0_to_7cm', value: 42.3, unit: '%', importance: 0.1326 },
  ],
  explanation: 'The baseline model ranked rainfall_24h, rainfall_72h and soil moisture as the top contributing features.',
}

const dataIncompletePayload: RiskAssessment = {
  location_id: 'arbitrary-30.5-79.3',
  scenario: 'critical_flood',
  scenario_label: 'Live ML prediction unavailable',
  probability: null,
  risk_level: null,
  factors: [],
  warning: 'Flood risk unavailable — missing live rainfall windows for the ML prediction.',
  recommended_action: 'Rely on official warnings; this endpoint could not produce an ML prediction. Monitor live weather for the area.',
  terrain: {
    elevation: 652, slope: null, aspect: 'Unavailable', soil_moisture: 42.0,
    river_distance: null, drainage: 'Unavailable', historical: 'Unavailable', exposure: 'Unavailable',
  },
  weather: {
    temperature: 18.7, humidity: 93, current_rainfall: 0.1, rainfall_1h: 0.1,
    rainfall_3h: 0.5, rainfall_6h: 1.4, rainfall_24h: 7.1, rainfall_72h: null,
    rainfall_7d: null, antecedent_rainfall_7d: null, forecast_rainfall: 6.7,
    precipitation_probability: 76, wind_speed: 0.8, wind_direction: 'ENE',
    pressure: 822.3, soil_moisture: 42.0, soil_moisture_0_to_7cm: 42.3,
    hourly_rainfall: [0.1, 0.2],
  },
  model_status: 'Connected — rf_calibrated_baseline_v1 (READY)',
  data_status: 'LIVE',
  is_simulated: false,
  timestamp: '2026-09-12T07:52:19.526873+00:00',
  disclaimer: 'Live request produced no ML prediction; no demo/scenario probability was substituted.',
  prediction_status: 'UNAVAILABLE',
  reason: 'DATA_INCOMPLETE',
  missing_features: ['rainfall_72h', 'rainfall_7d', 'antecedent_rainfall_7d'],
  model_version: 'rf_calibrated_baseline_v1',
  contributing_factors: [],
  explanation: 'Insufficient live feature coverage: the 72-hour, 7-day and antecedent rainfall windows could not be computed.',
}

const modelUnavailablePayload: RiskAssessment = {
  ...dataIncompletePayload,
  model_status: 'Model not loaded — ML prediction unavailable',
  model_version: null,
  reason: 'MODEL_UNAVAILABLE',
  missing_features: [],
  explanation: 'The model artifact could not be loaded by the server.',
}

const demoPayload: RiskAssessment = {
  location_id: 'dehradun',
  scenario: 'critical_flood',
  scenario_label: 'Critical Flood',
  probability: 87,
  risk_level: 'CRITICAL',
  factors: ['Extreme rainfall', 'Saturated soil', 'Steep terrain', 'Close to river'],
  warning: 'CRITICAL flood risk — simulation',
  recommended_action: 'Avoid low-lying areas and river channels. Follow official emergency instructions immediately.',
  terrain: {
    elevation: 640, slope: 34, aspect: 'South-east', soil_moisture: 91,
    river_distance: 400, drainage: 'Rapid runoff watch', historical: 'Seasonal exposure', exposure: 'Elevated',
  },
  weather: {
    temperature: 18, humidity: 96, current_rainfall: 82, rainfall_1h: 82,
    rainfall_3h: 160, rainfall_6h: 248, rainfall_24h: 318, forecast_rainfall: 118,
    precipitation_probability: 98, wind_speed: 34, wind_direction: 'SSE',
    pressure: 991, hourly_rainfall: [35, 48],
  },
  model_status: 'Not connected — demo scenario logic only',
  data_status: 'DEMO',
  is_simulated: true,
  timestamp: 'Simulation update · 09:30 IST',
  disclaimer: 'Deterministic demo data only; not live, official, or ML-generated.',
}

describe('mapRiskAssessment — live ML prediction', () => {
  const command = mapRiskAssessment(livePredictionPayload, arbitraryLocation, 'normal')

  it('keeps the real ML probability and risk level', () => {
    expect(command.probability).toBe(66.8)
    expect(command.riskLevel).toBe('HIGH')
  })

  it('flags the result as a LIVE ML prediction', () => {
    expect(command.predictionStatus).toBe('PREDICTION')
    expect(command.modelVersion).toBe('rf_calibrated_baseline_v1')
    expect(riskOrigin(command)).toBe('live')
    expect(riskStatusLabel('live')).toBe('LIVE · ML PREDICTION')
  })

  it('maps contributing factors with value/unit/importance', () => {
    expect(command.contributingFactors).toHaveLength(3)
    expect(command.contributingFactors[0]).toEqual({
      feature: 'rainfall_24h', value: 7.1, unit: 'mm', importance: 0.2064,
    })
    expect(command.factors[0]).toContain('rainfall_24h')
    expect(command.explanation).toContain('rainfall_24h')
  })

  it('maps weather and terrain honestly (null windows preserved as null)', () => {
    expect(command.weather.rainfall72h).toBe(19.5)
    expect(command.weather.currentRainfall).toBe(0.1)
    expect(command.weather.hourlyRainfall).toEqual([0.1, 0.2])
    expect(command.terrain.elevation).toBe(652)
    expect(command.terrain.slope).toBeNull()
    expect(command.terrain.aspect).toBe('Unavailable')
  })

  it('reports a usable probability via hasRisk', () => {
    expect(hasRisk(command.probability, command.riskLevel)).toBe(true)
  })
})

describe('mapRiskAssessment — honest unavailable (DATA_INCOMPLETE)', () => {
  const command = mapRiskAssessment(dataIncompletePayload, arbitraryLocation, 'critical-flood')

  it('never substitutes a demo/scenario probability', () => {
    expect(command.probability).toBeNull()
    expect(command.riskLevel).toBeNull()
    expect(command.predictionStatus).toBe('UNAVAILABLE')
    expect(command.reason).toBe('DATA_INCOMPLETE')
    expect(riskOrigin(command)).toBe('unavailable')
    expect(hasRisk(command.probability, command.riskLevel)).toBe(false)
    expect(command.factors).toEqual([])
  })

  it('carries the missing live features for the UI', () => {
    expect(command.missingFeatures).toEqual(['rainfall_72h', 'rainfall_7d', 'antecedent_rainfall_7d'])
    expect(command.weather.rainfall72h).toBeNull()
    expect(riskStatusLabel('unavailable')).toBe('RISK · UNAVAILABLE')
  })
})

describe('mapRiskAssessment — honest unavailable (MODEL_UNAVAILABLE)', () => {
  it('reports the model failure and no model version', () => {
    const command = mapRiskAssessment(modelUnavailablePayload, arbitraryLocation, 'critical-flood')
    expect(command.reason).toBe('MODEL_UNAVAILABLE')
    expect(command.predictionStatus).toBe('UNAVAILABLE')
    expect(command.modelVersion).toBeNull()
    expect(command.probability).toBeNull()
    expect(riskOrigin(command)).toBe('unavailable')
  })
})

describe('mapRiskAssessment — demo / simulation unchanged', () => {
  const command = mapRiskAssessment(demoPayload, demoLocation, 'critical-flood')

  it('keeps deterministic demo values and marks no ML status', () => {
    expect(command.probability).toBe(87)
    expect(command.riskLevel).toBe('CRITICAL')
    expect(command.predictionStatus).toBeNull()
    expect(command.modelVersion).toBeNull()
    expect(command.contributingFactors).toEqual([])
    expect(command.factors).toHaveLength(4)
    expect(command.weather.currentRainfall).toBe(82)
    expect(command.terrain.soilMoisture).toBe(91)
    expect(riskOrigin(command)).toBe('demo')
    expect(riskStatusLabel('demo')).toBe('DEMO / SIMULATION')
  })
})

describe('toScenarioId', () => {
  it('normalizes backend underscores to frontend hyphens', () => {
    expect(toScenarioId('critical_flood')).toBe('critical-flood')
    expect(toScenarioId('heavy_rain')).toBe('heavy-rain')
    expect(toScenarioId('extreme_rain')).toBe('extreme-rain')
    expect(toScenarioId('normal')).toBe('normal')
  })
  it('falls back to normal for unknown values', () => {
    expect(toScenarioId('volcano')).toBe('normal')
  })
})

describe('formatRiverDistance', () => {
  it('keeps distances under 1000 m in metres', () => {
    expect(formatRiverDistance(0)).toBe('0 m')
    expect(formatRiverDistance(867)).toBe('867 m')
    expect(formatRiverDistance(999)).toBe('999 m')
  })
  it('converts distances from 1000 m up to kilometres with two decimals', () => {
    expect(formatRiverDistance(1000)).toBe('1.00 km')
    expect(formatRiverDistance(1279)).toBe('1.28 km')
    expect(formatRiverDistance(2966)).toBe('2.97 km')
  })
  it('renders a missing value as Unavailable — never a zero distance', () => {
    expect(formatRiverDistance(null)).toBe('Unavailable')
  })
})

const historicalAvailableBlock: RiskHistoricalContext = {
  status: 'AVAILABLE',
  status_reason: null,
  source: 'DFO Global Flood Records v0.9.0 (CC0)',
  coverage: {
    start_date: '1985-01-01',
    end_date: '2024-01-09',
    event_count: 5503,
    usable_event_count: 5501,
  },
  search_radius_m: 50000,
  distance_basis: 'ANCHOR_VERTEX',
  nearest: {
    fid: 2027,
    report_number: '2027',
    distance_m: 21718,
    distance_basis: 'ANCHOR_VERTEX',
    latitude: 30.19133,
    longitude: 78.21165,
    begin_date: '2002-08-11',
    end_date: '2002-08-13',
    country: 'India',
    cause: 'Heavy rain',
    severity: 1,
    flood_impact_index: 4.3,
  },
  polygon_contains_location: true,
  events_nearby: [],
  disclaimer: 'Recorded floods are regional polygons; distance is to the anchor vertex.',
}

describe('mapHistoricalContext — DFO block mapping', () => {
  it('maps an AVAILABLE block to the camelCase view', () => {
    const mapped = mapHistoricalContext(historicalAvailableBlock)!
    expect(mapped.status).toBe('AVAILABLE')
    expect(mapped.statusReason).toBeNull()
    expect(mapped.source).toContain('DFO')
    expect(mapped.coverage).toEqual({
      startDate: '1985-01-01',
      endDate: '2024-01-09',
      eventCount: 5503,
      usableEventCount: 5501,
    })
    expect(mapped.searchRadiusM).toBe(50000)
    expect(mapped.distanceBasis).toBe('ANCHOR_VERTEX')
    expect(mapped.polygonContainsLocation).toBe(true)
    expect(mapped.nearest).toEqual({
      fid: 2027,
      reportNumber: '2027',
      distanceM: 21718,
      distanceBasis: 'ANCHOR_VERTEX',
      latitude: 30.19133,
      longitude: 78.21165,
      beginDate: '2002-08-11',
      endDate: '2002-08-13',
      country: 'India',
      cause: 'Heavy rain',
      severity: 1,
      floodImpactIndex: 4.3,
    })
    expect(mapped.eventsNearby).toEqual([])
  })

  it('maps null/absent blocks to null (demo results)', () => {
    expect(mapHistoricalContext(null)).toBeNull()
    expect(mapHistoricalContext(undefined)).toBeNull()
  })

  it('maps an UNAVAILABLE block without inventing coverage', () => {
    const mapped = mapHistoricalContext({
      ...historicalAvailableBlock,
      status: 'UNAVAILABLE',
      status_reason: 'INDEX_UNAVAILABLE',
      source: null,
      coverage: null,
      nearest: null,
      polygon_contains_location: null,
    })!
    expect(mapped.status).toBe('UNAVAILABLE')
    expect(mapped.statusReason).toBe('INDEX_UNAVAILABLE')
    expect(mapped.coverage).toBeNull()
    expect(mapped.nearest).toBeNull()
    expect(mapped.polygonContainsLocation).toBeNull()
  })

  it('mapRiskAssessment attaches the block for live payloads', () => {
    const command = mapRiskAssessment(
      { ...livePredictionPayload, historical: historicalAvailableBlock },
      arbitraryLocation,
      'normal',
    )
    expect(command.historical?.nearest?.reportNumber).toBe('2027')
    expect(command.historical?.coverage?.usableEventCount).toBe(5501)
  })

  it('mapRiskAssessment leaves demo payloads with null history', () => {
    const command = mapRiskAssessment(demoPayload, demoLocation, 'critical-flood')
    expect(command.historical).toBeNull()
  })
})