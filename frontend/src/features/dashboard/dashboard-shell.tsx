import { useState } from "react";
import { MetricCard } from "../../components/metric-card";
import { AlertPanel } from "./alert-panel";
import { DashboardHeader } from "./dashboard-header";
import { ScenarioSelector } from "../demo/scenario-selector";
import { MapPlaceholder } from "../map/map-placeholder";
import { RiskFactors } from "../risk/risk-factors";
import { RiskGauge } from "../risk/risk-gauge";
import { useDemoAssessment } from "../../hooks/use-demo-assessment";
import { demoLocations } from "../../data/demo-locations";
import type { ScenarioId } from "../../types/risk";

function DashboardLoading() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#07151a] text-sm text-cyan-100">
      Loading simulated conditions…
    </div>
  );
}

function DashboardError({ message }: { message: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#07151a] p-6 text-center text-sm text-rose-100">
      {message}
    </div>
  );
}

export function DashboardShell() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>("critical-flood");

  const [locationId, setLocationId] = useState("dehradun");

  const location =
    demoLocations.find((item) => item.id === locationId) ?? demoLocations[0];

  const { assessment, isLoading, error } = useDemoAssessment(
    scenarioId,
    location,
  );

  if (!assessment && isLoading) return <DashboardLoading />;

  if (!assessment || error) {
    return (
      <DashboardError
        message={error ?? "No simulated assessment is available."}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[#07151a] text-white">
      <div className="mx-auto max-w-[1540px] px-4 py-5 sm:px-6 lg:px-8">
        <DashboardHeader
          locationId={locationId}
          onLocationChange={setLocationId}
        />

        <section className="mt-6">
          <ScenarioSelector
            activeScenario={scenarioId}
            onChange={setScenarioId}
          />
        </section>

        <section
          className={`mt-6 transition-opacity ${
            isLoading ? "opacity-55" : "opacity-100"
          }`}
          aria-busy={isLoading}
        >
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.16em] text-cyan-200">
                SITUATIONAL OVERVIEW
              </p>

              <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">
                {assessment.location}
              </h2>
            </div>

            <p className="text-xs text-slate-500">{assessment.updatedAt}</p>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.18fr_.82fr]">
            <div className="space-y-5">
              <RiskGauge
                probability={assessment.probability}
                riskLevel={assessment.riskLevel}
                summary={assessment.summary}
              />

              <div>
                <p className="mb-3 text-xs font-bold tracking-[0.15em] text-slate-400">
                  WEATHER & RAINFALL
                </p>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {assessment.weatherMetrics.map((metric) => (
                    <MetricCard key={metric.label} metric={metric} />
                  ))}
                </div>
              </div>

              <MapPlaceholder
                location={assessment.location}
                coordinates={assessment.coordinates}
              />
            </div>

            <div className="space-y-5">
              <AlertPanel
                level={assessment.riskLevel}
                title={assessment.warningTitle}
                action={assessment.warningAction}
              />

              <div>
                <p className="mb-3 text-xs font-bold tracking-[0.15em] text-slate-400">
                  TERRAIN & ENVIRONMENT
                </p>

                <div className="grid grid-cols-2 gap-3">
                  {assessment.terrainMetrics.map((metric) => (
                    <MetricCard key={metric.label} metric={metric} />
                  ))}
                </div>
              </div>

              <RiskFactors factors={assessment.riskFactors} />
            </div>
          </div>
        </section>

        <footer className="mt-8 border-t border-white/8 py-5 text-center text-[11px] leading-5 text-slate-500">
          FLASHGUARD DEMO INTERFACE · Simulated values only. This dashboard does
          not provide live weather data, ML predictions, or official emergency
          instructions.
        </footer>
      </div>
    </main>
  );
}
