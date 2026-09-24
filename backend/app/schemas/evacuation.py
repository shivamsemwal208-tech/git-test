from pydantic import BaseModel, field_validator
from .common import DemoMetadata
from .risk import Scenario


class EvacuationRequest(BaseModel):
    location_id: str
    destination_id: str
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


class EvacuationResponse(DemoMetadata):
    route_id: str
    destination_id: str
    route_status: str
    distance_km: float
    destination_elevation_m: int
    hazard_warning: str
    recommendation: str
    coordinates: list[list[float]]
    illustrative: bool = True
