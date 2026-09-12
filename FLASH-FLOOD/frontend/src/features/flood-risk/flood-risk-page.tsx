import { Mountain, Droplets } from 'lucide-react'
import { PageHeader } from '../../components/layout/page-header'
import { useCommand } from '../command-center/command-context'
import { riskOrigin, riskStatusLabel, hasRisk } from '../../api/risk-api'
import { RiskGauge } from '../risk/risk-gauge'

const REASON_TEXT: Record<string, string> = {
  MODEL_UNAVAILABLE:
    'The ML model artifact could not be loaded on the server, so no prediction is possible.',
  DATA_INCOMPLETE:
    'Required live features could not be measured for these coordinates, so no prediction is possible.',
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
    ['River distance', fmtNum(command.terrain.riverDistance, ' m')],
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
  const headerTone = origin === 'live' ? 'emerald' : origin === 'unavailable' ? 'amber' : 'cyan'

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
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
            Updating risk assessment…
          </p>
        </div>
      )}
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <RiskGauge
          probability={command.probability}
          riskLevel={command.riskLevel}
          summary={gaugeSummary}
        />
        <section className="border border-rose-300/15 bg-rose-500/[.04] p-5">
          <p className="text-[11px] font-bold tracking-[.15em] text-slate-400">
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
              <p>No probability or risk level is shown because none could be produced — a missing live value is never replaced with a fabricated number.</p>
              {command.disclaimer && <p className="text-slate-500">{command.disclaimer}</p>}
            </div>
          )}
        </section>
      </div>

      <section className="mt-5 border border-white/8 bg-white/[.03] p-5">
        <p className="text-[11px] font-bold tracking-[.15em] text-slate-400">
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
              <article className="border-l-2 border-amber-300/60 bg-black/10 p-4">
                <p className="font-semibold text-white">{command.reason}</p>
                <p className="mt-1 text-sm text-slate-400">{REASON_TEXT[command.reason] ?? command.reason}</p>
              </article>
            )}
            {command.missingFeatures.length > 0 && (
              <article className="border-l-2 border-amber-300/60 bg-black/10 p-4">
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

      <section className="mt-5 border border-white/8 bg-white/[.03] p-5">
        <p className="text-[11px] font-bold tracking-[.15em] text-slate-400">
          TERRAIN &amp; HYDROLOGY CONTEXT
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {terrainRows.map(([label, value]) => (
            <div key={label} className="border border-white/8 bg-white/[.025] p-4">
              <p className="flex items-center gap-1.5 text-xs text-slate-400">
                {label === 'Soil moisture' ? (
                  <Droplets size={13} className="text-cyan-200" />
                ) : (
                  <Mountain size={13} className="text-cyan-200" />
                )}
                {label}
              </p>
              <p className="mt-2 text-xl font-bold text-white">{value}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}