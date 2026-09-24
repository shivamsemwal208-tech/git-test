import {
  Bell,
  BrainCircuit,
  CloudRain,
  FlaskConical,
  HeartHandshake,
  History,
  Map,
  Monitor,
  RadioTower,
  Route,
  Satellite,
  Server,
  Waves,
  type LucideIcon,
} from 'lucide-react'
import { PageHeader } from '../../components/layout/page-header'
import { StatusChip, type StatusKind } from '../../components/status/status-chip'
import { useCommand } from '../command-center/command-context'

interface ServiceStatus {
  name: string
  description: string
  icon: LucideIcon
  iconClass: string
  chip: string
  chipKind: StatusKind
  tier: string
}

const SERVICES: ServiceStatus[] = [
  {
    name: 'Frontend',
    description:
      'React + Vite application — command center, Live Map, risk dashboards, alert and simulation interfaces.',
    icon: Monitor,
    iconClass: 'bg-command/10 text-command',
    chip: 'Operational',
    chipKind: 'OPERATIONAL',
    tier: 'Core infrastructure',
  },
  {
    name: 'Backend API',
    description:
      'FastAPI v1.0.0 service at /api/v1 serving risk, weather, seismic, rivers and safe-place endpoints with CORS enabled for the local frontend.',
    icon: Server,
    iconClass: 'bg-command/10 text-command',
    chip: 'Operational · Integrated',
    chipKind: 'OPERATIONAL',
    tier: 'Core infrastructure',
  },
  {
    name: 'Flood risk model',
    description:
      'Random Forest baseline (rf_calibrated_baseline_v1) scored from live environmental features. Reports an honest “unavailable” when required features are missing — a research baseline, not a certified forecast.',
    icon: BrainCircuit,
    iconClass: 'bg-command/10 text-command',
    chip: 'Integrated',
    chipKind: 'INTEGRATED',
    tier: 'Core infrastructure',
  },
  {
    name: 'Weather',
    description:
      'Real-time conditions from the Open-Meteo provider with deterministic demo scenario fixtures kept separate for simulation mode.',
    icon: CloudRain,
    iconClass: 'bg-sky-400/10 text-sky-300',
    chip: 'Integrated',
    chipKind: 'INTEGRATED',
    tier: 'Live data integration',
  },
  {
    name: 'Seismic monitoring',
    description:
      'Monitored event data from the USGS feed shown on the map and watch surfaces. FlashGuard does not predict earthquakes — monitoring only.',
    icon: RadioTower,
    iconClass: 'bg-command/10 text-command',
    chip: 'Integrated · Monitoring',
    chipKind: 'MONITORING',
    tier: 'Live data integration',
  },
  {
    name: 'Historical flood records',
    description:
      'Local DFO Global Flood Records index (informational only). Recorded events inform context and are never an ML feature and never change a prediction.',
    icon: History,
    iconClass: 'bg-command/10 text-command',
    chip: 'Integrated',
    chipKind: 'INTEGRATED',
    tier: 'Live data integration',
  },
  {
    name: 'River geometry',
    description:
      'Local HydroRIVERS v1.0 index rendering real mapped segments on the Live Map. Informational only — never an ML feature.',
    icon: Waves,
    iconClass: 'bg-command/10 text-command',
    chip: 'Integrated · Local index',
    chipKind: 'INTEGRATED',
    tier: 'Live data integration',
  },
  {
    name: 'Safe places',
    description:
      'Candidate emergency destinations discovered live on OpenStreetMap via the Overpass API. Candidates only — never certified safe sites.',
    icon: HeartHandshake,
    iconClass: 'bg-emerald-400/10 text-emerald-300',
    chip: 'Provider dependent',
    chipKind: 'PROVIDER_DEPENDENT',
    tier: 'Provider-dependent',
  },
  {
    name: 'Satellite & terrain',
    description:
      'Workspace prepared for remote-sensing integration. No live imagery or flood extent is connected — terrain context comes from the feature pipeline.',
    icon: Satellite,
    iconClass: 'bg-command/10 text-command',
    chip: 'Demo / Unavailable',
    chipKind: 'DEMO',
    tier: 'Planned / demo',
  },
  {
    name: 'Evacuation routes',
    description:
      'Illustrative lower-risk route service shared by Emergency Mode and Evacuation. Not a routing engine and not guaranteed safe.',
    icon: Route,
    iconClass: 'bg-command/10 text-command',
    chip: 'Demo',
    chipKind: 'DEMO',
    tier: 'Planned / demo',
  },
  {
    name: 'Alerts / notifications',
    description:
      'Frontend alert center with severity ordering and recommended actions. Interface only — no SMS, email, or push delivery.',
    icon: Bell,
    iconClass: 'bg-command/10 text-command',
    chip: 'Interface & demo',
    chipKind: 'DEMO',
    tier: 'Planned / demo',
  },
  {
    name: 'Simulation',
    description:
      'Deterministic demo scenarios that drive risk, weather, map and alert surfaces for built-in locations. Always labelled DEMO / SIMULATION.',
    icon: FlaskConical,
    iconClass: 'bg-command/10 text-command',
    chip: 'Demo',
    chipKind: 'DEMO',
    tier: 'Planned / demo',
  },
]

