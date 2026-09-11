from pydantic import BaseModel
from .common import DemoMetadata


class SeismicResponse(DemoMetadata):
    location_id: str
    event_id: str
    magnitude: float
    depth_km: int
    distance_km: int
    event_time: str
    latitude: float
    longitude: float
    seismic_status: str
    note: str
    earthquake_prediction_provided: bool = False
    secondary_hazards: list[dict[str, str]]
