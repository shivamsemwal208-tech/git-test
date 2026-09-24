import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RiskCommand } from '../src/api/risk-api'
import type { SafePlaceItem } from '../src/api/safe-places-api'
import type { DemoLocation } from '../src/types/location'
import type {
  HistoricalContext,
  HistoricalEvent,
  ScenarioId,
} from '../src/types/risk'

vi.mock('../src/features/command-center/command-context', () => ({
  useCommand: vi.fn(),
}))

vi.mock('../src/api/rivers-api', () => ({
  fetchNearbyRiverSegments: vi.fn(),
}))

vi.mock('../src/api/safe-places-api', () => ({
  fetchSafePlaces: vi.fn(),
}))

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <section data-testid="map-container">{children}</section>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  CircleMarker: ({
    center,
    children,
  }: {
    center: [number, number]
    children?: React.ReactNode
  }) => (
    <div data-testid="circle-marker" data-center={center.join(',')}>
      {children}
    </div>
  ),
  Polyline: ({ positions }: { positions: [number, number][] }) => (
    <div data-testid="polyline" data-positions={JSON.stringify(positions)} />
  ),
  Popup: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="popup">{children}</div>
  ),
  Tooltip: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="tooltip">{children}</div>
  ),
  useMap: () => ({ flyTo: vi.fn() }),
}))

import { useCommand } from '../src/features/command-center/command-context'
import { fetchNearbyRiverSegments } from '../src/api/rivers-api'
import { fetchSafePlaces } from '../src/api/safe-places-api'
import { LiveMapPage } from '../src/features/map/live-map-page'
import { historicalEventsWithCoords } from '../src/features/map/flood-intelligence-state'

const mockedUseCommand = vi.mocked(useCommand)
const mockedFetchRivers = vi.mocked(fetchNearbyRiverSegments)
const mockedFetchPlaces = vi.mocked(fetchSafePlaces)

const AVAILABLE_EMPTY_PLACES = {
  locationId: 'dehradun',
  latitude: 30.3165,
  longitude: 78.0322,
  radiusM: 5000,
  status: 'AVAILABLE' as const,
  statusReason: null,
  source: 'OpenStreetMap via Overpass API (https://overpass-api.de)',
  places: [],
  selectedElevationM: 652,
  rankingNote: 'Ranked by type then distance.',
  dataStatus: 'LIVE' as const,
  disclaimer: 'Candidate destination — not certified safe.',
}

function placeRecord(overrides: Partial<SafePlaceItem> = {}): SafePlaceItem {
  return {
    key: 'node/1',
    osmType: 'node',
    osmId: 1,
    name: 'Doon Hospital',
    category: 'hospital',
    categoryLabel: 'Hospital',
    priority: 1,
    rank: 1,
    latitude: 30.3299,
    longitude: 78.049,
    distanceM: 900,
    address: 'Rajpur Road, Dehradun',
    elevationM: 700,
    elevationDiffM: 0,
    nearestRiverDistanceM: 250,
    source: 'OpenStreetMap via Overpass API (https://overpass-api.de)',
    rankingReason: 'Emergency service — nearest first',
    disclaimer: null,
    ...overrides,
  }
}

const dehradun: DemoLocation = {
  id: 'dehradun',
  name: 'Dehradun',
  district: 'Dehradun',
  state: 'Uttarakhand',
  latitude: 30.3165,
  longitude: 78.0322,
  elevation: 640,
  status: 'DEMO',
}

const arbitraryRome: DemoLocation = {
  id: 'arbitrary',
  name: 'Searched place',
  district: '',
  state: '',
  latitude: 41.9,
  longitude: 12.48,
  elevation: 0,
  status: 'ARBITRARY',
}

const weather = {
  temperature: 24,
  humidity: 72,
  currentRainfall: 12,
  rainfall1h: 12,
  rainfall3h: 28,
  rainfall6h: 64,
  rainfall24h: 210,
  forecastRainfall: 48,
  precipitationProbability: 70,
  windSpeed: 8,
  windDirection: 'SSE',
  pressure: 1011,
  hourlyRainfall: [2, 4],
}

