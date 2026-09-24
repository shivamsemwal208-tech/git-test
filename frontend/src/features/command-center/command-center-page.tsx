import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CloudRain,
  HeartHandshake,
  Map,
  MapPin,
  Mountain,
  RadioTower,
  Satellite,
  ShieldAlert,
  Siren,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../../components/layout/page-header'
import { CommandMap } from '../../components/map/command-map'
import { DataStatusBadge } from '../../components/status/data-status-badge'
import { StatusChip } from '../../components/status/status-chip'
import { KeyValue } from '../../components/ui/key-value'
import { ModuleCard } from '../../components/ui/module-card'
import { useCommand } from './command-context'
import {
  formatRiverDistance,
  hasRisk,
  riskOrigin,
  riskStatusLabel,
} from '../../api/risk-api'
import { RiskGauge } from '../risk/risk-gauge'
import { RiskHero } from '../../components/risk/risk-hero'
import { severity } from '../../components/severity/severity'
import type { AlertSeverity } from '../../types/alert'

const ALERT_CHIP: Record<AlertSeverity, string> = {
  CRITICAL: 'border-sev-crit/55 bg-sev-crit/15 text-sev-crit-soft',
  HIGH: 'border-alert-high/50 bg-alert-high/15 text-alert-high-soft',
  WARNING: 'border-sev-high/50 bg-sev-high/15 text-sev-high-soft',
  WATCH: 'border-sev-mod/45 bg-sev-mod/15 text-sev-mod-soft',
  INFO: 'border-white/15 bg-white/[0.06] text-slate-200',
}

