from fastapi import APIRouter

from backend.app.services.demo_service import LOCATIONS

router = APIRouter(prefix="/api/v1/locations", tags=["Locations"])


@router.get("")
def get_locations():
    return {
        "data_status": "DEMO",
        "locations": LOCATIONS,
    }