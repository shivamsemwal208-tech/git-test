import { AlertTriangle, ArrowUpRight, CloudRain, MapPin, Mountain, RadioTower } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../../components/layout/page-header'
import { CommandMap } from '../../components/map/command-map'
import { DataStatusBadge } from '../../components/status/data-status-badge'
import { useCommand } from './command-context'
import { hasRisk, riskStatusLabel, riskOrigin } from '../../api/risk-api'
import { RiskGauge } from '../risk/risk-gauge'

export function CommandCenterPage() {
  const { command, alerts, safePlaces, seismic, weather, location } = useCommand()
  const liveWeather = weather.current
  const isArbitrary = location.status === 'ARBITRARY'
  const origin = riskOrigin(command)
  const statusLabel = riskStatusLabel(origin)
  const riskAvailable = hasRisk(command.probability, command.riskLevel)

  // For demo/simulation locations the dashboard is driven by the scenario weather
  // returned by /risk/assess, so a LIVE 0 mm/h reading never contradicts the
  // simulated CRITICAL risk. Arbitrary locations stay honest: live weather when
  // available, otherwise 'Unavailable' — never fabricated scenario values.
  const scenarioDriven = !isArbitrary
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
  const soilMoisture = scenarioDriven
    ? command.terrain.soilMoisture === null
      ? 'Unavailable'
      : `${command.terrain.soilMoisture}%`
    : liveWeather?.soilMoisture != null
      ? `${liveWeather.soilMoisture}%`
      : 'Unavailable'

  const gaugeSummary =
    origin === 'live'
      ? `${(command.contributingFactors.map((factor) => factor.feature).join(' + ') || 'Live features')} · ML baseline · ${command.modelVersion ?? 'model'}`
      : `${command.factors.join(' + ')} · Simulation fixture`

  const earlyWarningLabel =
    origin === 'live' ? 'LIVE ML EARLY WARNING' : origin === 'unavailable' ? 'EARLY WARNING UNAVAILABLE' : 'SIMULATED EARLY WARNING'

  return (
    <>
      <PageHeader
        eyebrow="FLASHGUARD COMMAND CENTER"
        title="Disaster intelligence overview"
        description="A unified view of flood, weather, terrain, map, seismic, and evacuation context for the selected location."
      />
      <div className="grid gap-5 xl:grid-cols-[1.06fr_.94fr]">
        <div className="space-y-5">
          <RiskGauge
            probability={command.probability}
            riskLevel={command.riskLevel}
            summary={gaugeSummary}
          />
          <section className="grid gap-3 sm:grid-cols-3">
            {[
              { label: 'Current rainfall', value: currentRainfall, icon: CloudRain, badge: weatherBadge },
              { label: 'Soil moisture', value: soilMoisture, icon: Mountain, badge: weatherBadge },
              { label: 'Active alerts', value: String(alerts.length), icon: AlertTriangle, badge: 'SIMULATION' },
            ].map(({ label, value, icon: Icon, badge }) => (
              <div key={label} className="border-l-2 border-cyan-300/70 bg-white/[.035] p-4">
                <Icon size={17} className="text-cyan-200" />
                <p className="mt-3 text-xs text-slate-400">{label}</p>
                <p className="mt-1 text-xl font-bold text-white">{value}</p>
                <DataStatusBadge label={badge} />
              </div>
            ))}
          </section>
          <section className="rounded-2xl border border-white/8 bg-white/[.03] p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold tracking-[.15em] text-slate-400">GIS INTELLIGENCE</p>
                <h2 className="mt-1 font-semibold text-white">Location and risk context</h2>
              </div>
              <Link to="/map" className="text-sm font-semibold text-cyan-200">
                Open map →
              </Link>
            </div>
            <div className="mt-4">
              <CommandMap layers={{ risk: true, rivers: true, places: true }} />
            </div>
          </section>
        </div>
        <div className="space-y-5">
          <section className="rounded-2xl border border-rose-300/20 bg-rose-500/[.07] p-5">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 text-rose-200" />
              <div>
                <p className="text-[11px] font-bold tracking-[.15em] text-rose-200">{earlyWarningLabel}</p>
                <h2 className="mt-1 text-lg font-bold text-white">
                  {riskAvailable ? `${command.riskLevel} flood risk` : 'Flood risk unavailable'}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">{command.action}</p>
                {origin === 'live' && (
                  <p className="mt-2 text-[11px] text-slate-500">
                    Live ML baseline estimate (model {command.modelVersion ?? '—'}) · {command.modelStatus}
                  </p>
                )}
                {origin === 'unavailable' && (
                  <p className="mt-2 text-[11px] leading-5 text-slate-400">
                    Prediction reason: {command.reason ?? 'unknown'}. No demo or scenario probability
                    was substituted.
                  </p>
                )}
                <p className="mt-3 text-[11px] text-slate-500">
                  <span className="text-slate-400 font-semibold">Risk origin:</span> {statusLabel}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Follow official local authority instructions in a real emergency.
                </p>
              </div>
            </div>
          </section>
          <section className="rounded-2xl border border-white/8 bg-white/[.03] p-5">
            <p className="text-[11px] font-bold tracking-[.15em] text-slate-400">
              {origin === 'live' ? 'WHY THE ML RISK IS ELEVATED' : origin === 'unavailable' ? 'WHY THE PREDICTION IS UNAVAILABLE' : 'WHY IS THE RISK ELEVATED?'}
            </p>
            {origin === 'live' ? (
              <div className="mt-4 space-y-3">
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
              <div className="mt-4 space-y-2">
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
              <div className="mt-4 space-y-3">
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
            <Link to="/flood-risk" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-cyan-200">
              Open flood intelligence <ArrowUpRight size={15} />
            </Link>
          </section>
          <section className="rounded-2xl border border-white/8 bg-white/[.03] p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold tracking-[.15em] text-slate-400">SAFE-PLACE CONTEXT</p>
                <h2 className="mt-1 font-semibold text-white">Suggested lower-risk locations</h2>
              </div>
              <MapPin className="text-emerald-200" />
            </div>
            {safePlaces.slice(0, 2).map((place) => (
              <div key={place.id} className="mt-4 flex items-center justify-between border-t border-white/8 pt-3">
                <span>
                  <b className="block text-sm text-white">{place.name}</b>
                  <small className="text-slate-400">
                    {place.distanceKm} km · {place.elevationM} m elevation
                  </small>
                </span>
                <Link to="/safe-places" className="text-xs font-semibold text-cyan-200">
                  View
                </Link>
              </div>
            ))}
          </section>
          <section className="rounded-2xl border border-white/8 bg-white/[.03] p-5">
            <div className="flex items-center gap-2">
              <RadioTower size={17} className="text-amber-200" />
              <p className="text-[11px] font-bold tracking-[.15em] text-slate-400">SEISMIC WATCH</p>
            </div>
            {seismic[0] ? (
              seismic[0].magnitude != null ? (
                <p className="mt-3 text-sm text-white">
                  M{seismic[0].magnitude}{' '}
                  {seismic[0].dataStatus === 'LIVE'
                    ? 'monitored nearby event'
                    : 'illustrative nearby event'}{' '}
                  · {seismic[0].distanceKm} km
                </p>
              ) : (
                <p className="mt-3 text-sm text-slate-300">
                  {seismic[0].status === 'NO RECENT EVENT'
                    ? 'No recent earthquake detected in the monitored radius.'
                    : 'Seismic monitoring status: ' + seismic[0].status}
                </p>
              )
            ) : (
              <p className="mt-3 text-sm text-slate-400">
                No seismic monitoring data is available for these coordinates.
              </p>
            )}
            <p className="mt-1 text-xs text-slate-400">Monitoring only. FlashGuard does not predict earthquakes.</p>
          </section>
        </div>
      </div>
    </>
  )
}