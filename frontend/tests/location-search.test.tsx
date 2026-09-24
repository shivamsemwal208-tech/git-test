import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocationSearch } from '../src/components/navigation/location-search'
import { searchPlaces, type PlaceSearchResult } from '../src/api/geocoding'
import { CommandProvider, useCommand } from '../src/features/command-center/command-context'
import { demoLocations } from '../src/data/demo-locations'

vi.mock('../src/api/geocoding', () => ({
  searchPlaces: vi.fn(),
  GEOCODING_ATTRIBUTION: 'Geocoding: Open-Meteo · Nominatim · © OpenStreetMap contributors',
  GeocodingUnavailableError: class GeocodingUnavailableError extends Error {},
}))

vi.mock('../src/api/risk-api', () => ({
  getLocations: vi.fn().mockRejectedValue(new Error('network down')),
  postRiskAssessment: vi.fn().mockRejectedValue(new Error('network down')),
  getSafePlaces: vi.fn().mockRejectedValue(new Error('network down')),
  getAlerts: vi.fn().mockRejectedValue(new Error('network down')),
  getLatestSeismic: vi.fn().mockRejectedValue(new Error('network down')),
  getWeatherCurrent: vi.fn().mockRejectedValue(new Error('network down')),
  getWeatherForecast: vi.fn().mockRejectedValue(new Error('network down')),
  mapLiveWeatherCurrent: vi.fn(),
  mapLiveWeatherForecast: vi.fn(),
  mapRiskAssessment: vi.fn(),
  riskOrigin: vi.fn(() => 'api'),
}))

const rajawala: PlaceSearchResult = {
  name: 'Rajawala',
  latitude: 30.1913308,
  longitude: 78.211649,
  district: 'Dehradun',
  state: 'Uttarakhand',
  source: 'nominatim',
}

const rishikesh: PlaceSearchResult = {
  name: 'Rishikesh',
  latitude: 30.0869,
  longitude: 78.2676,
  district: 'Dehradun',
  state: 'Uttarakhand',
  source: 'open-meteo',
}

function SelectedLocationProbe() {
  const { location } = useCommand()
  return (
    <p data-testid="selected-location">
      {location.name}|{location.latitude}|{location.longitude}|{location.status}|
      {location.district}|{location.state}
    </p>
  )
}

function renderSearch() {
  return render(
    <CommandProvider>
      <LocationSearch />
      <SelectedLocationProbe />
    </CommandProvider>,
  )
}

function getSearchInput() {
  return screen.getByLabelText('Search location')
}

function queryPlace(name: string) {
  fireEvent.change(getSearchInput(), { target: { value: name } })
}

describe('LocationSearch — real place search', () => {
  beforeEach(() => {
    vi.mocked(searchPlaces).mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows a single geocoded result with place details', async () => {
    vi.mocked(searchPlaces).mockResolvedValue([rajawala])
    renderSearch()

    queryPlace('Rajawala')

    const result = await screen.findByRole('button', { name: /Rajawala/i })
    expect(result.textContent).toContain('Dehradun')
    expect(result.textContent).toContain('Uttarakhand')
    expect(
      screen.getByText(/OpenStreetMap contributors/i),
    ).toBeInTheDocument()
  })

  it('shows multiple results when the provider returns several', async () => {
    vi.mocked(searchPlaces).mockResolvedValue([rajawala, rishikesh])
    renderSearch()

    queryPlace('Rajawala')

    const rajawalaButton = await screen.findByRole('button', { name: /Rajawala/i })
    const rishikeshButton = screen.getByRole('button', { name: /Rishikesh/i })
    expect(rajawalaButton).toBeInTheDocument()
    expect(rishikeshButton).toBeInTheDocument()
  })

  it('shows an empty-result state when no provider finds anything', async () => {
    vi.mocked(searchPlaces).mockResolvedValue([])
    renderSearch()

    queryPlace('no-such-village-xyz')

    expect(await screen.findByText('No places found.')).toBeInTheDocument()
  })

  it('shows a distinct error state when the providers are unreachable', async () => {
    vi.mocked(searchPlaces).mockRejectedValue(new Error('network down'))
    renderSearch()

    queryPlace('Rajawala')

    expect(
      await screen.findByText(/Place search unavailable/i),
    ).toBeInTheDocument()
  })

  it('selecting a result updates the selected coordinates and location', async () => {
    vi.mocked(searchPlaces).mockResolvedValue([rajawala])
    renderSearch()

    queryPlace('Rajawala')

    const result = await screen.findByRole('button', { name: /Rajawala/i })
    fireEvent.click(result)

    await waitFor(() => {
      expect(screen.getByTestId('selected-location').textContent).toBe(
        'Rajawala|30.1913308|78.211649|ARBITRARY|Dehradun|Uttarakhand',
      )
    })
  })

  it('clears the pending search when the query is emptied', async () => {
    vi.mocked(searchPlaces).mockResolvedValue([rajawala])
    renderSearch()

    queryPlace('Rajawala')
    expect(await screen.findByRole('button', { name: /Rajawala/i })).toBeInTheDocument()

    fireEvent.change(getSearchInput(), { target: { value: '' } })

    expect(screen.queryByRole('button', { name: /Rajawala/i })).not.toBeInTheDocument()
  })

  it('keeps built-in demo locations reachable alongside global search', async () => {
    vi.mocked(searchPlaces).mockResolvedValue([])
    renderSearch()

    const firstDemo = demoLocations[0]
    queryPlace(firstDemo.name)

    await waitFor(() => {
      expect(screen.getByText(firstDemo.name)).toBeInTheDocument()
    })
  })
})