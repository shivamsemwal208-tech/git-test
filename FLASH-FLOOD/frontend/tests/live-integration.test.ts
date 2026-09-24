import { describe, expect, it } from 'vitest'
import { mapRiskAssessment, riskOrigin } from '../src/api/risk-api'
import type { RiskAssessment } from '../src/api/risk-api'
import type { DemoLocation } from '../src/types/location'

/**
 * Live end-to-end verification against a real backend instance (Step 8).
 *
 * Run ONLY with a throwaway server on a non-conflicting port, e.g.:
 *   set VITE_LIVE_API=http://127.0.0.1:8002/api/v1 && npx vitest run tests/live-integration.test.ts
 *
 * The running dev backend on 127.0.0.1:8001 is owned by the user's terminal and
 * is never used or restarted here.
 */
const LIVE_API: string | undefined = (import.meta.env as { VITE_LIVE_API?: string }).VITE_LIVE_API
const describeLive = LIVE_API ? describe : describe.skip

/* The first real ML request pays a one-time lazy model-load; allow generous time. */
const LIVE_TEST_TIMEOUT = 120000

const arbitraryLocation: DemoLocation = {
  id: 'arbitrary-30.5-79.3',
  name: 'Gangotri approach',
  district: '',
  state: '',
  latitude: 30.5,
  longitude: 79.3,
  elevation: 0,
  status: 'ARBITRARY',
}

const demoLocation: DemoLocation = {
  id: 'dehradun',
  name: 'Dehradun',
  district: 'Dehradun',
  state: 'Uttarakhand',
  latitude: 30.3165,
  longitude: 78.0322,
  elevation: 640,
  status: 'DEMO',
}

async function assess(body: Record<string, unknown>): Promise<RiskAssessment> {
  const response = await fetch(`${LIVE_API}/risk/assess`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  expect(response.ok).toBe(true)
  return (await response.json()) as RiskAssessment
}

describeLive('live /risk/assess consumed by the frontend (Step 8)', () => {
  it(
    'maps a real arbitrary-coordinate ML response to a LIVE prediction',
    async () => {
      const payload = await assess({
        location_id: arbitraryLocation.id,
        scenario: 'normal',
        latitude: arbitraryLocation.latitude,
        longitude: arbitraryLocation.longitude,
        location_name: arbitraryLocation.name,
      })
      expect(payload.data_status).toBe('LIVE')
      expect(payload.is_simulated).toBe(false)
      expect(payload.prediction_status).toBe('PREDICTION')
      expect(payload.probability).not.toBeNull()

      const command = mapRiskAssessment(payload, arbitraryLocation, 'normal')
      expect(command.probability).toBe(payload.probability)
      expect(command.riskLevel).toBe(payload.risk_level)
      expect(riskOrigin(command)).toBe('live')
      expect(command.modelVersion).toBe('rf_calibrated_baseline_v1')
      expect(command.contributingFactors.length).toBeGreaterThan(0)
      expect(command.weather.rainfall72h).not.toBeNull()
    },
    LIVE_TEST_TIMEOUT,
  )

  it(
    'keeps a predefined demo location DEMO/SIMULATION',
    async () => {
      const payload = await assess({ location_id: demoLocation.id, scenario: 'critical_flood' })
      expect(payload.data_status).toBe('DEMO')
      expect(payload.is_simulated).toBe(true)
      expect(payload.probability).toBe(87)
      // Demo schema serializes the ML fields as null (the contract is "None/absent").
      expect(payload.prediction_status).toBeNull()

      const command = mapRiskAssessment(payload, demoLocation, 'critical-flood')
      expect(command.probability).toBe(87)
      expect(command.riskLevel).toBe('CRITICAL')
      expect(riskOrigin(command)).toBe('demo')
    },
    LIVE_TEST_TIMEOUT,
  )
})