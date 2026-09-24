export interface PlaceSearchResult {
  name: string
  latitude: number
  longitude: number
  district: string
  state: string
  source: 'open-meteo' | 'nominatim'
}

interface OpenMeteoGeocodingResult {
  name: string
  latitude: number
  longitude: number
  country?: string | null
  admin1?: string | null
  admin2?: string | null
  admin3?: string | null
}

interface OpenMeteoGeocodingResponse {
  results?: OpenMeteoGeocodingResult[]
}

interface NominatimItem {
  name?: string | null
  display_name?: string
  lat?: string
  lon?: string
  address?: {
    village?: string | null
    town?: string | null
    city?: string | null
    county?: string | null
    district?: string | null
    city_district?: string | null
    state?: string | null
    country?: string | null
  } | null
}

/** Best available human-readable component; falls back to the next usable part. */
function firstLabel(...values: Array<string | null | undefined>): string {
  return values.find((value) => value?.trim())?.trim() ?? ''
}

const OPEN_METEO_GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

/** Hard timeout for each provider call; failure surfaces as a cancellation-abort. */
const GEO_REQUEST_TIMEOUT_MS = 8000

/**
 * OpenStreetMap (Nominatim) data is licensed ODbL; the UI shows this line
 * whenever geographic search results are presented.
 */
export const GEOCODING_ATTRIBUTION =
  'Geocoding: Open-Meteo · Nominatim · © OpenStreetMap contributors'

/** Raised when no provider can be reached (network/HTTP failure, incl. timeout). */
export class GeocodingUnavailableError extends Error {
  constructor(message = 'Place search is temporarily unavailable.') {
    super(message)
    this.name = 'GeocodingUnavailableError'
  }
}

async function geocodeFetch(
  url: string,
  params: URLSearchParams,
): Promise<Response | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GEO_REQUEST_TIMEOUT_MS)
  try {
    return await fetch(`${url}?${params}`, { signal: controller.signal })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Returns results, or `null` when the provider itself could not be reached. */
async function searchOpenMeteo(query: string): Promise<PlaceSearchResult[] | null> {
  const params = new URLSearchParams({
    name: query,
    count: '5',
    language: 'en',
    format: 'json',
  })
  const response = await geocodeFetch(OPEN_METEO_GEOCODING_URL, params)
  if (!response || !response.ok) return null
  const data = (await response.json()) as OpenMeteoGeocodingResponse
  return (data.results ?? [])
    .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
    .map((item) => ({
      name: item.name,
      latitude: item.latitude,
      longitude: item.longitude,
      district: item.admin2 ?? item.admin3 ?? '',
      state: item.admin1 ?? item.country ?? '',
      source: 'open-meteo' as const,
    }))
}

/** Returns results, or `null` when the provider itself could not be reached. */
async function searchNominatim(query: string): Promise<PlaceSearchResult[] | null> {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '5',
    addressdetails: '1',
  })
  const response = await geocodeFetch(NOMINATIM_URL, params)
  if (!response || !response.ok) return null
  const items = (await response.json()) as NominatimItem[]
  return items
    .filter(
      (item) =>
        item.lat !== undefined &&
        item.lon !== undefined &&
        Number.isFinite(Number(item.lat)) &&
        Number.isFinite(Number(item.lon)),
    )
    .map((item) => {
      const address = item.address ?? {}
      const locality =
        firstLabel(address.village, address.town, address.city, address.city_district) ||
        firstLabel(address.county, address.district)
      const state = firstLabel(address.state, address.country)
      const parts = (item.display_name ?? item.name ?? '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
      const name = item.name?.trim() || parts[0] || 'Unnamed place'
      return {
        name,
        latitude: Number(item.lat),
        longitude: Number(item.lon),
        district: locality,
        state,
        source: 'nominatim' as const,
      }
    })
}

/**
 * Searches real-world places by name: Open-Meteo Geocoding first, Nominatim
 * fallback. Returns an empty list when providers respond with no matches (never
 * a fabricated/hardcoded location). Throws {@link GeocodingUnavailableError}
 * when every provider is unreachable (network or HTTP failure, incl. timeout)
 * so the UI can show a distinct error state instead of a silent empty box.
 */
export async function searchPlaces(query: string): Promise<PlaceSearchResult[]> {
  const openMeteo = await searchOpenMeteo(query)
  if (openMeteo && openMeteo.length > 0) return openMeteo
  const nominatim = await searchNominatim(query)
  if (nominatim && nominatim.length > 0) return nominatim
  if (openMeteo === null && nominatim === null) {
    throw new GeocodingUnavailableError()
  }
  return []
}

const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse'

/**
 * Best-effort reverse geocoding of a browser-supplied coordinate back to a
 * place name. Returns `null` — never a fabricated label — when the provider is
 * unreachable, responds with an error, or cannot resolve the point. Callers
 * must preserve the real coordinates and fall back to an honest label such as
 * "Current location" instead of inventing a place name.
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<PlaceSearchResult | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: 'jsonv2',
    addressdetails: '1',
  })
  const response = await geocodeFetch(NOMINATIM_REVERSE_URL, params)
  if (!response || !response.ok) return null
  const item = (await response.json()) as NominatimItem
  if (
    item.lat === undefined ||
    item.lon === undefined ||
    !Number.isFinite(Number(item.lat)) ||
    !Number.isFinite(Number(item.lon))
  ) {
    return null
  }
  const address = item.address ?? {}
  const locality =
    firstLabel(
      address.village,
      address.town,
      address.city,
      address.city_district,
      address.county,
      address.district,
    ) || firstLabel(address.state)
  return {
    name:
      firstLabel(locality) ||
      firstLabel(item.name) ||
      item.display_name?.split(',')[0]?.trim() ||
      'Current location',
    latitude: Number(item.lat),
    longitude: Number(item.lon),
    district: firstLabel(
      address.village,
      address.town,
      address.city,
      address.city_district,
      address.county,
      address.district,
    ),
    state: firstLabel(address.state, address.country),
    source: 'nominatim',
  }
}