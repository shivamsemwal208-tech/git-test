import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mapRiskAssessment, type RiskAssessment } from '../src/api/risk-api'
import type { DemoLocation } from '../src/types/location'

vi.mock('../src/features/command-center/command-context', () => ({
  useCommand: vi.fn(),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('../src/components/map/command-map', () => ({
  CommandMap: () => <div data-testid="mock-command-map" />,
}))

import { useCommand } from '../src/features/command-center/command-context'
import { EmergencyPage } from '../src/features/emergency/emergency-page'

const mockedUseCommand = vi.mocked(useCommand)

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

const criticalPayload: RiskAssessment = {
  location_id: 'dehradun',
  scenario: 'critical_flood',
  scenario_label: 'Critical Flood',
  probability: 87,
  risk_level: 'CRITICAL',
  factors: ['Extreme rainfall', 'Saturated soil', 'Steep terrain', 'Close to river'],
  warning: 'CRITICAL flood risk — simulation',
  recommended_action:
    'Avoid low-lying areas and river channels. Follow official emergency instructions immediately.',
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

const lowPayload: RiskAssessment = {
  location_id: 'dehradun',
  scenario: 'normal',
  scenario_label: 'Normal',
  probability: 18,
  risk_level: 'LOW',
  factors: ['Light rainfall', 'Stable soil condition'],
  warning: 'LOW flood risk — simulation',
  recommended_action: 'Continue to monitor official weather and local authority updates.',
  terrain: {
    elevation: 640, slope: 34, aspect: 'South-east', soil_moisture: 63,
    river_distance: 400, drainage: 'Stable', historical: 'Seasonal exposure', exposure: 'Monitoring',
  },
  weather: {
    temperature: 24, humidity: 68, current_rainfall: 6, rainfall_1h: 6,
    rainfall_3h: 18, rainfall_6h: 25, rainfall_24h: 42, forecast_rainfall: 12,
    precipitation_probability: 35, wind_speed: 8, wind_direction: 'NW',
    pressure: 1011, hourly_rainfall: [1, 2],
  },
  model_status: 'Not connected — demo scenario logic only',
  data_status: 'DEMO',
  is_simulated: true,
  timestamp: 'Simulation update · 09:30 IST',
  disclaimer: 'Deterministic demo data only; not live, official, or ML-generated.',
}

function renderEmergency(
  payload: RiskAssessment,
  scenario: 'normal' | 'critical-flood',
  emergencySimulation = false,
) {
  mockedUseCommand.mockReturnValue({
    command: mapRiskAssessment(payload, demoLocation, scenario),
    dataSource: 'api',
    isLoading: false,
    location: demoLocation,
    locations: [demoLocation],
    safePlaces: [],
    alerts: [],
    seismic: [],
    weather: { current: null, forecast: null, error: null },
    apiError: null,
    riskOrigin: 'demo',
    emergencySimulation,
    toggleEmergencySimulation: vi.fn(),
    setLocation: vi.fn(),
    setScenarioId: vi.fn(),
  })
  return render(<EmergencyPage />)
}

describe('EmergencyPage — HIGH/CRITICAL triggers a flood warning', () => {
  beforeEach(() => {
    mockedUseCommand.mockReset()
  })
  afterEach(cleanup)

  it('shows the active flood warning plus risk, rainfall and soil-moisture values', () => {
    renderEmergency(criticalPayload, 'critical-flood')
    expect(screen.getByText(/EMERGENCY MODE/)).toBeInTheDocument()
    expect(screen.getByText('CRITICAL FLOOD RISK')).toBeInTheDocument()
    expect(screen.getByText('FLOOD WARNING ACTIVE')).toBeInTheDocument()
    expect(screen.getByText('87')).toBeInTheDocument()
    expect(screen.getByText(/82 mm\/h/)).toBeInTheDocument()
    expect(screen.getByText(/318 mm/)).toBeInTheDocument()
    expect(screen.getByText(/91%/)).toBeInTheDocument()
  })

  it('lists the top contributing factors and the recommended action', () => {
    renderEmergency(criticalPayload, 'critical-flood')
    expect(screen.getByText('TOP CONTRIBUTING FACTORS')).toBeInTheDocument()
    expect(screen.getAllByText('Extreme rainfall').length).toBeGreaterThan(0)
    expect(screen.getByText(/Avoid low-lying areas and river channels/)).toBeInTheDocument()
  })

  it('keeps the demo-fidelity labelling and the map layer', () => {
    renderEmergency(criticalPayload, 'critical-flood')
    expect(screen.getAllByText('DEMO / SIMULATION').length).toBeGreaterThan(0)
    expect(screen.getByTestId('mock-command-map')).toBeInTheDocument()
    expect(screen.queryByText(/LIVE · ML PREDICTION/)).not.toBeInTheDocument()
  })
})

describe('EmergencyPage — simulate emergency control', () => {
  beforeEach(() => {
    mockedUseCommand.mockReset()
  })
  afterEach(cleanup)

  it('clearly labels the DEMO simulation and never presents it as live data', () => {
    renderEmergency(criticalPayload, 'critical-flood', true)
    expect(screen.getAllByText(/SIMULATION ACTIVE/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('SIMULATION · DEMO').length).toBeGreaterThan(0)
    expect(screen.getAllByText('DEMO / SIMULATION').length).toBeGreaterThan(0)
    expect(screen.getByText('END SIMULATION')).toBeInTheDocument()
    expect(screen.queryByText(/LIVE · ML PREDICTION/)).not.toBeInTheDocument()
  })
})

describe('EmergencyPage — non-warning risk stays honest', () => {
  beforeEach(() => {
    mockedUseCommand.mockReset()
  })
  afterEach(cleanup)

  it('does not trigger a flood warning for LOW risk', () => {
    renderEmergency(lowPayload, 'normal')
    expect(screen.queryByText('FLOOD WARNING ACTIVE')).not.toBeInTheDocument()
    expect(screen.getByText(/does not trigger Emergency Mode/)).toBeInTheDocument()
  })
})