const BOUNDARIES = [
  'No accuracy percentages, certified warnings, or live government feeds are claimed.',
  'Demo and live values are always labelled by their own source and are never mixed.',
  'Live data appears when the local backend and its providers are reachable.',
  'Earthquake prediction is not provided — seismic surfaces are monitoring and awareness only.',
  'Safe places and routes are candidate/illustrative and are never guaranteed safe.',
]

function SummaryTile({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub: string
}) {
  const dot = 'bg-command'
  return (
    <div className="panel hover-lift flex flex-col gap-2 p-4">
      <p className="eyebrow">{label}</p>
      <p className={`tabular text-xl font-bold text-white`}>
        <span className={`mr-2 inline-block h-2 w-2 rounded-full align-middle ${dot}`} aria-hidden />
        {value}
      </p>
      <p className="text-[11px] leading-4 text-slate-500">{sub}</p>
    </div>
  )
}

export function AboutPage() {
  const { weather, riskOrigin } = useCommand()
  const risk = riskOrigin
  const originChip: { label: string; kind: StatusKind } =
    risk === 'live'
      ? { label: 'Live ML pipeline', kind: 'OPERATIONAL' }
      : risk === 'unavailable'
        ? { label: 'Live · Unavailable', kind: 'UNAVAILABLE' }
        : { label: 'Demo / simulation', kind: 'DEMO' }
  const weatherLive = weather.current?.status === 'LIVE'

  return (
    <>
      <PageHeader
        eyebrow="SYSTEM STATUS"
        title="Platform health & integration readiness"
        description="FlashGuard is a decision-support prototype. This operator view reports what is built and integrated today across the frontend, backend and data layers — it is not a claim of production or certified warning capability."
        statusLabel="INTEGRATION READINESS"
        statusTone="cyan"
      />

      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <StatusChip kind={originChip.kind} label={originChip.label} />
        <StatusChip
          kind={weatherLive ? 'OPERATIONAL' : 'PROVIDER_DEPENDENT'}
          label={weatherLive ? 'Live weather reachable now' : 'Live weather when reachable'}
        />
        <span className="text-[11px] text-slate-500">
          Reported from the actual repository implementation and the current session state.
        </span>
      </div>

      {/* ── Summary strip ─────────────────────────────────────────────────── */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile label="Frontend" value="Operational" sub="React + Vite · 12 routed surfaces" />
        <SummaryTile label="Backend API" value="Operational · Integrated" sub="FastAPI v1.0.0 · /api/v1" />
        <SummaryTile
          label="Data sources"
          value="3 live + 2 local"
          sub="Open-Meteo · USGS · Overpass · DFO index · HydroRIVERS"
        />
        <SummaryTile
          label="Flood model"
          value="ML baseline integrated"
          sub="rf_calibrated_baseline_v1 · honest unavailable states"
        />
      </section>

      {/* ── Service grid ──────────────────────────────────────────────────── */}
      <section className="mt-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="eyebrow-command">Service registry</p>
          <p className="text-[11px] text-slate-500">{SERVICES.length} components</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {SERVICES.map((service) => (
            <article key={service.name} className="panel hover-lift group p-4">
              <div className="flex items-start justify-between gap-3">
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${service.iconClass}`}
                >
                  <service.icon size={17} />
                </span>
                <StatusChip label={service.chip} kind={service.chipKind} />
              </div>
              <h3 className="mt-3 text-sm font-bold text-white">{service.name}</h3>
              <p className="mt-1 text-[11px] leading-5 text-slate-400">{service.description}</p>
              <p className="mt-3 border-t border-white/[0.07] pt-2 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
                {service.tier}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* ── Boundaries ────────────────────────────────────────────────────── */}
      <section className="panel mt-5 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Map size={14} className="text-command-soft" />
          <p className="eyebrow-command">Coming from a prototype — honest boundaries</p>
        </div>
        <ul className="mt-3 grid gap-2 text-xs leading-5 text-slate-400 md:grid-cols-2">
          {BOUNDARIES.map((item) => (
            <li key={item} className="flex gap-2.5">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-command/60" />
              {item}
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}