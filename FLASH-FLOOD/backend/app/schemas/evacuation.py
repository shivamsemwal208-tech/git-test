from pydantic import BaseModel
from .common import DemoMetadata
from .risk import Scenario


class EvacuationRequest(BaseModel):
    location_id: str
    destination_id: str
    scenario: Scenario


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
