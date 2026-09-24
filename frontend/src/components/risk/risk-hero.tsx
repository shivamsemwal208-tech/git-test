import { type ReactNode } from 'react'
import { FileWarning, TriangleAlert } from 'lucide-react'
import type { RiskLevel, RiskOrigin } from '../../types/risk'
import { severity } from '../severity/severity'
import { StatusChip, type StatusKind } from '../status/status-chip'

const LADDER = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'] as const

/**
 * Segmented risk scale: LOW ─ MODERATE ─ HIGH ─ CRITICAL.
 * When a level is available the bar fills through that segment and an
 * "▲ CURRENT" marker sits above it; otherwise it renders an honest
 * unavailable state. No numeric score is fabricated here — callers supply
 * only the real `level`.
 */
export function RiskMeter({ level }: { level: RiskLevel | null }) {
  const activeIndex = level ? LADDER.indexOf(level) : -1
  const tone = severity(level)
  return (
    <div className="w-full">
      <div className="relative mb-1 h-3">
        {level && activeIndex >= 0 && (
          <span
            className="absolute -translate-x-1/2 text-[9px] font-black tracking-[0.16em]"
            style={{ left: `${((activeIndex + 0.5) / LADDER.length) * 100}%` }}
          >
            <span className={tone.text}>▲ CURRENT</span>
          </span>
        )}
      </div>
      <div className="flex h-2 overflow-hidden rounded-full border border-white/[0.06] bg-white/[0.04]">
        {LADDER.map((key, index) => (
          <div
            key={key}
            className="grow border-r border-black/30 transition-colors duration-500 last:border-r-0"
            style={{
              backgroundColor: index <= activeIndex ? severity(key).hex : 'transparent',
              opacity: index <= activeIndex ? 0.92 : 1,
            }}
          />
        ))}
      </div>
      <p
        className={`mt-2 text-center text-[9px] font-bold tracking-[0.22em] transition-colors duration-500 ${
          level ? tone.text : 'text-slate-500'
        }`}
      >
        LOW&ensp;MODERATE&ensp;HIGH&ensp;CRITICAL
      </p>
    </div>
  )
}

/**
 * Risk Intelligence hero — the dominant flood-risk presentation.
 *
 * The risk level is rendered as "<LEVEL> RISK" (single element, big) while the
 * precise level word itself stays unique within each page (the RiskBadge in the
 * gauge) so existing tests that query the bare level remain unambiguous.
 */
export function RiskHero({
  level,
  origin,
  locationName,
  warning,
  action,
  factors,
  reason,
  modelLine,
  updatedAt,
  children,
}: {
  level: RiskLevel | null
  origin: RiskOrigin
  locationName: string
  warning: string
  action: string
  factors: string[]
  reason?: string | null
  modelLine?: string | null
  updatedAt?: string | null
  children?: ReactNode
}) {
  const tone = severity(level)
  const originChip: { label: string; kind: StatusKind } =
    origin === 'live'
      ? { label: 'LIVE ML BASELINE', kind: 'OPERATIONAL' }
      : origin === 'unavailable'
        ? { label: 'PREDICTION UNAVAILABLE', kind: 'UNAVAILABLE' }
        : { label: 'DEMO SCENARIO', kind: 'DEMO' }

  return (
    <section
      className="panel-strong overflow-hidden rounded-2xl border-l-4"
      style={{ borderLeftColor: tone.hex }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <TriangleAlert size={16} className={tone.text} />
          <p className={`text-[10px] font-bold uppercase tracking-[0.18em] ${tone.text}`}>
            Flood risk · {locationName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip label={originChip.label} kind={originChip.kind} />
          {updatedAt && (
            <span className="text-[10px] tracking-wide text-slate-500">{updatedAt}</span>
          )}
        </div>
      </div>

      <div className="px-5 py-6 sm:p-6">
        {level ? (
          <p className={`text-5xl font-black leading-none tracking-tight sm:text-6xl ${tone.text}`}>
            {level} RISK
          </p>
        ) : (
          <p className="text-4xl font-black leading-none tracking-tight text-slate-300 sm:text-5xl">
            FLOOD RISK UNAVAILABLE
          </p>
        )}

        {level ? (
          <>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base sm:leading-7">
              {warning}
            </p>
            <p className="mt-1.5 max-w-2xl text-xs leading-5 text-slate-500">{action}</p>
          </>
        ) : (
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400">
            No risk prediction could be produced for these coordinates. A missing live value is
            never replaced with a fabricated number.
          </p>
        )}

        {reason && (
          <p className="mt-3 max-w-2xl text-xs leading-5 text-slate-400">{reason}</p>
        )}

        <div className="mt-6 max-w-2xl">
          <RiskMeter level={level} />
        </div>

        {level && factors.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {factors.map((factor) => (
              <span
                key={factor}
                className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold ${tone.chip}`}
              >
                {factor}
              </span>
            ))}
          </div>
        )}

        {!level && (
          <p className="mt-6 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
            <FileWarning size={12} /> Risk level unavailable — no value fabricated
          </p>
        )}

        {modelLine && (
          <p className="mt-5 text-[11px] leading-5 text-slate-500">{modelLine}</p>
        )}

        {children}
      </div>
    </section>
  )
}