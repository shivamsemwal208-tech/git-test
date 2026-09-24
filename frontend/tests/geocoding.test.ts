import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GeocodingUnavailableError,
  searchPlaces,
} from '../src/api/geocoding'

/** Builds a minimal fetch Response with the given JSON body. */
function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
  } as Response
}

/** Routes mock fetch by URL so Open-Meteo and Nominatim respond independently. */
function mockFetchRouter(routes: {
  openMeteo: () => Response | Promise<Response>
  nominatim: () => Response | Promise<Response>
}) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('geocoding-api.open-meteo.com')) return routes.openMeteo()
    if (url.includes('nominatim.openstreetmap.org')) return routes.nominatim()
    return Promise.reject(new Error(`unexpected geocoding host: ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const openMeteoResult = {
  name: 'Dehradun',
  latitude: 30.3165,
  longitude: 78.0322,
  country: 'India',
  admin1: 'Uttarakhand',
  admin2: 'Dehradun',
  admin3: '',
}

const wildcardOpenMeteoResult = {
  name: 'Not-a-number',
  latitude: Number.NaN,
  longitude: 78.0322,
  country: 'India',
}

describe('searchPlaces', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns Open-Meteo results with place details for a valid query', async () => {
    mockFetchRouter({
      openMeteo: () =>
        jsonResponse({
          results: [
            openMeteoResult,
            { ...openMeteoResult, name: 'Rishikesh', latitude: 30.0869, longitude: 78.2676 },
          ],
        }),
      nominatim: () => Promise.reject(new Error('should not be called')),
    })

    const results = await searchPlaces('Dehradun')

    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({
      name: 'Dehradun',
      latitude: 30.3165,
      longitude: 78.0322,
      district: 'Dehradun',
      state: 'Uttarakhand',
      source: 'open-meteo',
    })
  })

  it('filters out malformed results that lack finite coordinates', async () => {
    mockFetchRouter({
      openMeteo: () =>
        jsonResponse({ results: [wildcardOpenMeteoResult, openMeteoResult] }),
      nominatim: () => Promise.reject(new Error('should not be called')),
    })

    const results = await searchPlaces('Dehradun')

    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('Dehradun')
  })

  it('returns multiple Open-Meteo matches without hitting Nominatim', async () => {
    const fetchMock = mockFetchRouter({
      openMeteo: () =>
        jsonResponse({ results: [openMeteoResult, openMeteoResult, openMeteoResult] }),
      nominatim: () => Promise.reject(new Error('should fall back')),
    })

    const results = await searchPlaces('Dehradun')

    expect(results).toHaveLength(3)
    expect(results.every((place) => place.source === 'open-meteo')).toBe(true)
    const nominatimCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('nominatim.openstreetmap.org'),
    )
    expect(nominatimCalls).toHaveLength(0)
  })

  it('falls back to Nominatim when Open-Meteo returns no matches', async () => {
    mockFetchRouter({
      openMeteo: () => jsonResponse({ results: [] }),
      nominatim: () =>
        jsonResponse([
          {
            name: 'Rajawala',
            display_name: 'Rajawala, Dehradun, Uttarakhand, India',
            lat: '30.1913308',
            lon: '78.211649',
            address: { county: 'Dehradun', state: 'Uttarakhand', country: 'India' },
          },
        ]),
    })

    const results = await searchPlaces('Rajawala')

    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      name: 'Rajawala',
      latitude: 30.1913308,
      longitude: 78.211649,
      district: 'Dehradun',
      state: 'Uttarakhand',
      source: 'nominatim',
    })
  })

  it('returns an empty array when providers answer with no matches', async () => {
    mockFetchRouter({
      openMeteo: () => jsonResponse({ results: [] }),
      nominatim: () => jsonResponse([]),
    })

    const results = await searchPlaces('zzzz-not-a-place')

    expect(results).toEqual([])
  })

  it('throws GeocodingUnavailableError when both providers are unreachable', async () => {
    mockFetchRouter({
      openMeteo: () => Promise.reject(new TypeError('network down')),
      nominatim: () => Promise.reject(new TypeError('network down')),
    })

    await expect(searchPlaces('Dehradun')).rejects.toBeInstanceOf(
      GeocodingUnavailableError,
    )
  })

  it('throws GeocodingUnavailableError when both providers return non-OK', async () => {
    mockFetchRouter({
      openMeteo: () => jsonResponse({ error: 'rate limited' }, false),
      nominatim: () => jsonResponse({ error: 'rate limited' }, false),
    })

    await expect(searchPlaces('Dehradun')).rejects.toBeInstanceOf(
      GeocodingUnavailableError,
    )
  })

  it('treats a timed-out first provider as unreachable but still tries the fallback', async () => {
    let openMeteoAborted = false
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('geocoding-api.open-meteo.com')) {
        openMeteoAborted = true
        return Promise.reject(new DOMException('aborted', 'AbortError'))
      }
      if (url.includes('nominatim.openstreetmap.org')) {
        return jsonResponse([
          {
            name: 'Nainital',
            display_name: 'Nainital, Uttarakhand, India',
            lat: '29.3919',
            lon: '79.4542',
            address: { state: 'Uttarakhand' },
          },
        ])
      }
      return Promise.reject(new Error(`unexpected geocoding host: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    const results = await searchPlaces('Nainital')

    expect(openMeteoAborted).toBe(true)
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      name: 'Nainital',
      latitude: 29.3919,
      longitude: 79.4542,
      district: '',
      state: 'Uttarakhand',
      source: 'nominatim',
    })
  })
})