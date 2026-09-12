import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mapRiskAssessment, type RiskAssessment } from '../src/api/risk-api'
import type { DemoLocation } from '../src/types/location'

vi.mock('../src/features/command-center/command-context', () => ({
  useCommand: vi.fn(),
}))

import { useCommand } from '../src/features/command-center/command-context'
import { FloodRiskPage } from '../src/features/flood-risk/flood-risk-page'

const mockedUseCommand = vi.mocked(useCommand)

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

const livePredictionPayload: RiskAssessment = {
  location_id: 'arbitrary-30.5-79.3',
  scenario: 'normal',
  scenario_label: 'Live ML prediction',
  probability: 66.8,
  risk_level: 'HIGH',
  factors: ['rainfall_24h = 7.1 mm, importance 0.2064', 'rainfall_72h = 19.5 mm, importance 0.1394'],
  warning: 'HIGH flood risk — ML baseline estimate (not official guidance).',
  recommended_action: 'Avoid low-lying areas and river channels. Follow official local guidance.',
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

const unavailablePayload: RiskAssessment = {
  location_id: 'arbitrary-30.5-79.3',
  scenario: 'critical_flood',
  scenario_label: 'Live ML prediction unavailable',
  probability: null,
  risk_level: null,
  factors: [],
  warning: 'Flood risk unavailable — missing live rainfall windows for the ML prediction.',
  recommended_action: 'Rely on official warnings; this endpoint could not produce an ML prediction.',
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

function renderFloodRisk(payload: RiskAssessment, location: DemoLocation, scenario: 'normal' | 'critical-flood' = 'normal') {
  mockedUseCommand.mockReturnValue({
    command: mapRiskAssessment(payload, location, scenario),
    dataSource: 'api',
    isLoading: false,
    location,
    locations: [location],
    safePlaces: [],
    alerts: [],
    seismic: [],
    weather: { current: null, forecast: null, error: null },
    apiError: null,
    riskOrigin: 'demo',
    setLocation: vi.fn(),
    setScenarioId: vi.fn(),
  })
  return render(<FloodRiskPage />)
}

describe('FloodRiskPage — LIVE ML prediction (arbitrary coordinates)', () => {
  beforeEach(() => {
    mockedUseCommand.mockReset()
  })
  afterEach(cleanup)

  it('shows the LIVE ML status, probability, risk level and model version', () => {
    renderFloodRisk(livePredictionPayload, arbitraryLocation)
    expect(screen.getByText(/LIVE · ML PREDICTION/)).toBeInTheDocument()
    expect(screen.getByText(/66\.8/)).toBeInTheDocument()
    expect(screen.getByText('HIGH')).toBeInTheDocument()
    expect(screen.getAllByText(/rf_calibrated_baseline_v1/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Live ML assessment/i)).toBeInTheDocument()
  })

  it('shows ranked contributing factors with importance and the explanation', () => {
    renderFloodRisk(livePredictionPayload, arbitraryLocation)
    expect(screen.getByText('rainfall_24h')).toBeInTheDocument()
    expect(screen.getByText('soil_moisture_0_to_7cm')).toBeInTheDocument()
    expect(screen.getByText(/importance 0\.2064/)).toBeInTheDocument()
    expect(screen.getByText(/ranked rainfall_24h, rainfall_72h and soil moisture/)).toBeInTheDocument()
  })

  it('does not label a live prediction as demo/simulation', () => {
    renderFloodRisk(livePredictionPayload, arbitraryLocation)
    expect(screen.queryByText(/DEMO \/ SIMULATION/)).not.toBeInTheDocument()
    expect(screen.queryByText(/not generated by a real ML model/)).not.toBeInTheDocument()
  })
})

describe('FloodRiskPage — honest unavailable', () => {
  beforeEach(() => {
    mockedUseCommand.mockReset()
  })
  afterEach(cleanup)

  it('never displays a fabricated probability and shows the reason and missing features', () => {
    renderFloodRisk(unavailablePayload, arbitraryLocation, 'critical-flood')
    expect(screen.getByText(/RISK · UNAVAILABLE/)).toBeInTheDocument()
    expect(screen.getByText('RISK UNAVAILABLE')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('DATA_INCOMPLETE')).toBeInTheDocument()
    expect(screen.getByText(/rainfall_72h/)).toBeInTheDocument()
    expect(screen.getByText('No prediction available')).toBeInTheDocument()
    expect(screen.queryByText(/0%/)).not.toBeInTheDocument()
    expect(screen.queryByText(/87%/)).not.toBeInTheDocument()
    expect(screen.queryByText(/LIVE · ML PREDICTION/)).not.toBeInTheDocument()
  })
})

describe('FloodRiskPage — demo / simulation unchanged', () => {
  beforeEach(() => {
    mockedUseCommand.mockReset()
  })
  afterEach(cleanup)

  it('keeps the deterministic scenario display and no ML claims', () => {
    renderFloodRisk(demoPayload, demoLocation, 'critical-flood')
    expect(screen.getByText(/DEMO \/ SIMULATION/)).toBeInTheDocument()
    expect(screen.getByText('87')).toBeInTheDocument()
    expect(screen.getByText('CRITICAL')).toBeInTheDocument()
    expect(screen.getByText('CRITICAL scenario')).toBeInTheDocument()
    expect(screen.getAllByText(/not generated by a real ML model/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/LIVE · ML PREDICTION/)).not.toBeInTheDocument()
    expect(screen.queryByText(/rf_calibrated_baseline_v1/)).not.toBeInTheDocument()
  })
})