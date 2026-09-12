"""Evacuation routes. Deterministic demo route via the demo service."""
from fastapi import APIRouter, HTTPException

from backend.app.schemas.evacuation import EvacuationRequest
from backend.app.services.demo_service import (
    arbitrary_location_id,
    arbitrary_metadata,
    evacuation,
    find_location,
)

router = APIRouter(prefix="/api/v1/evacuation", tags=["Evacuation"])


@router.post("/assess")
def assess_evacuation(request: EvacuationRequest):
    location = find_location(request.location_id)

    if location is None:
        if request.latitude is None or request.longitude is None:
            raise HTTPException(status_code=404, detail=f"Unknown demo location: {request.location_id}")
        resolved_id = arbitrary_location_id(request.latitude, request.longitude)
        return arbitrary_metadata() | {
            "location_id": resolved_id,
            "route_id": "unavailable",
            "destination_id": request.destination_id,
            "route_status": "Unavailable",
            "distance_km": None,
            "destination_elevation_m": None,
            "hazard_warning": "No evacuation guidance is available for arbitrary coordinates. Follow official local instructions.",
            "recommendation": "Safe-place data unavailable for this location.",
            "coordinates": [[request.longitude, request.latitude]],
            "illustrative": True,
        }

    return evacuation(
        location_id=request.location_id,
        destination_id=request.destination_id,
        scenario=request.scenario,
    )