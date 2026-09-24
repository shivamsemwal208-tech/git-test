import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mapRiskAssessment, type RiskHistoricalContext, type RiskAssessment } from '../src/api/risk-api'
import type { DemoLocation } from '../src/types/location'

vi.mock('../src/features/command-center/command-context', () => ({
  useCommand: vi.fn(),
}))

import { useCommand } from '../src/features/command-center/command-context'
import { FloodRiskPage } from '../src/features/flood-risk/flood-risk-page'

const mockedUseCommand = vi.mocked(useCommand)

const arbitraryLocation: DemoLocation = {
  id: 'arbitrary-30.2-78.2',
  name: 'Rajawala approach',
  district: '',
  state: '',
  latitude: 30.2,
  longitude: 78.2,
  elevation: 0,
  status: 'ARBITRARY',
}

const availableBlock: RiskHistoricalContext = {
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
    begin_date: '2002-08-11',
    end_date: '2002-08-13',
    country: 'India',
    cause: 'Heavy rain',
    severity: 1,
    flood_impact_index: 4.3,
  },
  polygon_contains_location: true,
  events_nearby: [],
  disclaimer:
    'Distance is measured to each event anchor vertex and does not imply local flooding. Absence of a nearby record does not prove flooding never occurred.',
}

function basePayload(historical: RiskHistoricalContext | null): RiskAssessment {
  return {
    location_id: arbitraryLocation.id,
    scenario: 'normal',
    scenario_label: 'Live ML prediction',
    probability: 44.0,
    risk_level: 'MODERATE',
    factors: [],
    warning: 'MODERATE flood risk — ML baseline estimate (not official guidance).',
    recommended_action: 'Avoid riverbanks where possible.',
    terrain: {
      elevation: 640, slope: 23.5, aspect: 'Unavailable', soil_moisture: 42,
      river_distance: null, drainage: 'Unavailable', historical: 'Recorded 2002 event ~21.7 km (2027)', exposure: 'Unavailable',
    },
    weather: {
      temperature: 24, humidity: 90, current_rainfall: 1, rainfall_1h: 1,
      rainfall_3h: 3, rainfall_6h: 6, rainfall_24h: 24, rainfall_72h: 100,
      rainfall_7d: 140, antecedent_rainfall_7d: 130, forecast_rainfall: 10,
      precipitation_probability: 60, wind_speed: 5, wind_direction: 'NW',
      pressure: 1000, soil_moisture: 42, soil_moisture_0_to_7cm: 44,
      hourly_rainfall: [1, 2],
    },
    model_status: 'Connected — rf_calibrated_baseline_v1 (READY)',
    data_status: 'LIVE',
    is_simulated: false,
    timestamp: '2026-09-12T07:52:19.526873+00:00',
    disclaimer: 'Baseline research artifact; not official guidance.',
    prediction_status: 'PREDICTION',
    reason: null,
    missing_features: [],
    model_version: 'rf_calibrated_baseline_v1',
    contributing_factors: [],
    explanation: null,
    historical,
  }
}

function renderFloodRisk(payload: RiskAssessment) {
  mockedUseCommand.mockReturnValue({
    command: mapRiskAssessment(payload, arbitraryLocation, 'normal'),
    dataSource: 'api',
    isLoading: false,
    location: arbitraryLocation,
    locations: [arbitraryLocation],
    safePlaces: [],
    alerts: [],
    seismic: [],
    weather: { current: null, forecast: null, error: null },
    apiError: null,
    riskOrigin: 'live',
    emergencySimulation: false,
    toggleEmergencySimulation: vi.fn(),
    setLocation: vi.fn(),
    setScenarioId: vi.fn(),
  })
  return render(<FloodRiskPage />)
}

