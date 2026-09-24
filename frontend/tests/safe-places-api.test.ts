import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mapSafePlaceItem, fetchSafePlaces } from '../src/api/safe-places-api'
import type { SafePlaceRecord, SafePlacesResponse } from '../src/api/safe-places-api'

vi.mock('../src/api/risk-api', () => ({
  request: vi.fn(),
}))

import { request } from '../src/api/risk-api'

const mockedRequest = vi.mocked(request)

const RAW_PLACE: SafePlaceRecord = {
  osm_type: 'node',
  osm_id: 42,
  name: 'Civil Hospital',
  category: 'hospital',
  category_label: 'Hospital',
  priority: 1,
  rank: 1,
  latitude: 30.3299,
  longitude: 78.049,
  distance_m: 900,
  address: 'Rajpur Road, Dehradun',
  elevation_m: 700,
  elevation_diff_m: 0,
  nearest_river_distance_m: 250,
  ranking_reason: 'Emergency service — nearest first',
  source: 'OpenStreetMap via Overpass API (https://overpass-api.de)',
  disclaimer: null,
}

const RAW_RESPONSE: SafePlacesResponse = {
  location_id: 'dehradun',
  latitude: 30.3165,
  longitude: 78.0322,
  radius_m: 5000,
  status: 'AVAILABLE',
  status_reason: null,
  source: 'OpenStreetMap via Overpass API (https://overpass-api.de)',
  n_places: 1,
  selected_elevation_m: 652,
  ranking_note: 'Ranked by type then distance.',
  places: [RAW_PLACE],
  data_status: 'LIVE',
  disclaimer: 'Candidate destination — not certified safe.',
}

beforeEach(() => {
  mockedRequest.mockReset()
})

describe('mapSafePlaceItem', () => {
  it('maps the snake_case backend record to the typed frontend shape', () => {
    const item = mapSafePlaceItem(RAW_PLACE, 'Candidate destination — not certified safe.')
    expect(item).toEqual({
      key: 'node/42',
      osmType: 'node',
      osmId: 42,
      name: 'Civil Hospital',
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
      disclaimer: 'Candidate destination — not certified safe.',
    })
  })

  it('keeps null disclosure fields as null', () => {
    const item = mapSafePlaceItem(
      { ...RAW_PLACE, name: null, address: null, elevation_m: null, nearest_river_distance_m: null },
      null,
    )
    expect(item.name).toBeNull()
    expect(item.address).toBeNull()
    expect(item.elevationM).toBeNull()
    expect(item.nearestRiverDistanceM).toBeNull()
    expect(item.disclaimer).toBeNull()
  })
})

describe('fetchSafePlaces', () => {
  it('requests the real endpoint for a predefined location with a default radius', async () => {
    mockedRequest.mockResolvedValue(RAW_RESPONSE)
    const result = await fetchSafePlaces({
      id: 'dehradun',
      name: 'Dehradun',
      district: 'Dehradun',
      state: 'Uttarakhand',
      latitude: 30.3165,
      longitude: 78.0322,
      elevation: 640,
      status: 'DEMO',
    })
    const url = mockedRequest.mock.calls[0][0] as string
    expect(url).toContain('/safe-places/nearby?')
    expect(url).toContain('location_id=dehradun')
    expect(url).toContain('radius_m=5000')
    expect(url).not.toContain('latitude=')
    expect(result.status).toBe('AVAILABLE')
    expect(result.places[0].name).toBe('Civil Hospital')
    expect(result.dataStatus).toBe('LIVE')
  })

  it('passes explicit coordinates for arbitrary searched locations', async () => {
    mockedRequest.mockResolvedValue({ ...RAW_RESPONSE, location_id: 'arbitrary-41.9-12.48' })
    const result = await fetchSafePlaces(
      { id: 'arbitrary', name: 'Searched place', district: '', state: '', latitude: 41.9, longitude: 12.48, elevation: 0, status: 'ARBITRARY' },
      { radiusM: 8000 },
    )
    const url = mockedRequest.mock.calls[0][0] as string
    expect(url).toContain('latitude=41.9')
    expect(url).toContain('longitude=12.48')
    expect(url).toContain('radius_m=8000')
    expect(result.locationId).toBe('arbitrary-41.9-12.48')
  })

  it('maps an honest UNAVAILABLE provider result without throwing', async () => {
    mockedRequest.mockResolvedValue({
      ...RAW_RESPONSE,
      status: 'UNAVAILABLE',
      status_reason: 'PLACE_PROVIDER_UNAVAILABLE',
      source: null,
      places: [],
      n_places: 0,
      data_status: 'UNAVAILABLE',
    })
    const result = await fetchSafePlaces({
      id: 'dehradun',
      name: 'Dehradun',
      district: 'Dehradun',
      state: 'Uttarakhand',
      latitude: 30.3165,
      longitude: 78.0322,
      elevation: 640,
      status: 'DEMO',
    })
    expect(result.status).toBe('UNAVAILABLE')
    expect(result.statusReason).toBe('PLACE_PROVIDER_UNAVAILABLE')
    expect(result.places).toEqual([])
  })

  it('forwards an AbortSignal to the request client', async () => {
    mockedRequest.mockResolvedValue(RAW_RESPONSE)
    const controller = new AbortController()
    await fetchSafePlaces(
      { id: 'dehradun', name: 'Dehradun', district: 'Dehradun', state: 'Uttarakhand', latitude: 30.3165, longitude: 78.0322, elevation: 640, status: 'DEMO' },
      { signal: controller.signal },
    )
    expect(mockedRequest.mock.calls[0][1]).toEqual({ signal: controller.signal })
  })
})