import { DatabaseZap } from 'lucide-react'
export function DataStatusBadge({ label = 'DEMO / SIMULATION' }: { label?: string }) { return <span className="inline-flex items-center gap-1.5 rounded-md border border-cyan-300/25 bg-cyan-300/10 px-2 py-1 text-[10px] font-bold tracking-[.12em] text-cyan-100"><DatabaseZap size={12} />{label}</span> }
