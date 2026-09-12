"""Safe-place routes. Deterministic demo places via the demo service."""
from fastapi import APIRouter

from backend.app.services.demo_service import (
    arbitrary_location_id,
    arbitrary_metadata,
    get_location,
    is_predefined_location,
    metadata,
    safe_places,
)

router = APIRouter(prefix="/api/v1/safe-places", tags=["Safe Places"])


@router.get("")
def get_safe_places(
    location_id: str = "dehradun",
    latitude: float | None = None,
    longitude: float | None = None,
):
    if is_predefined_location(location_id):
        return metadata() | {
            "location_id": location_id,
            "places": safe_places(location_id),
        }
    if latitude is None or longitude is None:
        get_location(location_id)  # raises 404 for unknown IDs without coordinates
    return arbitrary_metadata() | {
        "location_id": arbitrary_location_id(latitude, longitude),
        "places": [],
    }