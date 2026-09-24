import { request } from './risk-api'
import type { DemoLocation } from '../types/location'

/** A candidate emergency/public destination from GET /api/v1/safe-places/nearby. */
export interface SafePlaceItem {
  /** Stable key: `osmType/osmId`. */
  key: string
  osmType: 'node' | 'way' | 'relation'
  osmId: number
  name: string | null
  category: string
  categoryLabel: string
  /** 1 = emergency service, 2 = public building (transparent ranking input). */
  priority: number
  /** 1-based position in the returned ranking. */
  rank: number
  latitude: number
  longitude: number
  distanceM: number
  address: string | null
  elevationM: number | null
  elevationDiffM: number | null
  nearestRiverDistanceM: number | null
  source: string
  rankingReason: string
  disclaimer: string | null
}

/** Real candidate destinations near a location — honest status semantics. */
export interface SafePlacesResult {
  locationId: string
  latitude: number | null
  longitude: number | null
  radiusM: number
  /** AVAILABLE — real OpenStreetMap places; UNAVAILABLE — provider unreachable. */
  status: 'AVAILABLE' | 'UNAVAILABLE'
  statusReason: 'PLACE_PROVIDER_UNAVAILABLE' | null
  source: string | null
  places: SafePlaceItem[]
  selectedElevationM: number | null
  rankingNote: string | null
  dataStatus: 'LIVE' | 'UNAVAILABLE'
  disclaimer: string | null
}

/** Raw backend snake_case place record. */
export interface SafePlaceRecord {
  osm_type: 'node' | 'way' | 'relation'
  osm_id: number
  name: string | null
  category: string
  category_label: string
  priority: number
  rank: number
  latitude: number
  longitude: number
  distance_m: number
  address: string | null
  elevation_m: number | null
  elevation_diff_m: number | null
  nearest_river_distance_m: number | null
  ranking_reason: string
  source: string
  disclaimer?: string | null
}

/** Raw backend snake_case response for GET /api/v1/safe-places/nearby. */
export interface SafePlacesResponse {
  location_id: string
  latitude: number | null
  longitude: number | null
  radius_m: number
  status: 'AVAILABLE' | 'UNAVAILABLE'
  status_reason: 'PLACE_PROVIDER_UNAVAILABLE' | null
  source: string | null
  n_places: number
  selected_elevation_m: number | null
  ranking_note: string | null
  places: SafePlaceRecord[]
  data_status: 'LIVE' | 'UNAVAILABLE'
  disclaimer: string | null
}

const DEFAULT_RADIUS_M = 5_000

/** Maps a raw backend safe-place record into the typed SafePlaceItem shape. */
export function mapSafePlaceItem(record: SafePlaceRecord, disclaimer: string | null): SafePlaceItem {
  return {
    key: `${record.osm_type}/${record.osm_id}`,
    osmType: record.osm_type,
    osmId: record.osm_id,
    name: record.name,
    category: record.category,
    categoryLabel: record.category_label,
    priority: record.priority,
    rank: record.rank,
    latitude: record.latitude,
    longitude: record.longitude,
    distanceM: record.distance_m,
    address: record.address,
    elevationM: record.elevation_m,
    elevationDiffM: record.elevation_diff_m,
    nearestRiverDistanceM: record.nearest_river_distance_m,
    source: record.source,
    rankingReason: record.ranking_reason,
    disclaimer,
  }
}

/**
 * Fetches the real candidate emergency destinations (OpenStreetMap via the
 * Overpass API) within a radius of the selected location. An honest UNAVAILABLE
 * result (provider unreachable — no fabricated places) is a status, not an
 * exception.
 */
export async function fetchSafePlaces(
  location: DemoLocation,
  options?: { radiusM?: number; signal?: AbortSignal },
): Promise<SafePlacesResult> {
  const radiusM = options?.radiusM ?? DEFAULT_RADIUS_M
  const params = new URLSearchParams({
    location_id: location.id,
    radius_m: String(radiusM),
  })
  if (location.status === 'ARBITRARY') {
    params.set('latitude', String(location.latitude))
    params.set('longitude', String(location.longitude))
  }
  const data = await request<SafePlacesResponse>(
    `/safe-places/nearby?${params.toString()}`,
    { signal: options?.signal },
  )
  return {
    locationId: data.location_id,
    latitude: data.latitude,
    longitude: data.longitude,
    radiusM: data.radius_m,
    status: data.status,
    statusReason: data.status_reason,
    source: data.source,
    places: data.places.map((place) => mapSafePlaceItem(place, data.disclaimer)),
    selectedElevationM: data.selected_elevation_m,
    rankingNote: data.ranking_note,
    dataStatus: data.data_status,
    disclaimer: data.disclaimer,
  }
}