describe('FloodRiskPage — historical context (AVAILABLE with nearest)', () => {
  beforeEach(() => mockedUseCommand.mockReset())
  afterEach(cleanup)

  it('shows the nearest recorded event with dynamic API values', () => {
    renderFloodRisk(basePayload(availableBlock))
    expect(screen.getByText(/HISTORICAL FLOOD CONTEXT/)).toBeInTheDocument()
    expect(screen.getByText(/Nearest recorded event ≈ 21\.72 km/)).toBeInTheDocument()
    expect(screen.getByText(/Event #2027/)).toBeInTheDocument()
    expect(screen.getByText(/Heavy rain/)).toBeInTheDocument()
    expect(screen.getByText(/DFO severity Minor/)).toBeInTheDocument()
    expect(screen.getByText(/11 Aug 2002 – 13 Aug 2002/)).toBeInTheDocument()
    expect(screen.getByText(/reported in India/)).toBeInTheDocument()
  })

  it('renders the catalogue coverage and the coarse-containment note', () => {
    renderFloodRisk(basePayload(availableBlock))
    expect(screen.getByText(/5,501 usable recorded floods/)).toBeInTheDocument()
    expect(screen.getByText(/1 Jan 1985 to 9 Jan 2024/)).toBeInTheDocument()
    expect(screen.getByText(/fall inside the mapped region of a recorded flood event/)).toBeInTheDocument()
  })

  it('renders the honest-distance and no-record disclaimers', () => {
    renderFloodRisk(basePayload(availableBlock))
    expect(screen.getAllByText(/anchor vertex/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Absence of a nearby record does not prove flooding never occurred/)).toBeInTheDocument()
  })

  it('does NOT hardcode the Rajawala event when values differ', () => {
    const different: RiskHistoricalContext = {
      ...availableBlock,
      nearest: {
        ...availableBlock.nearest!,
        fid: 4065,
        report_number: '4065',
        distance_m: 31000,
        begin_date: '2013-06-15',
        end_date: '2013-06-17',
        cause: 'Heavy rain',
      },
    }
    renderFloodRisk(basePayload(different))
    expect(screen.getByText(/Event #4065/)).toBeInTheDocument()
    expect(screen.getByText(/15 Jun 2013 – 17 Jun 2013/)).toBeInTheDocument()
    expect(screen.getByText(/Nearest recorded event ≈ 31\.00 km/)).toBeInTheDocument()
    expect(screen.queryByText(/Event #2027/)).not.toBeInTheDocument()
  })
})

describe('FloodRiskPage — historical context (no nearby event)', () => {
  beforeEach(() => mockedUseCommand.mockReset())
  afterEach(cleanup)

  it('honestly states that no recorded event lies within the radius', () => {
    const block: RiskHistoricalContext = {
      ...availableBlock,
      nearest: null,
      events_nearby: [],
      polygon_contains_location: false,
    }
    renderFloodRisk(basePayload(block))
    expect(screen.getByText(/No recorded DFO flood event lies within the 50 km search radius/)).toBeInTheDocument()
    expect(screen.queryByText(/Event #/)).not.toBeInTheDocument()
    expect(screen.getByText(/Absence of a nearby record does not prove flooding never occurred/)).toBeInTheDocument()
  })
})

describe('FloodRiskPage — historical context (index unavailable)', () => {
  beforeEach(() => mockedUseCommand.mockReset())
  afterEach(cleanup)

  it('shows an honest unavailable reason and never fabricates an event', () => {
    const block: RiskHistoricalContext = {
      status: 'UNAVAILABLE',
      status_reason: 'INDEX_UNAVAILABLE',
      source: null,
      coverage: null,
      search_radius_m: 50000,
      distance_basis: 'ANCHOR_VERTEX',
      nearest: null,
      polygon_contains_location: null,
      events_nearby: [],
      disclaimer: 'No demo or fabricated history was produced.',
    }
    renderFloodRisk(basePayload(block))
    expect(screen.getByText(/missing or unreadable/)).toBeInTheDocument()
    expect(screen.queryByText(/Event #/)).not.toBeInTheDocument()
    expect(screen.getByText(/No demo or fabricated history was produced/)).toBeInTheDocument()
  })
})

describe('FloodRiskPage — demo mode never shows the history card', () => {
  beforeEach(() => mockedUseCommand.mockReset())
  afterEach(cleanup)

  it('keeps demo mode unchanged with no historical context section', () => {
    renderFloodRisk(basePayload(null))
    expect(screen.queryByText(/HISTORICAL FLOOD CONTEXT/)).not.toBeInTheDocument()
  })
})