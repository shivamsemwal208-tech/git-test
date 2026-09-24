import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { demoLocations } from '../../data/demo-locations'
import { scenarioFixtures } from '../../data/demo-scenarios'
import { demoCommandService } from '../../services/demo-command-service'
import {
  getAlerts,
  getLatestSeismic,
  getLocations,
  getSafePlaces,
  getWeatherCurrent,
  getWeatherForecast,
  mapLiveWeatherCurrent,
  mapLiveWeatherForecast,
  mapRiskAssessment,
  postRiskAssessment,
  riskOrigin,
  type LiveWeatherCurrent,
  type LiveWeatherForecast,
  type RiskCommand,
} from '../../api/risk-api'
import type { DemoLocation } from '../../types/location'
import type { ScenarioId } from '../../types/risk'
import type { SafePlace } from '../../types/safe-place'
import type { DemoAlert } from '../../types/alert'
import type { SeismicEvent } from '../../types/seismic'
import type { CommandContextValue, CommandWeather } from './command-context-types'

const CommandContext = createContext<CommandContextValue | null>(null)

interface RiskFetchState {
  key: string
  command: RiskCommand | null
  error: string | null
}

interface PlacesFetchState {
  key: string
  places: SafePlace[] | null
  error: string | null
}

interface AlertsFetchState {
  key: string
  alerts: DemoAlert[] | null
  error: string | null
}

interface SeismicFetchState {
  key: string
  events: SeismicEvent[] | null
  error: string | null
}

interface WeatherFetchState {
  key: string
  current: LiveWeatherCurrent | null
  forecast: LiveWeatherForecast | null
  error: string | null
}

/**
 * Honest fallback when the live risk request itself failed (network/API error).
 *
 * This is the ONLY local use of `API_UNAVAILABLE`; it is never produced by the
 * backend. It deliberately does NOT claim `DATA_INCOMPLETE` (the backend's
 * verdict that live features are missing) or `MODEL_UNAVAILABLE` (the backend's
 * verdict that the model failed) — the frontend simply does not know why the
 * endpoint was unreachable, so the UI shows a network/API error instead.
 */
function unavailableCommand(location: DemoLocation, scenarioId: ScenarioId): RiskCommand {
  const scenario = scenarioFixtures[scenarioId]
  return {
    ...scenario,
    probability: null,
    riskLevel: null,
    location,
    warning: `Flood risk unavailable for ${location.name} — the FlashGuard risk API could not be reached.`,
    action: 'Rely on official warnings; FlashGuard could not contact its live risk service for these coordinates.',
    factors: [],
    terrain: {
      elevation: null,
      slope: null,
      aspect: 'Unavailable',
      soilMoisture: null,
      riverDistance: null,
      drainage: 'Unavailable',
      historical: 'Unavailable',
      exposure: 'Unavailable',
    },
    predictionStatus: 'UNAVAILABLE',
    reason: 'API_UNAVAILABLE',
    missingFeatures: [],
    modelVersion: null,
    modelStatus: 'Not connected — risk API unavailable',
    contributingFactors: [],
    explanation: null,
    historical: null,
    disclaimer:
      'The live risk request failed (network/API error). No demo or scenario probability was substituted.',
  }
}