const availableHistory = (
  nearest: Partial<HistoricalEvent> | null,
  nearby: Partial<HistoricalEvent>[] = [],
): HistoricalContext => ({
  status: 'AVAILABLE',
  statusReason: null,
  source: 'DFO Global Flood Records v0.9.0 (CC0)',
  coverage: { startDate: '1985-01-01', endDate: '2024-01-09', eventCount: 5503, usableEventCount: 5501 },
  searchRadiusM: 50000,
  distanceBasis: 'ANCHOR_VERTEX',
  nearest: nearest ? { fid: 2027, reportNumber: '2027', distanceM: 4000, distanceBasis: 'ANCHOR_VERTEX', latitude: 30.1, longitude: 78.2, beginDate: '2002-08-11', endDate: null, country: 'India', cause: 'Heavy rain', severity: 1, floodImpactIndex: 4.3, ...nearest } : null,
  polygonContainsLocation: true,
  eventsNearby: nearby.map((n, index) => ({
    fid: 1000 + index,
    reportNumber: `${1000 + index}`,
    distanceM: 12000 + index,
    distanceBasis: 'ANCHOR_VERTEX',
    latitude: 30.3 + index * 0.1,
    longitude: 78.5 + index * 0.1,
    beginDate: '1995-07-20',
    endDate: null,
    country: 'India',
    cause: 'Monsoon rain',
    severity: 0.5,
    floodImpactIndex: 3.1,
    ...n,
  })),
  disclaimer: 'Informational only.',
})

function makeCommand(
  overrides: Partial<RiskCommand> = {},
): {
  command: RiskCommand
  historical: HistoricalContext | null
} {
  const historical = overrides.historical === undefined ? availableHistory(null) : overrides.historical
  const command: RiskCommand = {
    id: 'normal' as ScenarioId,
    label: 'Live ML Flood Risk Score',
    probability: 34,
    riskLevel: 'MODERATE',
    action: 'Monitor official updates.',
    warning: 'MODERATE flood risk — ML baseline estimate',
    factors: ['Elevated rainfall'],
    weather,
    location: dehradun,
    terrain: {
      elevation: 640,
      slope: 23.5,
      aspect: 'South-east',
      soilMoisture: 0.5,
      riverDistance: 742,
      drainage: 'Unavailable',
      historical: 'Recorded 2002 event ~4.0 km (2027)',
      exposure: 'Unavailable',
    },
    predictionStatus: 'PREDICTION',
    reason: null,
    missingFeatures: [],
    modelVersion: 'v1.2.0',
    modelStatus: 'Connected — v1.2.0 (READY)',
    contributingFactors: [],
    explanation: 'Baseline estimate.',
    disclaimer: 'Live baseline, advisory only.',
    historical,
    ...overrides,
  }
  return { command, historical }
}

beforeEach(() => {
  mockedUseCommand.mockReset()
  mockedFetchRivers.mockReset()
  mockedFetchRivers.mockResolvedValue({
    locationId: 'dehradun',
    latitude: 30.3165,
    longitude: 78.0322,
    radiusM: 12000,
    status: 'AVAILABLE',
    statusReason: null,
    source: 'HydroRIVERS v1.0',
    segments: [],
    truncated: false,
    dataStatus: 'LIVE',
    disclaimer: 'real segments',
  })
  mockedFetchPlaces.mockReset()
  mockedFetchPlaces.mockResolvedValue(AVAILABLE_EMPTY_PLACES)
})

afterEach(() => {
  cleanup()
})

function mockContext(
  location: DemoLocation = dehradun,
  overrides: Partial<RiskCommand> = {},
) {
  const { command } = makeCommand(overrides)
  const riskOrigin =
    command.predictionStatus === 'PREDICTION' ? 'live' : command.predictionStatus === 'UNAVAILABLE' ? 'unavailable' : 'demo'
  mockedUseCommand.mockReturnValue({ location, command, riskOrigin } as never)
  return { command, riskOrigin }
}

function markerCenters(): string[] {
  return screen.getAllByTestId('circle-marker').map((node) => node.getAttribute('data-center') ?? '')
}

