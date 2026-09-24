from typing import Literal

from pydantic import BaseModel, Field, field_validator

from .common import DemoMetadata

Scenario = Literal["normal", "heavy_rain", "extreme_rain", "critical_flood"]
RiskLevel = Literal["LOW", "MODERATE", "HIGH", "CRITICAL"]
HistoricalStatus = Literal["AVAILABLE", "UNAVAILABLE"]


class RiskAssessmentRequest(BaseModel):
    location_id: str
    scenario: Scenario
    # Arbitrary-coordinate support: latitude/longitude are optional but, when
    # supplied, must be valid WGS84 ranges (rejected with 422 otherwise). The
    # live ML pipeline accepts any in-range coordinate pair.
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    location_name: str | None = None
    # True only for an explicit simulation/demo scenario request: returns the
    # deterministic scenario fixture instead of the live ML pipeline.
    simulate: bool = False

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

    # Historical flood intelligence (Phase 3C). Always None for demo/scenario
    # results; populated only by the live risk pipeline from the local DFO
    # event index. Informational only — never an ML feature.
    historical: "HistoricalContext | None" = None


class CoverageInfo(BaseModel):
    start_date: str | None = None
    end_date: str | None = None
    event_count: int | None = None
    usable_event_count: int | None = None


class HistoricalEventBlock(BaseModel):
    fid: int
    report_number: str
    distance_m: int
    # Distances are from the query point to the recorded event's anchor vertex
    # (a boundary vertex representative of the flood polygon), never an exact
    # local-flooding distance.
    distance_basis: Literal["ANCHOR_VERTEX"] = "ANCHOR_VERTEX"
    # Anchor-vertex coordinates (WGS84) of the recorded flood polygon. Optional
    # so legacy/cached payloads without coordinates stay valid; the live
    # pipeline always supplies them from the DFO anchor index.
    latitude: float | None = None
    longitude: float | None = None
    begin_date: str | None = None
    end_date: str | None = None
    country: str = ""
    cause: str = ""
    severity: float | None = None
    flood_impact_index: float | None = None


class HistoricalContext(BaseModel):
    status: HistoricalStatus
    status_reason: str | None = None  # "INDEX_UNAVAILABLE" when status is UNAVAILABLE
    source: str | None = None
    coverage: CoverageInfo | None = None
    search_radius_m: int = 50_000
    distance_basis: Literal["ANCHOR_VERTEX"] = "ANCHOR_VERTEX"
    nearest: HistoricalEventBlock | None = None
    # Coarse point-in-polygon flag: DFO polygons are broad regional outlines,
    # so containment does not imply local flooding at the coordinates.
    polygon_contains_location: bool | None = None
    events_nearby: list[HistoricalEventBlock] = []
    disclaimer: str | None = None