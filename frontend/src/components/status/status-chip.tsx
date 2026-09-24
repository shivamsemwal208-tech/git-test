import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleX,
  FlaskConical,
  Loader2,
  Plug,
  Radio,
  Siren,
  Wifi,
} from 'lucide-react'

export type StatusKind =
  | 'NORMAL'
  | 'WATCH'
  | 'WARNING'
  | 'CRITICAL'
  | 'AVAILABLE'
  | 'UNAVAILABLE'
  | 'LOADING'
  | 'ERROR'
  | 'OPERATIONAL'
  | 'INTEGRATED'
  | 'MONITORING'
  | 'PROVIDER_DEPENDENT'
  | 'DEMO'

const STYLES: Record<
  StatusKind,
  { icon: typeof CheckCircle2; chip: string; spin?: boolean }
> = {
  NORMAL: { icon: CheckCircle2, chip: 'border-sev-low/45 bg-sev-low/15 text-sev-low-soft' },
  WATCH: { icon: Radio, chip: 'border-sev-mod/45 bg-sev-mod/15 text-sev-mod-soft' },
  WARNING: { icon: AlertTriangle, chip: 'border-sev-high/50 bg-sev-high/15 text-sev-high-soft' },
  CRITICAL: { icon: Siren, chip: 'border-sev-crit/55 bg-sev-crit/15 text-sev-crit-soft' },
  AVAILABLE: { icon: CheckCircle2, chip: 'border-sev-low/45 bg-sev-low/15 text-sev-low-soft' },
  UNAVAILABLE: { icon: Ban, chip: 'border-white/12 bg-white/[0.04] text-slate-300' },
  LOADING: { icon: Loader2, chip: 'border-command/25 bg-command/10 text-command-soft', spin: true },
  ERROR: { icon: CircleX, chip: 'border-sev-crit/45 bg-sev-crit/10 text-sev-crit-soft' },
  OPERATIONAL: { icon: CheckCircle2, chip: 'border-sev-low/45 bg-sev-low/15 text-sev-low-soft' },
  INTEGRATED: { icon: Plug, chip: 'border-command/30 bg-command/10 text-command-soft' },
  MONITORING: { icon: Radio, chip: 'border-sev-mod/45 bg-sev-mod/15 text-sev-mod-soft' },
  PROVIDER_DEPENDENT: { icon: Wifi, chip: 'border-command/25 bg-command/[0.09] text-command-soft' },
  DEMO: { icon: FlaskConical, chip: 'border-white/12 bg-white/[0.05] text-slate-300' },
}

export function StatusChip({ label, kind = 'UNAVAILABLE' }: { label: string; kind?: StatusKind }) {
  const style = STYLES[kind]
  const Icon = style.icon
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.11em] ${style.chip}`}
    >
      <Icon size={11} className={style.spin ? 'animate-spin' : ''} />
      {label}
    </span>
  )
}