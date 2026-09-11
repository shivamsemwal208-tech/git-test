import { CloudRain, Droplets, Mountain, Route, Triangle, Umbrella } from 'lucide-react'
import type { Metric } from '../types/risk'

const icons = { rain: Umbrella, 'cloud-rain': CloudRain, mountain: Mountain, triangle: Triangle, droplets: Droplets, route: Route }

export function MetricCard({ metric }: { metric: Metric }) {
  const Icon = icons[metric.icon]
  return <article className="rounded-2xl border border-white/8 bg-white/[0.035] p-4 transition hover:-translate-y-0.5 hover:border-white/15 hover:bg-white/[0.055]">
    <div className="mb-4 flex items-start justify-between"><div className="rounded-xl bg-cyan-300/10 p-2.5 text-cyan-200"><Icon size={19} /></div><span className="h-2 w-2 rounded-full bg-cyan-300/80" /></div>
    <p className="text-xs font-medium text-slate-400">{metric.label}</p>
    <p className="mt-1 text-xl font-bold tracking-tight text-white">{metric.value}</p>
    <p className="mt-1 text-[11px] text-slate-500">{metric.detail}</p>
  </article>
}
