import { ArrowUpRight, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

type Accent = 'command' | 'safe' | 'danger'

const ACCENTS: Record<Accent, { icon: string; bar: string; hover: string }> = {
  command: {
    icon: 'bg-command/10 text-command',
    bar: 'group-hover:bg-command',
    hover: 'hover:border-command/30',
  },
  safe: {
    icon: 'bg-emerald-400/10 text-safe',
    bar: 'group-hover:bg-safe',
    hover: 'hover:border-emerald-400/30',
  },
  danger: {
    icon: 'bg-rose-500/10 text-danger',
    bar: 'group-hover:bg-danger',
    hover: 'hover:border-rose-300/30',
  },
}

export function ModuleCard({
  to,
  icon: Icon,
  title,
  tagline,
  accent = 'command',
}: {
  to: string
  icon: LucideIcon
  title: string
  tagline: string
  accent?: Accent
}) {
  const theme = ACCENTS[accent]
  return (
    <Link
      to={to}
      className={`group relative overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 transition hover:-translate-y-0.5 hover:bg-white/[0.055] ${theme.hover}`}
    >
      <span className={`absolute inset-x-0 top-0 h-0.5 bg-white/[0.08] transition ${theme.bar}`} />
      <div className="flex items-start justify-between gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${theme.icon}`}>
          <Icon size={17} />
        </span>
        <ArrowUpRight
          size={15}
          className="mt-1 shrink-0 text-slate-500 transition group-hover:text-slate-200"
        />
      </div>
      <h3 className="mt-3 text-sm font-bold text-white">{title}</h3>
      <p className="mt-1 text-[11px] leading-4 text-slate-400">{tagline}</p>
    </Link>
  )
}