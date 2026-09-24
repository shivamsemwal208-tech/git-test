"""Alert routes. Deterministic demo alerts via the demo service."""
from fastapi import APIRouter

from backend.app.services.demo_service import (
    arbitrary_location_id,
    arbitrary_metadata,
    alerts,
    get_location,
    is_predefined_location,
    metadata,
)

router = APIRouter(prefix="/api/v1/alerts", tags=["Alerts"])


@router.get("")
def get_alerts(
    location_id: str = "dehradun",
    scenario: str = "critical_flood",
    latitude: float | None = None,
    longitude: float | None = None,
):
    if is_predefined_location(location_id):
        return metadata() | {
            "location_id": location_id,
            "alerts": alerts(location_id, scenario),
        }
    if latitude is None or longitude is None:
        get_location(location_id)  # raises 404 for unknown IDs without coordinates
    return arbitrary_metadata() | {
        "location_id": arbitrary_location_id(latitude, longitude),
        "alerts": [],
    }