export function CommandProvider({ children }: { children: React.ReactNode }) {
  const [selectedLocation, setSelectedLocation] = useState<DemoLocation>(demoLocations[0])
  const [scenarioId, setScenarioId] = useState<ScenarioId>('critical-flood')
  const [emergencySimulation, setEmergencySimulation] = useState(false)
  // Explicit "Simulation Control" mode (Simulation page): while active, the
  // command center shows the deterministic demo scenario fixture for built-in
  // locations. It is always clearly labelled DEMO/SIMULATION.
  const [simulationActive, setSimulationActive] = useState(false)

  // Demo-only emergency control: while active, every consumer sees the
  // CRITICAL-FLOOD scenario. The user's chosen scenario is preserved underneath
  // and restored automatically when the simulation ends. It never fabricates
  // live data — arbitrary-coordinate locations still surface the real ML
  // prediction / honest unavailable state.
  const toggleEmergencySimulation = useCallback(() => {
    setEmergencySimulation((active) => !active)
  }, [])

  const effectiveScenarioId: ScenarioId = emergencySimulation ? 'critical-flood' : scenarioId

  const [locations, setLocations] = useState<DemoLocation[]>(demoLocations)
  const [locationsError, setLocationsError] = useState<string | null>(null)
  const [riskState, setRiskState] = useState<RiskFetchState>({
    key: '',
    command: null,
    error: null,
  })
  const [placesState, setPlacesState] = useState<PlacesFetchState>({
    key: '',
    places: null,
    error: null,
  })
  const [alertsState, setAlertsState] = useState<AlertsFetchState>({
    key: '',
    alerts: null,
    error: null,
  })
  const [seismicState, setSeismicState] = useState<SeismicFetchState>({
    key: '',
    events: null,
    error: null,
  })
  const [weatherState, setWeatherState] = useState<WeatherFetchState>({
    key: '',
    current: null,
    forecast: null,
    error: null,
  })

  useEffect(() => {
    let active = true
    getLocations()
      .then((loaded) => {
        if (!active) return
        if (loaded.length > 0) setLocations(loaded)
        setLocationsError(null)
      })
      .catch(() => {
        if (!active) return
        setLocationsError('Backend unavailable — using built-in demo locations')
      })
    return () => {
      active = false
    }
  }, [])

  const location = useMemo(() => {
    if (selectedLocation.status === 'ARBITRARY') return selectedLocation
    return locations.find((item) => item.id === selectedLocation.id) ?? selectedLocation
  }, [locations, selectedLocation])
  const isArbitrary = location.status === 'ARBITRARY'

  // Explicit simulation/demo only applies to built-in locations; arbitrary
  // coordinates always keep the live ML pipeline (never overridden).
  const simulate = (emergencySimulation || simulationActive) && !isArbitrary

  useEffect(() => {
    const requestKey = `${location.id}:${effectiveScenarioId}`
    let active = true
    postRiskAssessment(location, effectiveScenarioId, simulate)
      .then((assessment) => {
        if (!active) return
        setRiskState({
          key: requestKey,
          command: mapRiskAssessment(assessment, location, effectiveScenarioId),
          error: null,
        })
      })
      .catch(() => {
        if (!active) return
        setRiskState({
          key: requestKey,
          command: null,
          error: isArbitrary
            ? 'Risk API unavailable — live ML prediction cannot be retrieved'
            : 'Risk API unavailable — live risk cannot be retrieved',
        })
      })
    return () => {
      active = false
    }
  }, [location, effectiveScenarioId, isArbitrary, simulate])

  useEffect(() => {
    const requestKey = location.id
    let active = true
    getSafePlaces(location)
      .then((places) => {
        if (!active) return
        setPlacesState({ key: requestKey, places, error: null })
      })
      .catch(() => {
        if (!active) return
        setPlacesState({
          key: requestKey,
          places: isArbitrary ? [] : null,
          error: isArbitrary
            ? 'No safe-place data available for arbitrary coordinates'
            : 'Safe-places API unavailable — using demo locations',
        })
      })
    return () => {
      active = false
    }
  }, [location, isArbitrary])

  useEffect(() => {
    const requestKey = `${location.id}:${effectiveScenarioId}`
    let active = true
    getAlerts(location, effectiveScenarioId)
      .then((alertItems) => {
        if (!active) return
        setAlertsState({ key: requestKey, alerts: alertItems, error: null })
      })
      .catch(() => {
        if (!active) return
        setAlertsState({
          key: requestKey,
          alerts: isArbitrary ? [] : null,
          error: isArbitrary
            ? 'No alerts available for arbitrary coordinates'
            : 'Alerts API unavailable — using demo alerts',
        })
      })
    return () => {
      active = false
    }
  }, [location, effectiveScenarioId, isArbitrary])

  useEffect(() => {
    const requestKey = location.id
    let active = true
    getLatestSeismic(location)
      .then((event) => {
        if (!active) return
        setSeismicState({ key: requestKey, events: [event], error: null })
      })
      .catch(() => {
        if (!active) return
        setSeismicState({
          key: requestKey,
          events: isArbitrary ? [] : null,
          error: isArbitrary
            ? 'No seismic monitoring data for arbitrary coordinates'
            : 'Seismic API unavailable — using demo event',
        })
      })
    return () => {
      active = false
    }
  }, [location, isArbitrary])

  useEffect(() => {
    const requestKey = location.id
    let active = true
    Promise.all([getWeatherCurrent(location), getWeatherForecast(location)])
      .then(([current, forecast]) => {
        if (!active) return
        setWeatherState({
          key: requestKey,
          current: mapLiveWeatherCurrent(current),
          forecast: mapLiveWeatherForecast(forecast),
          error: null,
        })
      })
      .catch(() => {
        if (!active) return
        setWeatherState({
          key: requestKey,
          current: null,
          forecast: null,
          error: 'Weather API unavailable — live weather cannot be retrieved',
        })
      })
    return () => {
      active = false
    }
  }, [location])

  const current = riskState.key === `${location.id}:${effectiveScenarioId}`
  const command = useMemo(
    () =>
      current && riskState.command
        ? riskState.command
        : simulate
          ? demoCommandService.assessment(location, effectiveScenarioId)
          : unavailableCommand(location, effectiveScenarioId),
    [current, riskState.command, simulate, location, effectiveScenarioId],
  )

  const placesCurrent = placesState.key === location.id
  const safePlaces = useMemo(
    () => {
      if (isArbitrary) return []
      if (placesCurrent && !placesState.error && placesState.places !== null) {
        return placesState.places
      }
      return demoCommandService.safePlaces(location)
    },
    [placesCurrent, placesState, isArbitrary, location],
  )
  const alertsCurrent = alertsState.key === `${location.id}:${effectiveScenarioId}`
  const alerts = useMemo(
    () => {
      if (isArbitrary) return []
      if (alertsCurrent && !alertsState.error && alertsState.alerts !== null) {
        return alertsState.alerts
      }
      return demoCommandService.alerts(location, effectiveScenarioId)
    },
    [alertsCurrent, alertsState, isArbitrary, location, effectiveScenarioId],
  )
  const seismicCurrent = seismicState.key === location.id
  const seismic = useMemo(
    () => {
      if (seismicCurrent && !seismicState.error && seismicState.events !== null) {
        return seismicState.events
      }
      if (isArbitrary) return []
      return demoCommandService.seismic(location)
    },
    [seismicCurrent, seismicState, isArbitrary, location],
  )

  const weatherCurrent = weatherState.key === location.id
  const weather = useMemo<CommandWeather>(
    () =>
      weatherCurrent && !weatherState.error
        ? { current: weatherState.current, forecast: weatherState.forecast, error: null }
        : {
            current: weatherState.current ?? null,
            forecast: weatherState.forecast ?? null,
            error: weatherCurrent ? weatherState.error : null,
          },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- weatherState fields are the real deps; the whole object is replaced on every update
    [weatherCurrent, weatherState.current, weatherState.forecast, weatherState.error],
  )

  const value = useMemo<CommandContextValue>(
    () => ({
      location,
      locations,
      scenarioId: effectiveScenarioId,
      setLocation: setSelectedLocation,
      setScenarioId,
      command,
      safePlaces,
      alerts,
      seismic,
      weather,
      isLoading: !current || !placesCurrent || !alertsCurrent || !seismicCurrent || !weatherCurrent,
      apiError:
        locationsError ??
        riskState.error ??
        placesState.error ??
        alertsState.error ??
        seismicState.error,
      dataSource: current && riskState.command ? 'api' : 'demo',
      riskOrigin: riskOrigin(command),
      emergencySimulation,
      toggleEmergencySimulation,
      simulationActive,
      setSimulationActive,
    }),
    [
      location,
      locations,
      effectiveScenarioId,
      command,
      safePlaces,
      alerts,
      seismic,
      weather,
      current,
      placesCurrent,
      alertsCurrent,
      seismicCurrent,
      weatherCurrent,
      locationsError,
      riskState.error,
      riskState.command,
      placesState,
      alertsState,
      seismicState,
      emergencySimulation,
      toggleEmergencySimulation,
      simulationActive,
    ],
  )

  return <CommandContext.Provider value={value}>{children}</CommandContext.Provider>
}
// eslint-disable-next-line react-refresh/only-export-components
export function useCommand() {
  const context = useContext(CommandContext)
  if (!context) throw new Error('useCommand must be used within CommandProvider')
  return context
}