from .common import DemoMetadata
from pydantic import BaseModel


class SafePlace(BaseModel):
    id: str
    name: str
    category: str
    distance_km: float
    elevation_m: int
    status: str
    accessibility: str
    latitude: float
    longitude: float
    recommendation: str = "Suggested lower-risk location; not guaranteed safe."
    data_status: str = "DEMO"


class SafePlacesResponse(DemoMetadata):
    location_id: str
    places: list[SafePlace]
