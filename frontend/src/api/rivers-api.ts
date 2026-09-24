import { request } from './risk-api'
import type { DemoLocation } from '../types/location'

export type RiverSegment = [number, number, number, number]

/** Real mapped river geometry near a location from GET /api/v1/rivers/nearby. */
export interface RiverSegmentsResult {
  locationId: string
  latitude: number | null
  longitude: number | null
  radiusM: number
  /** AVAILABLE — real HydroRIVERS segments returned; UNAVAILABLE — index missing. */
  status: 'AVAILABLE' | 'UNAVAILABLE'
  statusReason: 'INDEX_UNAVAILABLE' | null
  source: string | null
  segments: RiverSegment[]
  /** True when the response was capped at `maxSegments` (an honest partial set). */
  truncated: boolean
  dataStatus: 'LIVE' | 'UNAVAILABLE'
  disclaimer: string | null
}

/** Raw backend snake_case response for GET /api/v1/rivers/nearby. */
interface RiverSegmentsResponse {
  location_id: string
  latitude: number | null
  longitude: number | null
  radius_m: number
  status: 'AVAILABLE' | 'UNAVAILABLE'
  status_reason: 'INDEX_UNAVAILABLE' | null
  source: string | null
  n_segments: number
  truncated: boolean
  segments: RiverSegment[]
  data_status: 'LIVE' | 'UNAVAILABLE'
  disclaimer: string | null
}

const DEFAULT_RADIUS_M = 12_000
const DEFAULT_MAX_SEGMENTS = 1500

/**
 * Fetches the real mapped river segments (HydroRIVERS v1.0) within a radius of
 * the selected location. Segments are returned as `[x0, y0, x1, y1]` in
 * decimal degrees (WGS84). An honest UNAVAILABLE result (no fabricated
 * geometry) is returned as a status, not thrown.
 */
export async function fetchNearbyRiverSegments(
  location: DemoLocation,
  options?: { radiusM?: number; maxSegments?: number; signal?: AbortSignal },
): Promise<RiverSegmentsResult> {
  const radiusM = options?.radiusM ?? DEFAULT_RADIUS_M
  const maxSegments = options?.maxSegments ?? DEFAULT_MAX_SEGMENTS
  const params = new URLSearchParams({
    location_id: location.id,
    radius_m: String(radiusM),
    max_segments: String(maxSegments),
  })
  if (location.status === 'ARBITRARY') {
    params.set('latitude', String(location.latitude))
    params.set('longitude', String(location.longitude))
  }
  const data = await request<RiverSegmentsResponse>(
    `/rivers/nearby?${params.toString()}`,
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
    segments: data.segments,
    truncated: data.truncated,
    dataStatus: data.data_status,
    disclaimer: data.disclaimer,
  }
}