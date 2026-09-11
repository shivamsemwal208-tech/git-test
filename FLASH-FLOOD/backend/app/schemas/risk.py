from typing import Literal
from pydantic import BaseModel
from .common import DemoMetadata

Scenario = Literal["normal", "heavy_rain", "extreme_rain", "critical_flood"]
RiskLevel = Literal["LOW", "MODERATE", "HIGH", "CRITICAL"]


class RiskAssessmentRequest(BaseModel):
    location_id: str
    scenario: Scenario


class RiskAssessmentResponse(DemoMetadata):
    location_id: str
    scenario: Scenario
    scenario_label: str
    probability: int
    risk_level: RiskLevel
    factors: list[str]
    warning: str
    recommended_action: str
    terrain: dict[str, str | int]
    weather: dict[str, str | int | list[int]]
    model_status: str = "Not connected — demo scenario logic only"