describe('historicalEventsWithCoords — marker selection logic', () => {
  it('merges nearest + eventsNearby, dedupes by fid and sorts by distance', () => {
    const history = availableHistory(
      { fid: 2027, latitude: 30.1, longitude: 78.2, distanceM: 4000 },
      [
        { fid: 888, latitude: 30.9, longitude: 78.9, distanceM: 20000 },
        { fid: 2027, latitude: 30.15, longitude: 78.25, distanceM: 5000 },
      ],
    )
    const events = historicalEventsWithCoords(history)
    expect(events).toHaveLength(2)
    // `nearest` wins over the duplicate fid in eventsNearby; order is by distance.
    expect(events.map((e) => e.fid)).toEqual([2027, 888])
    expect(events[0].distanceM).toBe(4000)
  })

  it('skips events with missing/non-finite coordinates without crashing', () => {
    const history = availableHistory(
      { latitude: null as unknown as number, longitude: null as unknown as number },
      [{ latitude: null as unknown as number, longitude: null as unknown as number }],
    )
    expect(historicalEventsWithCoords(history)).toEqual([])
  })

  it('returns nothing for unavailable or missing history', () => {
    expect(historicalEventsWithCoords(null)).toEqual([])
    expect(
      historicalEventsWithCoords({
        ...availableHistory(null),
        status: 'UNAVAILABLE',
        statusReason: 'INDEX_UNAVAILABLE',
      }),
    ).toEqual([])
  })
})

