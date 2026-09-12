from typing import Literal

from pydantic import BaseModel, field_validator

from .common import DemoMetadata

Scenario = Literal["normal", "heavy_rain", "extreme_rain", "critical_flood"]
RiskLevel = Literal["LOW", "MODERATE", "HIGH", "CRITICAL"]


class RiskAssessmentRequest(BaseModel):
    location_id: str
    scenario: Scenario
    latitude: float | None = None
    longitude: float | None = None
    location_name: str | None = None

    @field_validator("scenario", mode="before")
    @classmethod
    def normalize_scenario(cls, value):
        if isinstance(value, str):
            return value.replace("-", "_")
        return value


class RiskAssessmentResponse(DemoMetadata):
    location_id: str
    scenario: Scenario
    scenario_label: str
    # int for demo scenarios; calibrated float 0-100 for live ML predictions;
    # None when a live ML prediction is honestly unavailable.
    probability: float | None = None
    risk_level: RiskLevel | None = None
    factors: list[str] = []
    warning: str
    recommended_action: str
    terrain: dict[str, str | int | float | None]
    weather: dict[str, str | int | float | list[float] | None]
    model_status: str = "Not connected — demo scenario logic only"

    # Live ML prediction fields (added in Phase 7; None/absent for demo results).
    prediction_status: str | None = None  # "PREDICTION" | "UNAVAILABLE" for live ML
    reason: str | None = None  # "MODEL_UNAVAILABLE" | "DATA_INCOMPLETE"
    missing_features: list[str] | None = None
    model_version: str | None = None
    contributing_factors: list[dict] | None = None
    explanation: str | None = None