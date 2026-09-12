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
}

const OPEN_METEO_GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

async function searchOpenMeteo(query: string): Promise<PlaceSearchResult[] | null> {
  const params = new URLSearchParams({
    name: query,
    count: '5',
    language: 'en',
    format: 'json',
  })
  let response: Response
  try {
    response = await fetch(`${OPEN_METEO_GEOCODING_URL}?${params}`)
  } catch {
    return null
  }
  if (!response.ok) return null
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

async function searchNominatim(query: string): Promise<PlaceSearchResult[] | null> {
  const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: '5' })
  let response: Response
  try {
    response = await fetch(`${NOMINATIM_URL}?${params}`)
  } catch {
    return null
  }
  if (!response.ok) return null
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
      const parts = (item.display_name ?? item.name ?? '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
      const name = item.name?.trim() || parts[0] || 'Unnamed place'
      return {
        name,
        latitude: Number(item.lat),
        longitude: Number(item.lon),
        district: parts[1] ?? '',
        state: parts.slice(2, 4).join(', '),
        source: 'nominatim' as const,
      }
    })
}

/** Searches real-world places by name: Open-Meteo Geocoding first, Nominatim fallback. */
export async function searchPlaces(query: string): Promise<PlaceSearchResult[]> {
  const openMeteo = await searchOpenMeteo(query)
  if (openMeteo && openMeteo.length > 0) return openMeteo
  const nominatim = await searchNominatim(query)
  if (nominatim) return nominatim
  return []
}