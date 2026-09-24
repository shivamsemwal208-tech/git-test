import { Mountain, Droplets } from 'lucide-react'
import { PageHeader } from '../../components/layout/page-header'
import { RiskHero } from '../../components/risk/risk-hero'
import { useCommand } from '../command-center/command-context'
import { riskOrigin, riskStatusLabel, hasRisk, formatRiverDistance } from '../../api/risk-api'
import type { HistoricalEvent } from '../../types/risk'
import { RiskGauge } from '../risk/risk-gauge'

const REASON_TEXT: Record<string, string> = {
  MODEL_UNAVAILABLE:
    'The ML model artifact could not be loaded on the server, so no prediction is possible.',
  DATA_INCOMPLETE:
    'Required live features could not be measured for these coordinates, so no prediction is possible.',
  API_UNAVAILABLE:
    'The live FlashGuard risk endpoint could not be reached, so no prediction is available. This is a network/API error, not an ML or data diagnosis.',
  INDEX_UNAVAILABLE:
    'The local DFO event index is missing or unreadable, so historical flood intelligence could not be produced. No fabricated history is shown.',
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Formats an ISO "2002-08-11" date as "11 Aug 2002". */
function formatHistoryDate(iso: string | null): string {
  if (!iso) return '—'
  const [year, month, day] = iso.slice(0, 10).split('-')
  const monthIndex = Number(month) - 1
  if (!year || !month || !day || monthIndex < 0 || monthIndex > 11) return iso.slice(0, 10)
  return `${Number(day)} ${MONTHS[monthIndex]} ${year}`
}

/** DFO documented severity classes: 1 minor, 1.5 major, 2 severe. */
function formatSeverity(value: number | null): string {
  if (value === null) return '—'
  if (value === 1) return 'Minor'
  if (value === 1.5) return 'Major'
  if (value === 2) return 'Severe'
  return `${value}`
}

/** "11 Aug 2002 – 13 Aug 2002" (single day collapses to one date). */
function formatEventDates(event: HistoricalEvent): string {
  const end = formatHistoryDate(event.endDate)
  if (!event.beginDate || event.endDate === event.beginDate) return formatHistoryDate(event.beginDate)
  return `${formatHistoryDate(event.beginDate)} – ${end}`
}

/** Thousands separators for catalogue counts ("5,501"). */
function formatCount(value: number | null): string {
  if (value === null) return '—'
  return value.toLocaleString('en-US')
}

export function FloodRiskPage() {
  const { command, dataSource, isLoading, location } = useCommand()
  const origin = riskOrigin(command)
  const statusLabel = riskStatusLabel(origin)
  const available = hasRisk(command.probability, command.riskLevel)
  const fmtNum = (value: number | null, unit: string) =>
    value === null ? 'Unavailable' : `${value}${unit}`
  const terrainRows: [string, string][] = [
    ['Elevation', fmtNum(command.terrain.elevation, ' m')],
    ['Slope', fmtNum(command.terrain.slope, '°')],
    ['Aspect', command.terrain.aspect],
    ['Soil moisture', fmtNum(command.terrain.soilMoisture, '%')],
    ['River distance', formatRiverDistance(command.terrain.riverDistance)],
    ['Drainage', command.terrain.drainage],
    ['Terrain exposure', command.terrain.exposure],
    ['Historical context', command.terrain.historical],
  ]

  const description =
    origin === 'live'
      ? `Real ML risk assessment for ${location.name} using live Open-Meteo features, served by the FlashGuard baseline model (POST /api/v1/risk/assess). Model version ${command.modelVersion ?? '—'}.`
      : origin === 'unavailable'
        ? `No risk prediction could be produced for ${location.name}. The backend reported an honest unavailable result instead of fabricating a value.`
        : dataSource === 'api'
          ? `Risk assessment served by the FlashGuard backend (POST /api/v1/risk/assess) for ${location.name}. Demo scenario logic only — not an ML prediction.`
          : 'This page displays deterministic demo scenario values. It does not calculate or claim an ML prediction.'

  const gaugeSummary =
    origin === 'live'
      ? `${(command.contributingFactors.map((factor) => factor.feature).join(' + ') || 'Live features')} · ML baseline · ${command.modelVersion ?? 'model'}`
      : origin === 'unavailable'
        ? `FlashGuard could not produce a prediction for these coordinates. ${command.warning}`
        : `${command.factors.join(' + ')} · ${dataSource === 'api' ? 'backend scenario logic' : 'demo scenario fixture'}`

  const actionHeading = origin === 'live' ? `${command.riskLevel} ML risk` : origin === 'unavailable' ? 'Risk prediction unavailable' : `${command.riskLevel} scenario`
  const headerTone = origin === 'live' ? 'cyan' : origin === 'unavailable' ? 'amber' : 'cyan'

  return (
    <>
      <PageHeader
        eyebrow="FLOOD-RISK INTELLIGENCE"
        title="Risk overview and factor context"
        description={description}
        statusLabel={statusLabel}
        statusTone={headerTone}
      />
      {isLoading && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <span className="pulse-dot" />
            Updating risk assessment…
          </p>
        </div>
      )}

      <div className="mt-5">
        <RiskHero
          level={command.riskLevel}
          origin={origin}
          locationName={location.name}
          warning={command.warning}
          action={command.action}
          reason={origin === 'unavailable' ? command.warning : undefined}
          factors={
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
          }
          modelLine={
            origin === 'live'
              ? `RF baseline model ${command.modelStatus} — prediction served from live Open-Meteo features at these coordinates.`
              : undefined
          }
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <RiskGauge
          probability={command.probability}
          riskLevel={command.riskLevel}
          summary={gaugeSummary}
        />
        <section className="rounded-2xl border border-rose-300/15 bg-rose-500/[.04] p-5">
          <p className="eyebrow">
            {origin === 'live' ? 'LIVE ML ASSESSMENT' : origin === 'unavailable' ? 'ASSESSMENT STATUS' : 'RECOMMENDED ACTION'}
          </p>
          <h2 className="mt-2 text-xl font-bold text-white">
            {actionHeading}
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-300">{command.action}</p>
          {available && (
            <p className="mt-4 border-t border-white/8 pt-4 text-base font-semibold text-rose-200">
              Warning: {command.warning}
            </p>
          )}
          {origin === 'live' && (
            <p className="mt-4 border-t border-white/8 pt-4 text-xs leading-5 text-slate-400">
              Prediction from a baseline research artifact using live Open-Meteo features at these
              coordinates. It communicates assumptions and never guarantees safety — official
              hydrological and emergency-authority warnings take precedence.
            </p>
          )}
          {origin === 'demo' && (
            <p className="mt-3 text-xs text-slate-500">
              No confidence value is displayed because no model is connected; this assessment
              comes from deterministic backend demo logic.
            </p>
          )}
          {origin === 'unavailable' && (
            <div className="mt-4 space-y-2 border-t border-white/8 pt-4 text-xs leading-5 text-slate-400">
              {command.reason && <p>{REASON_TEXT[command.reason] ?? command.reason}</p>}
              <p>No risk score or risk level is shown because none could be produced — a missing live value is never replaced with a fabricated number.</p>
              {command.disclaimer && <p className="text-slate-500">{command.disclaimer}</p>}
            </div>
          )}
        </section>
      </div>

      <section className="panel mt-5 p-5">
        <p className="eyebrow">
          {origin === 'live' ? 'TOP CONTRIBUTING FACTORS · ML BASELINE' : origin === 'unavailable' ? 'WHY THE PREDICTION IS UNAVAILABLE' : 'CONTRIBUTING RISK FACTORS'}
        </p>
        {origin === 'live' && command.contributingFactors.length > 0 ? (
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              {command.contributingFactors.map((factor) => (
                <article key={factor.feature} className="border-l-2 border-rose-300/60 bg-black/10 p-4">
                  <p className="font-semibold text-white">{factor.feature}</p>
                  <p className="mt-1 text-sm text-slate-400">
                    {factor.value != null ? `${factor.value}${factor.unit ? ` ${factor.unit}` : ''}` : 'Unavailable'}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Learned importance {factor.importance.toFixed(4)}
                  </p>
                </article>
              ))}
            </div>
            {command.explanation && (
              <p className="max-w-4xl text-sm leading-7 text-slate-300">{command.explanation}</p>
            )}
            <p className="text-xs text-slate-500">
              Model version: {command.modelVersion ?? '—'} · {command.modelStatus}
            </p>
            {command.disclaimer && (
              <p className="text-xs leading-5 text-slate-500">Disclaimer: {command.disclaimer}</p>
            )}
          </div>
        ) : origin === 'unavailable' ? (
          <div className="mt-4 space-y-3">
            {command.reason && (
              <article className="border-l-2 border-slate-500/60 bg-black/10 p-4">
                <p className="font-semibold text-white">{command.reason}</p>
                <p className="mt-1 text-sm text-slate-400">{REASON_TEXT[command.reason] ?? command.reason}</p>
              </article>
            )}
            {command.missingFeatures.length > 0 && (
              <article className="border-l-2 border-slate-500/60 bg-black/10 p-4">
                <p className="font-semibold text-white">Missing live features</p>
                <ul className="mt-1 text-sm text-slate-400">
                  {command.missingFeatures.map((feature) => (
                    <li key={feature}>— {feature}</li>
                  ))}
                </ul>
              </article>
            )}
            {command.explanation && <p className="max-w-4xl text-sm leading-7 text-slate-300">{command.explanation}</p>}
            <p className="text-xs text-slate-500">
              No prediction was produced — no demo/scenario probability was substituted.
            </p>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {command.factors.map((factor) => (
              <article key={factor} className="border-l-2 border-rose-300/60 bg-black/10 p-4">
                <p className="font-semibold text-white">{factor}</p>
                <p className="mt-1 text-sm text-slate-400">
                  Identified by the {dataSource === 'api' ? 'backend' : 'demo'} scenario logic;
                  not generated by a real ML model.
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel mt-5 p-5">
        <p className="eyebrow">
          TERRAIN &amp; HYDROLOGY CONTEXT
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {terrainRows.map(([label, value]) => (
            <div key={label} className="border border-white/8 bg-white/[.025] p-4">
              <p className="flex items-center gap-1.5 text-xs text-slate-400">
                {label === 'Soil moisture' ? (
                  <Droplets size={13} className="text-mod-weather" />
                ) : (
                  <Mountain size={13} className="text-mod-terrain" />
                )}
                {label}
              </p>
              <p className="mt-2 text-xl font-bold text-white">{value}</p>
            </div>
          ))}
        </div>
      </section>

      {command.historical && (
        <section className="mt-5 rounded-2xl border border-command/10 bg-command/[.04] p-5">
          <p className="eyebrow">
            HISTORICAL FLOOD CONTEXT · RECORDED EVENTS
          </p>
          {command.historical.status === 'AVAILABLE' && command.historical.nearest ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <article className="border-l-2 border-command/60 bg-black/10 p-4">
                <p className="font-semibold text-white">
                  Nearest recorded event ≈ {formatRiverDistance(command.historical.nearest.distanceM)}
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-400">
                  {command.historical.nearest.cause || 'Cause not recorded'} · DFO severity{' '}
                  {formatSeverity(command.historical.nearest.severity)}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Event #{command.historical.nearest.reportNumber} · reported in{' '}
                  {command.historical.nearest.country || 'unknown country'}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {formatEventDates(command.historical.nearest)} · distance measured to the event's
                  anchor vertex (regional polygon), not local flood waters
                </p>
              </article>
              {command.historical.eventsNearby.length > 0 ? (
                <article className="border-l-2 border-command/40 bg-black/10 p-4">
                  <p className="font-semibold text-white">Also recorded nearby</p>
                  <ul className="mt-1 space-y-1 text-sm text-slate-400">
                    {command.historical.eventsNearby.map((event) => (
                      <li key={event.fid}>
                        Event #{event.reportNumber} · ~{formatRiverDistance(event.distanceM)} ·{' '}
                        {event.cause || '—'}
                      </li>
                    ))}
                  </ul>
                </article>
              ) : (
                <article className="border-l-2 border-command/40 bg-black/10 p-4">
                  <p className="font-semibold text-white">No other recorded events nearby</p>
                  <p className="mt-1 text-sm text-slate-400">
                    No further DFO event lies within the {radiusKm(command.historical.searchRadiusM)}{' '}
                    km search radius.
                  </p>
                </article>
              )}
            </div>
          ) : command.historical.status === 'AVAILABLE' ? (
            <p className="mt-4 border-l-2 border-command/40 bg-black/10 p-4 text-sm text-slate-300">
              No recorded DFO flood event lies within the{' '}
              {radiusKm(command.historical.searchRadiusM)} km search radius of these coordinates.
            </p>
          ) : (
            <p className="mt-4 border-l-2 border-slate-500/60 bg-black/10 p-4 text-sm text-slate-300">
              {command.historical.statusReason
                ? REASON_TEXT[command.historical.statusReason] ?? command.historical.statusReason
                : 'Historical flood intelligence is currently unavailable.'}
            </p>
          )}
          {command.historical.status === 'AVAILABLE' && command.historical.coverage && (
            <p className="mt-4 text-xs text-slate-500">
              Catalogue: {formatCount(command.historical.coverage.usableEventCount)} usable recorded
              floods · {command.historical.source ?? 'DFO'}{' '}
              {command.historical.coverage.startDate
                ? `· ${formatHistoryDate(command.historical.coverage.startDate)} to ${formatHistoryDate(command.historical.coverage.endDate)}`
                : ''}
            </p>
          )}
          {command.historical.polygonContainsLocation && command.historical.status === 'AVAILABLE' && (
            <p className="mt-2 text-xs leading-5 text-slate-500">
              These coordinates fall inside the mapped region of a recorded flood event. DFO
              polygons are broad regional outlines — containment does not mean the exact location
              flooded.
            </p>
          )}
          {command.historical.disclaimer && (
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {command.historical.disclaimer}
            </p>
          )}
        </section>
      )}
    </>
  )
}

function radiusKm(radiusM: number): number {
  return Math.max(1, Math.round(radiusM / 1000))
}