export function CommandCenterPage() {
  const { command, alerts, safePlaces, seismic, weather, emergencySimulation, location } =
    useCommand()
  const liveWeather = weather.current
  const origin = riskOrigin(command)
  const statusLabel = riskStatusLabel(origin)
  const riskAvailable = hasRisk(command.probability, command.riskLevel)
  const hasEmergencyLevel =
    riskAvailable && (command.riskLevel === 'HIGH' || command.riskLevel === 'CRITICAL')
  const tone = severity(command.riskLevel)

  // When an explicit demo scenario (origin: demo) drives the assessment, the
  // dashboard shows the scenario weather returned by /risk/assess, so a LIVE
  // 0 mm/h reading never contradicts a simulated CRITICAL risk. Live ML and
  // honest-unavailable results stay live: real Open-Meteo values when
  // available, otherwise 'Unavailable' — never fabricated scenario values.
  const scenarioDriven = origin === 'demo'
  const weatherBadge = scenarioDriven
    ? 'SIMULATION · SCENARIO'
    : weather.error || liveWeather?.status === 'UNAVAILABLE'
      ? 'LIVE · UNAVAILABLE'
      : 'LIVE · OPEN-METEO'
  const currentRainfall = scenarioDriven
    ? `${command.weather.currentRainfall} mm/h`
    : liveWeather?.currentRainfall != null
      ? `${liveWeather.currentRainfall} mm/h`
      : 'Unavailable'

  const riverBadge = scenarioDriven ? 'SIMULATION · SCENARIO' : 'LIVE · ML ASSESSMENT'
  const riverValue = formatRiverDistance(command.terrain.riverDistance)
  const terrainValue =
    command.terrain.slope != null
      ? `${command.terrain.slope}° · ${command.terrain.exposure}`
      : command.terrain.exposure

  const seismicEvent = seismic[0]
  const seismicValue =
    seismicEvent?.magnitude != null
      ? `M${seismicEvent.magnitude}`
      : seismicEvent?.status ?? 'Unavailable'
  const seismicBadge =
    seismicEvent?.dataStatus === 'LIVE' ? 'LIVE · USGS' : 'DEMO / SIMULATION'

  const topAlert = alerts[0]

  const gaugeSummary =
    origin === 'live'
      ? `${(command.contributingFactors.map((factor) => factor.feature).join(' + ') || 'Live features')} · ML baseline · ${command.modelVersion ?? 'model'}`
      : `${command.factors.join(' + ')} · Simulation fixture`

  const earlyWarningLabel =
    origin === 'live'
      ? 'LIVE ML EARLY WARNING'
      : origin === 'unavailable'
        ? 'EARLY WARNING UNAVAILABLE'
        : emergencySimulation
          ? 'SIMULATED FLOOD WARNING · DEMO'
          : 'SIMULATED EARLY WARNING'

  const warningKind: 'OPERATIONAL' | 'WATCH' | 'WARNING' | 'UNAVAILABLE' =
    origin === 'live'
      ? hasEmergencyLevel
        ? 'WARNING'
        : 'OPERATIONAL'
      : origin === 'unavailable'
        ? 'UNAVAILABLE'
        : emergencySimulation
          ? 'WARNING'
          : 'WATCH'

  const heroFactors =
    origin === 'live'
      ? command.contributingFactors.map(
          (factor) =>
            `${factor.feature}${
              factor.value != null ? ` ${factor.value}${factor.unit ? ` ${factor.unit}` : ''}` : ' n/a'
            }`,
        )
      : origin === 'demo'
        ? command.factors
        : []

  return (
    <>
      <PageHeader
        eyebrow="FLASHGUARD COMMAND CENTER"
        title="Disaster intelligence overview"
        description="A unified view of flood, weather, terrain, map, seismic, and evacuation context for the selected location."
      />

      {/* ── 1 · CURRENT FLOOD / RISK STATUS ─────────────────────────────── */}
      <div className="mt-5 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.55fr)]">
        <RiskHero
          level={command.riskLevel}
          origin={origin}
          locationName={location.name}
          warning={command.warning}
          action={command.action}
          reason={origin === 'unavailable' ? command.warning : undefined}
          factors={heroFactors}
          modelLine={
            origin === 'live'
              ? `RF baseline model ${command.modelStatus} — version ${command.modelVersion ?? 'unknown'}.`
              : undefined
          }
        />
        <div className="min-w-0 space-y-4">
          <RiskGauge probability={command.probability} riskLevel={command.riskLevel} summary={gaugeSummary} />
          <section className="panel-strong p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldAlert size={15} className={tone.text} />
                <p className={`text-[10px] font-bold uppercase tracking-[0.18em] ${tone.text}`}>
                  Warning posture · {location.name}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusChip kind={warningKind} label={earlyWarningLabel} />
              <DataStatusBadge label={statusLabel} tone={origin === 'live' ? 'cyan' : origin === 'unavailable' ? 'amber' : 'cyan'} />
            </div>
            <p className="mt-3 text-[11px] leading-5 text-slate-500">
              Follow official local authority instructions in a real emergency.
            </p>
            {(hasEmergencyLevel || emergencySimulation) && (
              <Link to="/emergency" className="btn-danger mt-3 px-3 py-2">
                <AlertTriangle size={14} />
                {emergencySimulation ? 'OPEN EMERGENCY MODE (SIMULATION)' : 'ENTER EMERGENCY MODE'}
              </Link>
            )}
          </section>
        </div>
      </div>

      {/* ── 2 · MAP / LOCATION ───────────────────────────────────────────── */}
      <section className="panel mt-6">
        <div className="panel-head">
          <div className="flex items-center gap-2.5">
            <MapPin size={16} className="text-command" />
            <div>
              <p className="eyebrow-command">Map · location</p>
              <h2 className="mt-0.5 text-sm font-semibold text-white">{location.name}</h2>
            </div>
          </div>
          <Link to="/map" className="flex items-center gap-1 text-sm font-semibold text-command-soft">
            Open live map <ArrowUpRight size={14} />
          </Link>
        </div>
        <div className="panel-body">
          <div className="min-w-0 overflow-hidden rounded-xl border border-white/10 bg-panel-3/40">
            <CommandMap layers={{ risk: true, rivers: true, places: true }} />
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            Shared map surface renders deterministic overlays — geographic context only, never
            presented as a live flood footprint.
          </p>
        </div>
      </section>

      {/* ── 3 · CRITICAL ALERTS ──────────────────────────────────────────── */}
      {topAlert && (
        <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-warn" />
              <p className="eyebrow-warn">Critical alerts</p>
            </div>
            <Link to="/alerts" className="text-[11px] font-bold text-command-soft">
              View all alerts <ArrowUpRight size={12} className="inline" />
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3.5">
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black tracking-[0.14em] ${ALERT_CHIP[topAlert.severity]}`}>
              {topAlert.severity.toUpperCase()} · PRIORITY
            </span>
            <p className="text-sm font-semibold text-white">{topAlert.title}</p>
          </div>
        </section>
      )}

      {/* ── 4 · RESPONSE ACTIONS ─────────────────────────────────────────── */}
      <section className="panel mt-6">
        <div className="panel-head">
          <div className="flex items-center gap-2.5">
            <Siren size={16} className="text-danger" />
            <div>
              <p className="eyebrow-danger">Response actions</p>
              <h2 className="mt-0.5 text-sm font-semibold text-white">What to do next</h2>
            </div>
          </div>
        </div>
        <div className="panel-body">
          <div className="flex flex-wrap items-center gap-3">
            <Link to="/evacuation" className="btn-solid px-3 py-2">
              <Map size={14} /> Evacuation guidance
            </Link>
            <Link to="/emergency" className="btn-danger px-3 py-2">
              <Siren size={14} /> Emergency mode
            </Link>
            <Link to="/safe-places" className="btn-emerald px-3 py-2">
              <HeartHandshake size={14} /> Candidate safe places
            </Link>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-slate-500">
            Guidance communicates assumptions and never guarantees safety. Official hydrological
            and emergency-authority warnings take precedence.
          </p>
        </div>
      </section>

      {/* ── 5 · ENVIRONMENTAL DATA ───────────────────────────────────────── */}
      <section className="panel mt-6">
        <div className="panel-head">
          <div className="flex items-center gap-2">
            <CloudRain size={15} className="text-mod-weather" />
            <p className="eyebrow">Environmental indicators</p>
          </div>
          <DataStatusBadge label={weatherBadge} tone={scenarioDriven ? 'cyan' : weather.error ? 'amber' : 'cyan'} />
        </div>
        <div className="p-4 sm:p-5">
          <div className="grid min-w-0 grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            <KeyValue label="Rainfall" value={currentRainfall} sub={weatherBadge} />
            <KeyValue label="River" value={riverValue} sub={riverBadge} />
            <KeyValue label="Terrain" value={terrainValue} sub={riverBadge} />
            <KeyValue label="Seismic" value={seismicValue} sub={seismicBadge} />
            <KeyValue label="Alerts" value={alerts.length} sub="SIMULATION · FRONTEND" />
            <KeyValue
              label="Location"
              value={location.name}
              sub={`${location.latitude.toFixed(4)}°, ${location.longitude.toFixed(4)}°`}
            />
          </div>
        </div>
      </section>

      {/* ── 6 · SUPPORTING INTELLIGENCE ──────────────────────────────────── */}
      <div className="mt-6 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.06fr)_minmax(0,0.94fr)]">
        <div className="min-w-0 space-y-5">
          <section className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">{origin === 'live' ? 'WHY THE ML RISK IS ELEVATED' : origin === 'unavailable' ? 'WHY THE PREDICTION IS UNAVAILABLE' : 'WHY IS THE RISK ELEVATED?'}</p>
              </div>
              <Link to="/flood-risk" className="text-sm font-semibold text-command-soft">
                Open flood intelligence <ArrowUpRight size={14} className="inline" />
              </Link>
            </div>
            <div className="p-4 sm:p-5">
              {origin === 'live' ? (
                <div className="space-y-3">
                  {command.contributingFactors.map((factor, index) => (
                    <div key={factor.feature} className="flex gap-3 border-l border-rose-300/55 pl-3">
                      <span className="text-xs font-bold text-rose-200">0{index + 1}</span>
                      <div>
                        <p className="text-sm font-semibold text-white">{factor.feature}</p>
                        <p className="text-xs leading-5 text-slate-400">
                          {factor.value != null ? `${factor.value}${factor.unit ? ` ${factor.unit}` : ''}` : 'Unavailable'} · importance {factor.importance.toFixed(4)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {command.explanation && (
                    <p className="text-xs leading-5 text-slate-400">{command.explanation}</p>
                  )}
                  <p className="text-[11px] text-slate-500">
                    Ranked importance from the calibrated Random Forest baseline · {command.modelVersion ?? 'model'}
                  </p>
                </div>
              ) : origin === 'unavailable' ? (
                <div className="space-y-2">
                  {command.missingFeatures.length > 0 ? (
                    <ul className="text-xs leading-5 text-slate-400">
                      Missing live features required by the model:
                      {command.missingFeatures.map((feature) => (
                        <li key={feature} className="ml-3">— {feature}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs leading-5 text-slate-400">{command.warning}</p>
                  )}
                  <p className="text-[11px] text-slate-500">
                    No prediction was produced — no demo/scenario probability was substituted.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {command.factors.map((factor, index) => (
                    <div key={factor} className="flex gap-3 border-l border-rose-300/55 pl-3">
                      <span className="text-xs font-bold text-rose-200">0{index + 1}</span>
                      <div>
                        <p className="text-sm font-semibold text-white">{factor}</p>
                        <p className="text-xs leading-5 text-slate-400">
                          Elevated in the selected simulation fixture; not an ML explanation.
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow-safe">Safe-place context</p>
                <h2 className="mt-1 font-semibold text-white">Suggested lower-risk locations</h2>
              </div>
              <MapPin className="text-safe" />
            </div>
            <div className="p-4 sm:p-5">
              {safePlaces.length === 0 ? (
                <p className="text-xs leading-5 text-slate-400">
                  No safe-place data is available for this location — verify with official
                  authorities.
                </p>
              ) : (
                safePlaces.slice(0, 2).map((place) => (
                  <div key={place.id} className="flex items-center justify-between border-t border-white/[0.08] pt-3 first:mt-0 first:border-t-0">
                    <span>
                      <b className="block text-sm text-white">{place.name}</b>
                      <small className="text-slate-400">
                        {place.distanceKm} km · {place.elevationM} m elevation
                      </small>
                    </span>
                    <Link to="/safe-places" className="text-xs font-semibold text-command-soft">
                      View
                    </Link>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="min-w-0 space-y-5">
          <section className="panel">
            <div className="panel-head">
              <div className="flex items-center gap-2">
                <RadioTower size={15} className="text-mod-seismic" />
                <p className="eyebrow">Seismic watch</p>
              </div>
              <DataStatusBadge label={seismicBadge} tone="cyan" />
            </div>
            <div className="p-4 sm:p-5">
              {seismicEvent ? (
                seismicEvent.magnitude != null ? (
                  <p className="text-sm text-white">
                    M{seismicEvent.magnitude}{' '}
                    {seismicEvent.dataStatus === 'LIVE'
                      ? 'monitored nearby event'
                      : 'illustrative nearby event'}{' '}
                    · {seismicEvent.distanceKm} km
                  </p>
                ) : (
                  <p className="text-sm text-slate-300">
                    {seismicEvent.status === 'NO RECENT EVENT'
                      ? 'No recent earthquake detected in the monitored radius.'
                      : 'Seismic monitoring status: ' + seismicEvent.status}
                  </p>
                )
              ) : (
                <p className="text-sm text-slate-400">
                  No seismic monitoring data is available for these coordinates.
                </p>
              )}
              <p className="mt-2 text-xs text-slate-400">
                Monitoring only. FlashGuard does not predict earthquakes.
              </p>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div className="flex items-center gap-2">
                <Mountain size={15} className="text-mod-terrain" />
                <p className="eyebrow">Terrain context</p>
              </div>
            </div>
            <div className="p-4 sm:p-5">
              <div className="grid grid-cols-2 gap-2.5">
                <KeyValue label="Slope" value={command.terrain.slope != null ? `${command.terrain.slope}°` : 'Unavailable'} sub="Degree" />
                <KeyValue label="Elevation" value={command.terrain.elevation != null ? `${command.terrain.elevation} m` : 'Unavailable'} sub="AMSL" />
                <KeyValue label="River distance" value={formatRiverDistance(command.terrain.riverDistance)} sub="Real HydroRIVERS" />
                <KeyValue label="Soil moisture" value={command.terrain.soilMoisture != null ? `${command.terrain.soilMoisture}%` : 'Unavailable'} sub="Surface" />
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* ── Command modules ──────────────────────────────────────────────── */}
      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="eyebrow-command">Command modules</p>
          {topAlert && (
            <Link to="/alerts" className="flex items-center gap-1.5 text-[11px] font-bold text-warn">
              <AlertTriangle size={12} /> {topAlert.severity} · {topAlert.title}
            </Link>
          )}
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ModuleCard to="/map" icon={Map} title="Live Map" tagline="Geographic flood intelligence · real data layers" />
          <ModuleCard to="/flood-risk" icon={Activity} title="Flood Risk" tagline="ML baseline prediction and factor context" accent="danger" />
          <ModuleCard to="/weather" icon={CloudRain} title="Weather" tagline="Open-Meteo rainfall and forecast context" />
          <ModuleCard to="/safe-places" icon={HeartHandshake} title="Safe Places" tagline="Candidate emergency destinations · OpenStreetMap" accent="safe" />
          <ModuleCard to="/seismic" icon={RadioTower} title="Seismic" tagline="Monitored events and secondary-hazard awareness" />
          <ModuleCard to="/satellite-terrain" icon={Satellite} title="Satellite & Terrain" tagline="Remote-sensing integration workspace" />
          <ModuleCard to="/alerts" icon={AlertTriangle} title="Alerts" tagline="Severity-ordered alert and action center" accent="command" />
          <ModuleCard to="/emergency" icon={Siren} title="Emergency Mode" tagline="Elevated-risk response console" accent="danger" />
        </div>
      </section>
    </>
  )
}