describe('LiveMapPage — Flood Intelligence Map', () => {
  it('renders the selected location marker with its name and coordinates', () => {
    mockContext(dehradun)
    render(<LiveMapPage />)
    expect(markerCenters()).toContain('30.3165,78.0322')
    expect(screen.getByText('Dehradun')).toBeTruthy()
    expect(screen.getByText('SELECTED LOCATION')).toBeTruthy()
  })

  it('moves the selected marker when the location changes', () => {
    mockContext(dehradun)
    const view = render(<LiveMapPage />)
    expect(markerCenters()).toContain('30.3165,78.0322')
    mockContext(arbitraryRome)
    view.rerender(<LiveMapPage />)
    expect(markerCenters()).toContain('41.9,12.48')
    expect(markerCenters()).not.toContain('30.3165,78.0322')
  })

  it('renders historical flood event markers when coordinates are supplied', () => {
    mockContext(dehradun, {
      historical: availableHistory(
        { latitude: 30.1, longitude: 78.2 },
        [{ fid: 888, latitude: 30.9, longitude: 78.9, distanceM: 20000 }],
      ),
    })
    render(<LiveMapPage />)
    expect(markerCenters()).toContain('30.1,78.2') // nearest
    expect(markerCenters()).toContain('30.9,78.9') // nearby event
    expect(screen.getAllByText('HISTORICAL FLOOD RECORD').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/DFO report #/).length).toBe(2)
  })

  it('renders no historical markers when history is unavailable', () => {
    mockContext(dehradun, {
      historical: {
        ...availableHistory(null),
        status: 'UNAVAILABLE',
        statusReason: 'INDEX_UNAVAILABLE',
      },
    })
    render(<LiveMapPage />)
    expect(markerCenters()).toEqual(['30.3165,78.0322'])
    expect(screen.queryByText('HISTORICAL FLOOD RECORD')).toBeNull()
    expect(
      screen.getByText('Historical flood records unavailable (local index missing)'),
    ).toBeTruthy()
  })

  it('renders no historical markers when history is absent (demo/simulation)', () => {
    mockContext(dehradun, { historical: null, predictionStatus: null })
    render(<LiveMapPage />)
    expect(markerCenters()).toEqual(['30.3165,78.0322'])
    expect(
      screen.getByText('Historical flood records unavailable in demo/simulation mode'),
    ).toBeTruthy()
    expect(screen.getAllByText('DEMO / SIMULATION').length).toBeGreaterThan(0)
  })

  it('does not crash and shows an honest badge when risk is unavailable', () => {
    mockContext(dehradun, {
      probability: null,
      riskLevel: null,
      predictionStatus: 'UNAVAILABLE',
      historical: null,
    })
    render(<LiveMapPage />)
    expect(screen.getByText('RISK · UNAVAILABLE')).toBeTruthy()
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0)
    expect(markerCenters()).toContain('30.3165,78.0322')
  })

  it('does not crash on malformed historical events with missing coordinates', () => {
    mockContext(dehradun, {
      historical: availableHistory(
        { latitude: null as unknown as number, longitude: null as unknown as number },
        [{ latitude: null as unknown as number, longitude: null as unknown as number }],
      ),
    })
    render(<LiveMapPage />)
    expect(markerCenters()).toEqual(['30.3165,78.0322'])
    expect(screen.queryByText(/DFO report #/)).toBeNull()
  })

  it('draws real river segments returned by the API as polylines', async () => {
    mockContext(dehradun)
    mockedFetchRivers.mockResolvedValue({
      locationId: 'dehradun',
      latitude: 30.3165,
      longitude: 78.0322,
      radiusM: 12000,
      status: 'AVAILABLE',
      statusReason: null,
      source: 'HydroRIVERS v1.0',
      segments: [
        [77.9, 30.2, 78.1, 30.2],
        [78.1, 30.2, 78.2, 30.3],
      ],
      truncated: false,
      dataStatus: 'LIVE',
      disclaimer: 'real segments',
    })
    render(<LiveMapPage />)
    const polylines = await screen.findAllByTestId('polyline')
    expect(polylines).toHaveLength(2)
    expect(polylines[0].getAttribute('data-positions')).toBe('[[30.2,77.9],[30.2,78.1]]')
    expect(screen.getByText('Mapped river (real)')).toBeTruthy()
    expect(mockedFetchRivers).toHaveBeenCalledWith(dehradun)
  })

  it('shows an honest note when the river index is unavailable', async () => {
    mockContext(dehradun)
    mockedFetchRivers.mockResolvedValue({
      locationId: 'dehradun',
      latitude: 30.3165,
      longitude: 78.0322,
      radiusM: 12000,
      status: 'UNAVAILABLE',
      statusReason: 'INDEX_UNAVAILABLE',
      source: null,
      segments: [],
      truncated: false,
      dataStatus: 'UNAVAILABLE',
      disclaimer: 'no geometry',
    })
    render(<LiveMapPage />)
    expect(await screen.findByText('River geometry unavailable (local index missing)')).toBeTruthy()
    expect(screen.queryAllByTestId('polyline')).toHaveLength(0)
  })

  it('shows an honest note when the river request fails', async () => {
    mockContext(dehradun)
    mockedFetchRivers.mockRejectedValue(new Error('network down'))
    render(<LiveMapPage />)
    expect(await screen.findByText('River geometry unavailable — request failed')).toBeTruthy()
    expect(screen.queryAllByTestId('polyline')).toHaveLength(0)
  })
})

describe('LiveMapPage — Potential Safe / Emergency Destinations', () => {
  it('draws real candidate destinations returned by the API as emerald markers', async () => {
    mockContext(dehradun)
    mockedFetchPlaces.mockResolvedValue({
      ...AVAILABLE_EMPTY_PLACES,
      places: [
        placeRecord(),
        placeRecord({
          key: 'node/2',
          osmId: 2,
          name: 'City Police Station',
          category: 'police',
          categoryLabel: 'Police station',
          rank: 2,
          latitude: 30.312,
          longitude: 78.04,
          distanceM: 400,
        }),
      ],
    })
    render(<LiveMapPage />)
    expect(await screen.findAllByText('Doon Hospital')).toHaveLength(2) // popup + aside list
    expect(screen.getAllByText('City Police Station').length).toBeGreaterThan(0)
    expect(markerCenters()).toContain('30.3299,78.049')
    expect(markerCenters()).toContain('30.312,78.04')
    expect(mockedFetchPlaces).toHaveBeenCalledWith(dehradun)
    expect(screen.getAllByText('POTENTIAL SAFE / EMERGENCY DESTINATION').length).toBeGreaterThan(0)
    expect(screen.getByText('Potential safe / emergency destination')).toBeTruthy() // legend
    expect(screen.queryAllByTestId('polyline')).toHaveLength(0)
  })

  it('fades to an honest note with no markers when the place provider is unavailable', async () => {
    mockContext(dehradun)
    mockedFetchPlaces.mockResolvedValue({
      ...AVAILABLE_EMPTY_PLACES,
      status: 'UNAVAILABLE',
      statusReason: 'PLACE_PROVIDER_UNAVAILABLE',
      source: null,
      dataStatus: 'UNAVAILABLE',
    })
    render(<LiveMapPage />)
    expect(
      await screen.findByText('Safe places unavailable (OpenStreetMap unreachable — no data shown)'),
    ).toBeTruthy()
    expect(screen.getByText('OpenStreetMap unreachable — no destinations shown')).toBeTruthy()
    expect(markerCenters()).toEqual(['30.3165,78.0322'])
    expect(screen.queryByText('POTENTIAL SAFE / EMERGENCY DESTINATION')).toBeNull()
  })

  it('shows an honest note when the safe-places request fails', async () => {
    mockContext(dehradun)
    mockedFetchPlaces.mockRejectedValue(new Error('network down'))
    render(<LiveMapPage />)
    expect(
      await screen.findByText('Safe places unavailable (request failed — no data shown)'),
    ).toBeTruthy()
    expect(markerCenters()).toEqual(['30.3165,78.0322'])
  })

  it('finds candidate destinations for arbitrary searched locations', async () => {
    mockContext(arbitraryRome)
    mockedFetchPlaces.mockResolvedValue({
      ...AVAILABLE_EMPTY_PLACES,
      locationId: 'arbitrary-41.9-12.48',
      latitude: 41.9,
      longitude: 12.48,
      places: [
        placeRecord({
          key: 'way/7',
          osmType: 'way',
          name: 'Ospedale San Giovanni',
          latitude: 41.91,
          longitude: 12.5,
        }),
      ],
    })
    render(<LiveMapPage />)
    expect(await screen.findAllByText('Ospedale San Giovanni')).toHaveLength(2)
    expect(mockedFetchPlaces).toHaveBeenCalledWith(arbitraryRome)
    expect(markerCenters()).toContain('41.91,12.5')
  })

  it('focuses a candidate on the map when VIEW ON MAP is clicked', async () => {
    mockContext(dehradun)
    mockedFetchPlaces.mockResolvedValue({
      ...AVAILABLE_EMPTY_PLACES,
      places: [placeRecord()],
    })
    render(<LiveMapPage />)
    await screen.findAllByText('Doon Hospital')
    fireEvent.click(screen.getByRole('button', { name: /VIEW ON MAP/ }))
    expect(await screen.findByText('#1 · Doon Hospital')).toBeTruthy() // permanent tooltip on focused marker
  })

  it('renders candidate cards with visible ranks and transparent ranking reasons', async () => {
    mockContext(dehradun)
    mockedFetchPlaces.mockResolvedValue({
      ...AVAILABLE_EMPTY_PLACES,
      places: [
        placeRecord({ key: 'n/3', osmId: 3, category: 'fire_station', categoryLabel: 'Fire station', priority: 1, rank: 1, name: 'City Fire Station', rankingReason: 'Emergency service — nearest first' }),
        placeRecord({ key: 'n/1', osmId: 1, category: 'school', categoryLabel: 'School', priority: 2, rank: 2, name: 'Public School', rankingReason: 'Public building — nearest first' }),
      ],
    })
    render(<LiveMapPage />)
    const liOf = (nodes: HTMLElement[]) =>
      nodes.map((node) => node.closest('li')).find((node): node is HTMLElement => node !== null)
    const fireCard = liOf(await screen.findAllByText('City Fire Station')) as HTMLElement
    const schoolCard = liOf(screen.getAllByText('Public School')) as HTMLElement
    expect(fireCard.querySelector('[data-testid="place-rank-1"]')).toBeTruthy()
    expect(schoolCard.querySelector('[data-testid="place-rank-2"]')).toBeTruthy()
    expect(fireCard.textContent).toContain('Emergency service — nearest first')
    expect(schoolCard.textContent).toContain('Public building — nearest first')
    // cards are displayed in the server-provided ranking order
    expect(fireCard.compareDocumentPosition(schoolCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeGreaterThan(0)
  })
})