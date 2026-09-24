import type { RiverSegment } from '../../api/rivers-api'
import type { SafePlaceItem } from '../../api/safe-places-api'
import type { HistoricalContext, HistoricalEvent } from '../../types/risk'

/** Layer controls for the live map — every toggle is backed by real data. */
export interface FloodIntelligenceLayerState {
  /** Selected-location marker. */
  selected: boolean
  /** HISTORICAL FLOOD RECORDS (DFO catalogue events near the location). */
  historical: boolean
  /** Potential safe / emergency destinations (OpenStreetMap, candidate only). */
  places: boolean
  /** Mapped rivers from the real HydroRIVERS v1.0 index. */
  rivers: boolean
  /** Terrain basemap (OpenTopoMap) instead of the plain OpenStreetMap layer. */
  terrain: boolean
}

export const DEFAULT_LAYER_STATE: FloodIntelligenceLayerState = {
  selected: true,
  historical: true,
  places: true,
  rivers: true,
  terrain: false,
}

/** State of the real river-geometry layer (never fabricated geometry). */
export interface RiverLayerState {
  status: 'LOADING' | 'AVAILABLE' | 'UNAVAILABLE' | 'ERROR'
  segments: RiverSegment[]
  truncated: boolean
  disclaimer: string | null
}

export const EMPTY_RIVER_LAYER: RiverLayerState = {
  status: 'LOADING',
  segments: [],
  truncated: false,
  disclaimer: null,
}

/** State of the potential-safe-place layer (real OpenStreetMap candidates). */
export interface PlaceLayerState {
  status: 'LOADING' | 'AVAILABLE' | 'UNAVAILABLE' | 'ERROR'
  places: SafePlaceItem[]
  disclaimer: string | null
}

export const EMPTY_PLACE_LAYER: PlaceLayerState = {
  status: 'LOADING',
  places: [],
  disclaimer: null,
}

/**
 * Returns the candidate destinations that can actually be drawn on a map.
 *
 * Only places with finite coordinates are included (malformed candidates are
 * skipped, never crash); results keep the backend ranking order.
 */
export function validSafePlaceItems(places: PlaceLayerState): SafePlaceItem[] {
  if (places.status !== 'AVAILABLE') return []
  return places.places.filter(
    (place) => Number.isFinite(place.latitude) && Number.isFinite(place.longitude),
  )
}

/**
 * Returns the recorded DFO events that can actually be drawn on a map.
 *
 * Only events with finite anchor coordinates are included (malformed/missing
 * coordinates are skipped, never crash). `nearest` + `eventsNearby` are merged,
 * deduplicated by fid, and sorted by distance, deterministic for the UI.
 */
export function historicalEventsWithCoords(
  historical: HistoricalContext | null,
): HistoricalEvent[] {
  if (!historical || historical.status !== 'AVAILABLE') return []
  const candidates = [historical.nearest, ...(historical.eventsNearby ?? [])]
  const seen = new Set<number>()
  const valid: HistoricalEvent[] = []
  for (const event of candidates) {
    if (!event) continue
    if (typeof event.fid !== 'number') continue
    if (!Number.isFinite(event.latitude) || !Number.isFinite(event.longitude)) continue
    if (seen.has(event.fid)) continue
    seen.add(event.fid)
    valid.push(event)
  }
  return valid.sort((a, b) => a.distanceM - b.distanceM)
}