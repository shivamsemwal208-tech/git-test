import { useEffect, useState } from "react";
import { getDemoAssessment } from "../api/risk-api";
import type { DemoAssessment, ScenarioId } from "../types/risk";
import type { DemoLocation } from "../types/location";

interface DemoAssessmentState {
  assessment: DemoAssessment | null;
  isLoading: boolean;
  error: string | null;
}

export function useDemoAssessment(
  scenarioId: ScenarioId,
  location: DemoLocation,
): DemoAssessmentState {
  const [state, setState] = useState<DemoAssessmentState>({
    assessment: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    let active = true;

    const loadingTimer = window.setTimeout(() => {
      if (active) {
        setState((current) => ({
          ...current,
          isLoading: true,
          error: null,
        }));
      }
    }, 0);

    getDemoAssessment(scenarioId, location)
      .then((assessment) => {
        if (active) {
          setState({
            assessment,
            isLoading: false,
            error: null,
          });
        }
      })
      .catch(() => {
        if (active) {
          setState({
            assessment: null,
            isLoading: false,
            error: "The risk assessment could not be loaded.",
          });
        }
      });

    return () => {
      active = false;
      window.clearTimeout(loadingTimer);
    };
  }, [scenarioId, location]);

  return state;
}
