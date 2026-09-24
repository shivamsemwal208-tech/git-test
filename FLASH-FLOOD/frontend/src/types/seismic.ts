export interface SecondaryHazard { name: string; status: string }

export type SeismicStatus =
  | 'MONITORING'
  | 'NO RECENT EVENT'
  | 'DATA UNAVAILABLE'
  | 'DEMO ALERT'

export interface SeismicEvent {
  id: string | null
  magnitude: number | null
  depthKm: number | null
  distanceKm: number | null
  time: string
  latitude: number | null
  longitude: number | null
  status: SeismicStatus
  note: string
  dataStatus?: string
  secondaryHazards?: SecondaryHazard[]
}