import type { DemoAssessment, ScenarioId } from "../types/risk";

const API_BASE_URL = "http://127.0.0.1:8000";

export async function getDemoAssessment(
  scenarioId: ScenarioId,
  locationId = "dehradun",
): Promise<DemoAssessment> {
  const response = await fetch(`${API_BASE_URL}/api/v1/risk/assess`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      location_id: locationId,
      scenario: scenarioId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Risk API failed: ${response.status}`);
  }

  return response.json();
}
