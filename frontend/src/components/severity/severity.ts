import type { RiskLevel } from '../../types/risk'

export type SeverityKey = RiskLevel | 'UNAVAILABLE'

/**
 * Single source of truth for risk/severity presentation across the app.
 * Pure Tailwind class fragments — never inline hex cabinets per page.
 */
export const SEVERITY: Record<
  SeverityKey,
  {
    label: string
    text: string
    chip: string
    accent: string
    bar: string
    dot: string
    hex: string
  }
> = {
  LOW: {
    label: 'LOW',
    text: 'text-sev-low-soft',
    chip: 'border-sev-low/45 bg-sev-low/15 text-sev-low-soft',
    accent: 'border-l-sev-low/70 bg-sev-low/[0.06]',
    bar: 'bg-sev-low',
    dot: 'bg-sev-low',
    hex: '#7d8ea0',
  },
  MODERATE: {
    label: 'MODERATE',
    text: 'text-sev-mod-soft',
    chip: 'border-sev-mod/45 bg-sev-mod/15 text-sev-mod-soft',
    accent: 'border-l-sev-mod bg-sev-mod/[0.07]',
    bar: 'bg-sev-mod',
    dot: 'bg-sev-mod',
    hex: '#5b8db4',
  },
  HIGH: {
    label: 'HIGH',
    text: 'text-sev-high-soft',
    chip: 'border-sev-high/50 bg-sev-high/15 text-sev-high-soft',
    accent: 'border-l-sev-high bg-sev-high/[0.08]',
    bar: 'bg-sev-high',
    dot: 'bg-sev-high',
    hex: '#cf6f53',
  },
  CRITICAL: {
    label: 'CRITICAL',
    text: 'text-sev-crit-soft',
    chip: 'border-sev-crit/55 bg-sev-crit/15 text-sev-crit-soft',
    accent: 'border-l-sev-crit bg-sev-crit/[0.09]',
    bar: 'bg-sev-crit',
    dot: 'bg-sev-crit',
    hex: '#e0455e',
  },
  UNAVAILABLE: {
    label: 'UNAVAILABLE',
    text: 'text-slate-300',
    chip: 'border-white/12 bg-white/[0.05] text-slate-300',
    accent: 'border-l-slate-500/60 bg-white/[0.02]',
    bar: 'bg-slate-500',
    dot: 'bg-slate-400',
    hex: '#64748b',
  },
}

export function severity(level: RiskLevel | null): (typeof SEVERITY)[SeverityKey] {
  return SEVERITY[level ?? 'UNAVAILABLE']
}