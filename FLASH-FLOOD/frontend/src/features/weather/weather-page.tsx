import { useState } from 'react'
import { CloudRain, Gauge, Wind } from 'lucide-react'
import { RainfallChart } from '../../components/charts/rainfall-chart'
import { PageHeader } from '../../components/layout/page-header'
import { DataStatusBadge } from '../../components/status/data-status-badge'
import { useCommand } from '../command-center/command-context'

function fmt(value: number | null | undefined, suffix = ''): string {
  return value === null || value === undefined ? 'Unavailable' : `${value}${suffix}`
}

type Source = 'scenario' | 'live'

export function WeatherPage() {
  const { location, scenarioId } = useCommand()
  // Keyed so the source preference resets whenever the location or scenario changes.
  return <WeatherPanel key={`${location.id}:${scenarioId}`} />
}

function WeatherPanel() {
  const { location, scenarioId, command, weather } = useCommand()
  const weatherError = weather.error
  const current = weather.current
  const unavailable = current?.status === 'UNAVAILABLE'
  const fromLive = current?.status === 'LIVE'
  const live = fromLive ? current : null
  const isLoading = current === null && weather.forecast === null && !weatherError

  const isArbitrary = location.status === 'ARBITRARY'
  const defaultSource: Source = isArbitrary ? 'live' : 'scenario'
  const [requested, setRequested] = useState<Source | null>(null)
  const source: Source = requested ?? defaultSource
  const showingScenario = source === 'scenario'

  const scenario = command.weather
  const scenarioSoilMoisture = command.terrain.soilMoisture

  const scenarioMetrics: [string, string][] = [
    ['Temperature', fmt(scenario.temperature, '°C')],
    ['Humidity', fmt(scenario.humidity, '%')],
    ['Current rainfall', fmt(scenario.currentRainfall, ' mm/h')],
    ['Rainfall · 1h', fmt(scenario.rainfall1h, ' mm')],
    ['Rainfall · 3h', fmt(scenario.rainfall3h, ' mm')],
    ['Rainfall · 6h', fmt(scenario.rainfall6h, ' mm')],
    ['Rainfall · 24h', fmt(scenario.rainfall24h, ' mm')],
    ['Forecast rainfall', fmt(scenario.forecastRainfall, ' mm')],
    ['Precipitation chance', fmt(scenario.precipitationProbability, '%')],
    ['Wind', fmt(scenario.windSpeed, ` km/h ${scenario.windDirection ?? ''}`)],
    ['Pressure', fmt(scenario.pressure, ' hPa')],
    ['Soil moisture', fmt(scenarioSoilMoisture, '%')],
  ]

  const liveMetrics: [string, string][] = [
    ['Temperature', fmt(live?.temperature, '°C')],
    ['Humidity', fmt(live?.humidity, '%')],
    ['Current rainfall', fmt(live?.currentRainfall, ' mm/h')],
    ['Rainfall · 1h', fmt(live?.rainfall1h, ' mm')],
    ['Rainfall · 3h', fmt(live?.rainfall3h, ' mm')],
    ['Rainfall · 6h', fmt(live?.rainfall6h, ' mm')],
    ['Rainfall · 24h', fmt(live?.rainfall24h, ' mm')],
    ['Forecast rainfall', fmt(live?.forecastRainfall, ' mm')],
    ['Precipitation chance', fmt(live?.precipitationProbability, '%')],
    ['Wind', fmt(live?.windSpeed, ` km/h ${live?.windDirection ?? ''}`)],
    ['Pressure', fmt(live?.pressure, ' hPa')],
    ['Soil moisture', fmt(live?.soilMoisture, '%')],
  ]

  const displayedMetrics = showingScenario ? scenarioMetrics : liveMetrics
  const chartValues = showingScenario
    ? (scenario.hourlyRainfall ?? [])
    : (live?.hourlyRainfall ?? [])

  const forecastRainfall = showingScenario
    ? scenario.forecastRainfall
    : (live?.forecastRainfall ?? null)
  const precipitationProb = showingScenario
    ? scenario.precipitationProbability
    : (live?.precipitationProbability ?? null)
  const windSpeed = showingScenario ? scenario.windSpeed : (live?.windSpeed ?? null)
  const windDirection = showingScenario ? scenario.windDirection : (live?.windDirection ?? null)

  const badgeLabel = showingScenario
    ? 'SIMULATION · SCENARIO'
    : isLoading
      ? 'CHECKING LIVE DATA'
      : weatherError
        ? 'LIVE · UNAVAILABLE'
        : unavailable
          ? 'LIVE · UNAVAILABLE'
          : 'LIVE · OPEN-METEO'

  const description = showingScenario
    ? `Simulated weather for the ${scenarioId.replace(/-/g, ' ')} scenario used by the risk assessment for ${location.name}. Switch to Live · Open-Meteo for real conditions — simulated values never substitute for live data.`
    : isLoading
      ? 'Fetching live weather from the Open-Meteo provider…'
      : weatherError
        ? 'Live weather is unreachable. No simulated values are substituted for live data.'
        : unavailable
          ? `Real-time weather is unavailable for ${location.name}. No simulated values substituted.`
          : `Live weather from the Open-Meteo provider for ${live?.locationName ?? location.name}.`

  const updatedText = showingScenario
    ? `Scenario simulation · ${scenarioId.replace(/-/g, ' ')}`
    : live
      ? `Updated ${live.updatedAt ?? '—'} · Open-Meteo`
      : 'Live feed unavailable'

  return (
    <>
      <PageHeader
        eyebrow="WEATHER INTELLIGENCE"
        title="Rainfall and forecast context"
        description={description}
      />
      {!showingScenario && weatherError && (
        <div className="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs text-amber-200">
          {weatherError}
        </div>
      )}
      {!showingScenario && unavailable && (
        <div className="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs text-amber-200">
          {current?.note ?? 'No live weather data available for these coordinates.'}
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[.03] p-1">
          <button
            type="button"
            onClick={() => setRequested('scenario')}
            className={`rounded-md px-3 py-1.5 text-[11px] font-bold tracking-wide transition-colors ${
              showingScenario ? 'bg-cyan-300/20 text-cyan-100' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            SIMULATION · SCENARIO
          </button>
          <button
            type="button"
            onClick={() => setRequested('live')}
            className={`rounded-md px-3 py-1.5 text-[11px] font-bold tracking-wide transition-colors ${
              !showingScenario ? 'bg-cyan-300/20 text-cyan-100' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            LIVE · OPEN-METEO
          </button>
        </div>
        <div className="flex items-center gap-3">
          <DataStatusBadge label={badgeLabel} />
          <span className="text-[10px] tracking-wide text-slate-500">{updatedText}</span>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <section className="rounded-2xl border border-white/8 bg-white/[.03] p-5">
          <div className="flex items-center gap-2">
            <CloudRain className="text-cyan-200" />
            <h2 className="font-semibold text-white">Rainfall progression</h2>
          </div>
          <RainfallChart values={chartValues} />
          <p className="mt-3 text-xs text-slate-500">
            {showingScenario
              ? `Simulated hourly rainfall from the ${scenarioId.replace(/-/g, ' ')} scenario assessment`
              : fromLive
                ? 'Provider forecast hourly rainfall / visualization'
                : 'Hourly rainfall is unavailable for this location'}
          </p>
        </section>
        <section className="rounded-2xl border border-white/8 bg-white/[.03] p-5">
          <Gauge className="text-cyan-200" />
          <h2 className="mt-3 font-semibold text-white">Forecast summary</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {!showingScenario && unavailable
              ? 'No forecast is available for this location.'
              : showingScenario
                ? `The ${scenarioId.replace(
                    /-/g,
                    ' ',
                  )} scenario projects ${fmt(forecastRainfall, ' mm')} of rain with a ${fmt(
                    precipitationProb,
                    '%',
                  )} precipitation probability over the next hours.`
                : `The forecast shows ${fmt(forecastRainfall, ' mm')} of rain and a ${fmt(
                    precipitationProb,
                    '%',
                  )} precipitation probability.`}
          </p>
          <div className="mt-5 flex gap-2 text-xs text-slate-400">
            <Wind size={15} /> {fmt(windSpeed, ' km/h')} from {windDirection ?? '—'}
          </div>
        </section>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {displayedMetrics.map(([label, value]) => (
          <div key={label} className="border border-white/8 bg-white/[.025] p-4">
            <p className="text-xs text-slate-400">{label}</p>
            <p className="mt-2 text-xl font-bold text-white">{value}</p>
          </div>
        ))}
      </div>
    </>
  )
}