import { CloudRain } from 'lucide-react'

function barHeight(value: number, max: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return '8%'
  return `${Math.max(8, (value / max) * 105)}%`
}

export function RainfallChart({ values }: { values: number[] }) {
  const hasData = values.length > 0 && values.some((value) => value !== null)
  if (!hasData) {
    return (
      <div
        className="flex h-44 flex-col items-center justify-center gap-2 border-b border-l border-white/10 px-3 pb-2 pt-4"
        aria-label="Rainfall forecast chart"
      >
        <CloudRain size={20} className="text-slate-500" />
        <p className="text-xs font-semibold text-slate-400">No weather data available</p>
        <p className="px-6 text-center text-[10px] text-slate-500">
          Live weather could not be retrieved for these coordinates.
        </p>
      </div>
    )
  }
  const max = Math.max(...values.filter((value): value is number => value != null))
  return (
    <div
      className="flex h-44 items-end gap-2 border-b border-l border-white/10 px-3 pb-2 pt-4"
      aria-label="Rainfall forecast chart"
    >
      {values.map((value, index) => (
        <div key={index} className="group flex flex-1 flex-col items-center justify-end gap-2">
          <span className="invisible rounded bg-black px-1 text-[10px] group-hover:visible">{value} mm</span>
          <div
            style={{ height: barHeight(value, max) }}
            className="w-full rounded-t-md bg-gradient-to-t from-cyan-500/45 to-cyan-200"
          />
          <span className="text-[9px] text-slate-500">+{index + 1}h</span>
        </div>
      ))}
    </div>
  )
}