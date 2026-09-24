import { Bell, ShieldCheck } from "lucide-react";
import { StatusBadge } from "../../components/status-badge";

interface DashboardHeaderProps {
  locationId: string;
  onLocationChange: (locationId: string) => void;
}

const locations = [
  { id: "dehradun", name: "Dehradun, Uttarakhand" },
  { id: "mussoorie", name: "Mussoorie, Uttarakhand" },
  { id: "rishikesh", name: "Rishikesh, Uttarakhand" },
  { id: "joshimath", name: "Joshimath, Uttarakhand" },
  { id: "chamoli", name: "Chamoli, Uttarakhand" },
  { id: "srinagar", name: "Srinagar, Uttarakhand" },
  { id: "rudraprayag", name: "Rudraprayag, Uttarakhand" },
  { id: "uttarkashi", name: "Uttarkashi, Uttarakhand" },
  { id: "nainital", name: "Nainital, Uttarakhand" },
];

export function DashboardHeader({
  locationId,
  onLocationChange,
}: DashboardHeaderProps) {
  return (
    <header className="flex flex-col gap-5 border-b border-white/8 pb-6 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-cyan-200 to-teal-500 text-[#062125] shadow-lg shadow-cyan-950/40">
          <ShieldCheck size={24} strokeWidth={2.5} />
        </div>

        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black tracking-tight text-white">
              FLASHGUARD
            </h1>
            <span className="hidden text-[10px] font-bold tracking-[0.18em] text-cyan-200 sm:inline">
              COMMAND CENTER
            </span>
          </div>

          <p className="mt-0.5 text-xs text-slate-400">
            AI-powered flash-flood early warning system
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge />

        <label className="sr-only" htmlFor="demo-location">
          Demo location
        </label>

        <select
          id="demo-location"
          value={locationId}
          onChange={(event) => onLocationChange(event.target.value)}
          className="rounded-xl border border-white/10 bg-[#0b2025] px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-cyan-200/60"
        >
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>

        <button
          aria-label="Notifications"
          type="button"
          className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.035] text-slate-300 transition hover:bg-white/[0.08]"
        >
          <Bell size={17} />
        </button>
      </div>
    </header>
  );
}
