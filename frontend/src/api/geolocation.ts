export interface CurrentPosition {
  latitude: number
  longitude: number
  accuracy: number
}

export type GeolocationErrorKind =
  | 'unsupported'
  | 'permission-denied'
  | 'position-unavailable'
  | 'timeout'
  | 'invalid'

/** Raised when the browser cannot produce a usable position fix. */
export class GeolocationUnavailableError extends Error {
  readonly kind: GeolocationErrorKind
  constructor(kind: GeolocationErrorKind, message: string) {
    super(message)
    this.name = 'GeolocationUnavailableError'
    this.kind = kind
  }
}

/** Hard ceiling for a position fix; a hung browser watch resolves to a timeout. */
export const GEOLOCATION_FIX_TIMEOUT_MS = 12000

function hasGeolocationSupport(): boolean {
  if (typeof navigator === 'undefined') return false
  const geo = (navigator as { geolocation?: Geolocation | undefined }).geolocation
  return typeof geo?.getCurrentPosition === 'function'
}

function validate(position: { latitude: number; longitude: number }): boolean {
  return (
    Number.isFinite(position.latitude) &&
    Number.isFinite(position.longitude) &&
    position.latitude >= -90 &&
    position.latitude <= 90 &&
    position.longitude >= -180 &&
    position.longitude <= 180
  )
}

/**
 * Resolves the browser's current position via the standard Geolocation API.
 *
 * Rejects with {@link GeolocationUnavailableError} and a distinct `kind` so the
 * UI can show an honest, per-case message. It NEVER falls back to a hardcoded
 * location: if the browser reports no usable fix (unsupported, permission
 * denied, position unavailable, timeout, or invalid coordinates), the caller
 * must surface that state instead of inventing coordinates.
 */
export async function getCurrentPosition(): Promise<CurrentPosition> {
  if (!hasGeolocationSupport()) {
    throw new GeolocationUnavailableError(
      'unsupported',
      'This browser does not support geolocation.',
    )
  }
  return new Promise<CurrentPosition>((resolve, reject) => {
    let settled = false
    let watchdog: ReturnType<typeof setTimeout> | null = null

    function fail(kind: GeolocationErrorKind, message: string) {
      if (settled) return
      settled = true
      if (watchdog) clearTimeout(watchdog)
      reject(new GeolocationUnavailableError(kind, message))
    }

    function succeed(position: GeolocationPosition) {
      if (settled) return
      settled = true
      if (watchdog) clearTimeout(watchdog)
      const coords = position.coords
      if (!validate({ latitude: coords.latitude, longitude: coords.longitude })) {
        reject(
          new GeolocationUnavailableError(
            'invalid',
            'The browser reported invalid coordinates; no location was set.',
          ),
        )
        return
      }
      resolve({
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: Number.isFinite(coords.accuracy) ? coords.accuracy : 0,
      })
    }

    watchdog = setTimeout(() => fail('timeout', 'Timed out waiting for a position fix.'), GEOLOCATION_FIX_TIMEOUT_MS)

    navigator.geolocation.getCurrentPosition(
      succeed,
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            fail(
              'permission-denied',
              'Location permission was denied. Search a place or enter coordinates instead.',
            )
            break
          case error.POSITION_UNAVAILABLE:
            fail(
              'position-unavailable',
              'Your position is currently unavailable. Search a place or enter coordinates instead.',
            )
            break
          case error.TIMEOUT:
            fail('timeout', 'Timed out waiting for a position fix.')
            break
          default:
            fail(
              'position-unavailable',
              'Could not determine your position. Search a place or enter coordinates instead.',
            )
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  })
}
