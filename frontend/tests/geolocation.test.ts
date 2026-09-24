import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  GEOLOCATION_FIX_TIMEOUT_MS,
  getCurrentPosition,
  GeolocationUnavailableError,
} from '../src/api/geolocation'

type Coords = { latitude: number; longitude: number; accuracy: number }
type PositionLike = { coords: Coords; timestamp: number }
type PositionOptionsLike = {
  enableHighAccuracy?: boolean
  timeout?: number
  maximumAge?: number
}
type GeoErrorLike = {
  code: number
  message: string
  PERMISSION_DENIED?: 1
  POSITION_UNAVAILABLE?: 2
  TIMEOUT?: 3
}

function browserError(code: number, message: string): GeoErrorLike {
  const base: GeoErrorLike = { code, message }
  if (code === 1) base.PERMISSION_DENIED = 1
  if (code === 2) base.POSITION_UNAVAILABLE = 2
  if (code === 3) base.TIMEOUT = 3
  return base
}

function installStub() {
  let success: ((position: PositionLike) => void) | undefined
  let failure: ((error: GeoErrorLike) => void) | undefined
  let lastOptions: PositionOptionsLike | undefined
  const navigatorStub = {
    getCurrentPosition: vi.fn(
      (
        onSuccess: (position: PositionLike) => void,
        onFailure: (error: GeoErrorLike) => void,
        options?: PositionOptionsLike,
      ) => {
        success = onSuccess
        failure = onFailure
        lastOptions = options
      },
    ),
  }
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    writable: true,
    value: navigatorStub,
  })
  return {
    succeed(coords: Coords) {
      success?.({ coords, timestamp: Date.now() })
    },
    fail(code: number, message: string) {
      failure?.(browserError(code, message))
    },
    options: () => lastOptions,
    calls() {
      return navigatorStub.getCurrentPosition.mock.calls
    },
  }
}

function stubWithNoApi() {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    writable: true,
    value: undefined,
  })
}

function restoreRealNavigatorGeolocation() {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    writable: true,
    value: undefined,
  })
}

afterEach(() => {
  restoreRealNavigatorGeolocation()
  vi.useRealTimers()
})

describe('getCurrentPosition', () => {
  it('resolves with the REAL coordinates the browser reported', async () => {
    const stub = installStub()
    const promise = getCurrentPosition()
    stub.succeed({ latitude: 29.456, longitude: 78.31, accuracy: 14 })
    await expect(promise).resolves.toEqual({
      latitude: 29.456,
      longitude: 78.31,
      accuracy: 14,
    })
    expect(stub.calls()).toHaveLength(1)
  })

  it('asks the browser for an accurate, finite-timeout fix so the search is never in vain', async () => {
    const stub = installStub()
    const promise = getCurrentPosition()
    stub.succeed({ latitude: 29.456, longitude: 78.31, accuracy: 14 })
    await promise
    expect(stub.options()).toMatchObject({ enableHighAccuracy: true })
    const timeout = stub.options()?.timeout
    expect(typeof timeout).toBe('number')
    expect(Number(timeout)).toBeGreaterThan(0)
    expect(Number(timeout)).toBeLessThanOrEqual(GEOLOCATION_FIX_TIMEOUT_MS)
  })

  it('never hangs forever: the watchdog is a standalone watchdog even if the browser fix stalls', async () => {
    vi.useFakeTimers()
    installStub()
    const promise = getCurrentPosition()
    const expectation = expect(promise).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof GeolocationUnavailableError && error.kind === 'timeout',
    )
    await vi.advanceTimersByTimeAsync(GEOLOCATION_FIX_TIMEOUT_MS)
    await expectation
  })

  it('rejects with kind unsupported when the browser provides no geolocation API', async () => {
    stubWithNoApi()
    await expect(getCurrentPosition()).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof GeolocationUnavailableError && error.kind === 'unsupported',
    )
  })

  it('maps navigator error code 1 (permission denied) to kind permission-denied', async () => {
    const stub = installStub()
    const promise = getCurrentPosition()
    stub.fail(1, 'The user denied the position request')
    await expect(promise).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof GeolocationUnavailableError &&
        error.kind === 'permission-denied',
    )
  })

  it('maps navigator error code 2 (position unavailable) to kind position-unavailable', async () => {
    const stub = installStub()
    const promise = getCurrentPosition()
    stub.fail(2, 'The position is unavailable right now')
    await expect(promise).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof GeolocationUnavailableError &&
        error.kind === 'position-unavailable',
    )
  })

  it('maps navigator error code 3 (timeout) to kind timeout', async () => {
    const stub = installStub()
    const promise = getCurrentPosition()
    stub.fail(3, 'The fix timed out')
    await expect(promise).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof GeolocationUnavailableError && error.kind === 'timeout',
    )
  })

  it('verifies the fix is genuine: splats impossible coordinates instead of trusting them blindly', async () => {
    const stub = installStub()
    const promise = getCurrentPosition()
    stub.succeed({ latitude: Number.NaN, longitude: Number.NaN, accuracy: 0 })
    await expect(promise).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof GeolocationUnavailableError && error.kind === 'invalid',
    )
  })
})
