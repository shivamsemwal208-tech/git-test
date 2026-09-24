"""River geometry routes — real HydroRIVERS v1.0-backed nearby segments.

A small read-only endpoint that surfaces the real mapped river geometry
already used for ``terrain.river_distance`` (same local index, HydroRIVERS
v1.0) so the live map can draw the actual river lines near the selected
location instead of fabricating a corridor. Honest-unavailable semantics:
missing/unreadable index returns ``status: "UNAVAILABLE"`` with empty
segments — never invented geometry.
"""
from fastapi import APIRouter, Query

from backend.app.data_sources import river_provider
from backend.app.services.demo_service import (
    arbitrary_location_id,
    get_location,
    is_predefined_location,
)

router = APIRouter(prefix="/api/v1/rivers", tags=["Rivers"])

SOURCE = "HydroRIVERS v1.0 (HydroSHEDS), global river network, WGS84"
DISCLAIMER = (
    "Segments are real mapped river lines from the local HydroRIVERS v1.0 "
    "index (WGS84). The index covers mapped streams only and may miss "
    "seasonal or smaller watercourses; no geometry is fabricated. Distances "
    "or absence of a line are never evidence of safety."
)
_UNAVAILABLE_DISCLAIMER = (
    "The local river index is missing or unreadable, so river geometry is "
    "unavailable. No demo or fabricated geometry was produced."
)


@router.get("/nearby")
def nearby_river_segments(
    location_id: str = "dehradun",
    latitude: float | None = Query(default=None, ge=-90, le=90),
    longitude: float | None = Query(default=None, ge=-180, le=180),
    radius_m: float = Query(default=12_000, ge=100, le=50_000),
    max_segments: int = Query(default=1500, ge=1, le=5000),
):
    """Real river segments within ``radius_m`` of a location or coordinate pair."""
    if is_predefined_location(location_id):
        location = get_location(location_id)
        lat, lon, resolved_id = (
            location["latitude"],
            location["longitude"],
            location["id"],
        )
    else:
        if latitude is None or longitude is None:
            get_location(location_id)  # raises 404 for unknown IDs without coordinates
        lat, lon = latitude, longitude
        resolved_id = arbitrary_location_id(latitude, longitude)

    result = river_provider.fetch_nearby_segments(
        lat, lon, radius_m=radius_m, max_rows=max_segments
    )
    base = {
        "location_id": resolved_id,
        "latitude": round(lat, 5),
        "longitude": round(lon, 5),
        "radius_m": int(radius_m),
    }
    if result is None:
        return base | {
            "status": "UNAVAILABLE",
            "status_reason": "INDEX_UNAVAILABLE",
            "source": None,
            "n_segments": 0,
            "truncated": False,
            "segments": [],
            "data_status": "UNAVAILABLE",
            "disclaimer": _UNAVAILABLE_DISCLAIMER,
        }
    segments, truncated = result
    return base | {
        "status": "AVAILABLE",
        "status_reason": None,
        "source": SOURCE,
        "n_segments": len(segments),
        "truncated": truncated,
        "segments": segments,
        "data_status": "LIVE",
        "disclaimer": DISCLAIMER,
    }