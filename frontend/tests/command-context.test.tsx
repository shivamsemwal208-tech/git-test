/**
 * Phase 1: network-failure fallback in CommandProvider must be an honest local
 * API_UNAVAILABLE diagnostic — never a fabricated DATA_INCOMPLETE or
 * MODEL_UNAVAILABLE verdict (those belong to the backend) and never a demo
 * probability.
 *
 * Backend-sourced reasons (DATA_INCOMPLETE / MODEL_UNAVAILABLE) pass through
 * mapRiskAssessment with backend detail intact; see risk-api.test.ts for those.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CommandProvider, useCommand } from '../src/features/command-center/command-context'

vi.mock('../src/api/risk-api', () => ({
  getLocations: vi.fn().mockRejectedValue(new Error('network down')),
  postRiskAssessment: vi.fn().mockRejectedValue(new Error('network down')),
  getSafePlaces: vi.fn().mockRejectedValue(new Error('network down')),
  getAlerts: vi.fn().mockRejectedValue(new Error('network down')),
  getLatestSeismic: vi.fn().mockRejectedValue(new Error('network down')),
  getWeatherCurrent: vi.fn().mockRejectedValue(new Error('network down')),
  getWeatherForecast: vi.fn().mockRejectedValue(new Error('network down')),
  mapLiveWeatherCurrent: vi.fn(),
  mapLiveWeatherForecast: vi.fn(),
  mapRiskAssessment: vi.fn(),
  riskOrigin: vi.fn(() => 'api'),
}))

function Probe() {
  const { command, apiError, isLoading } = useCommand()
  return (
    <div>
      <p data-testid="reason">{command.reason ?? 'none'}</p>
      <p data-testid="prediction-status">{command.predictionStatus ?? 'none'}</p>
      <p data-testid="probability">
        {command.probability === null ? 'null' : String(command.probability)}
      </p>
      <p data-testid="warning">{command.warning}</p>
      <p data-testid="api-error">{apiError ?? 'none'}</p>
      <p data-testid="loading">{isLoading ? 'loading' : 'done'}</p>
    </div>
  )
}

describe('CommandProvider — network/API failure', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('reports API_UNAVAILABLE (not DATA_INCOMPLETE) when the risk endpoint is unreachable', async () => {
    render(
      <CommandProvider>
        <Probe />
      </CommandProvider>,
    )
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('done')
    })
    expect(screen.getByTestId('reason')).toHaveTextContent('API_UNAVAILABLE')
    expect(screen.getByTestId('reason')).not.toHaveTextContent('DATA_INCOMPLETE')
    expect(screen.getByTestId('prediction-status')).toHaveTextContent('UNAVAILABLE')
    expect(screen.getByTestId('probability')).toHaveTextContent('null')
    expect(screen.getByTestId('api-error')).not.toHaveTextContent('none')
    const warning = screen.getByTestId('warning')
    expect(warning.textContent).toContain('could not be reached')
    expect(warning.textContent).not.toContain('live features could not be retrieved')
  })
})