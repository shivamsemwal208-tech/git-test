"""Real emergency-destination routes — OpenStreetMap-backed nearby places.

Surfaces real candidate emergency/public destinations near the selected
location (or arbitrary coordinates) discovered from the live OpenStreetMap
database via the public Overpass API. Honest-unavailable semantics mirror the
river endpoint: an unreachable/rate-limited/malformed provider returns
``status: "UNAVAILABLE"`` with an empty ``places`` list and an explanatory
reason — never a fabricated list of destinations.

Every result is a *potential* destination: OpenStreetMap does not certify any
place as a flood shelter, so the endpoint never claims a place is safe or
officially designated. Elevation and mapped-river proximity are best-effort
enrichments from the existing providers and are left ``null`` when unavailable
(never invented).
"""
from fastapi import APIRouter, Query

from backend.app.data_sources import elevation_provider, river_provider
from backend.app.data_sources import safe_place_provider
from backend.app.services.demo_service import (
    arbitrary_location_id,
    get_location,
    is_predefined_location,
)

router = APIRouter(prefix="/api/v1/safe-places", tags=["Safe Places"])

SOURCE = "OpenStreetMap via Overpass API (https://overpass-api.de)"
ELEVATION_SOURCE = "Open-Meteo elevation API"
RIVER_SOURCE = "HydroRIVERS v1.0"

DEFAULT_RADIUS_M = 5_000
ENRICH_LIMIT = 20  # best-effort elevation/river enrichment cap per request

DISCLAIMER = (
    "Potential emergency destinations sourced from OpenStreetMap — candidate "
    "destinations only, not officially certified flood shelters. Verify local "
    "authority guidance before evacuation: flood conditions, road closures, "
    "landslides and official instructions can change whether a destination is "
    "actually reachable or safe."
)
_UNAVAILABLE_DISCLAIMER = (
    "The OpenStreetMap place provider could not be reached (network failure, "
    "provider unavailable or rate-limited). No candidate destinations are "
    "shown; no fabricated list was produced."
)
RANKING_NOTE = (
    "Ordered by emergency-destination priority (hospitals, clinics, fire and "
    "police stations first; schools and community centres second), then by "
    "distance from the selected location. "
    + DISCLAIMER
)


def _safe_elevation(latitude: float, longitude: float) -> float | None:
    """Best-effort elevation lookup that never raises for a missing answer."""
    try:
        return elevation_provider.fetch_elevation(latitude, longitude)
    except elevation_provider.ProviderError:
        return None


def _safe_river_distance(latitude: float, longitude: float) -> int | None:
    """Best-effort mapped-river distance lookup that never raises."""
    try:
        return river_provider.fetch_nearest_river_distance(latitude, longitude)
    except river_provider.ProviderError:
        return None


def _enrich_places(ranked: list[dict], latitude: float, longitude: float) -> tuple[float | None, list[dict]]:
    """Attach best-effort elevation + mapped-river info to the ranked places.

    Only the first ``ENRICH_LIMIT`` ranked places are enriched so one radius
    query stays cheap; every enrichment is optional and ``null`` when its
    provider is unavailable. Returns ``(selected_elevation_m, enriched_places)``.
    """
    selected_elevation = _safe_elevation(latitude, longitude)
    enriched: list[dict] = []
    for place in ranked:
        entry = dict(place)
        if len(enriched) < ENRICH_LIMIT:
            elevation = _safe_elevation(place["latitude"], place["longitude"])
            entry["elevation_m"] = elevation
            entry["elevation_source"] = ELEVATION_SOURCE if elevation is not None else None
            entry["elevation_diff_m"] = (
                round(elevation - selected_elevation) if elevation is not None and selected_elevation is not None else None
            )
            river_distance = _safe_river_distance(place["latitude"], place["longitude"])
            entry["nearest_river_distance_m"] = river_distance
            entry["river_distance_source"] = RIVER_SOURCE if river_distance is not None else None
        else:
            entry["elevation_m"] = None
            entry["elevation_source"] = None
            entry["elevation_diff_m"] = None
            entry["nearest_river_distance_m"] = None
            entry["river_distance_source"] = None
        entry["source"] = SOURCE
        enriched.append(entry)
    return selected_elevation, enriched


@router.get("/nearby")
def nearby_safe_places(
    location_id: str = "dehradun",
    latitude: float | None = Query(default=None, ge=-90, le=90),
    longitude: float | None = Query(default=None, ge=-180, le=180),
    radius_m: float = Query(default=DEFAULT_RADIUS_M, ge=500, le=20_000),
):
    """Candidate emergency destinations within ``radius_m`` of a location."""
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

    base = {
        "location_id": resolved_id,
        "latitude": round(lat, 5),
        "longitude": round(lon, 5),
        "radius_m": int(radius_m),
    }

    try:
        places = safe_place_provider.fetch_nearby_places(lat, lon, radius_m=radius_m)
    except safe_place_provider.ProviderError:
        places = None
    if places is None:
        return base | {
            "status": "UNAVAILABLE",
            "status_reason": "PLACE_PROVIDER_UNAVAILABLE",
            "source": None,
            "n_places": 0,
            "selected_elevation_m": None,
            "selected_elevation_source": None,
            "ranking_note": None,
            "places": [],
            "data_status": "UNAVAILABLE",
            "disclaimer": _UNAVAILABLE_DISCLAIMER,
        }

    ranked = safe_place_provider.rank_places(places)
    selected_elevation, enriched = _enrich_places(ranked, lat, lon)
    return base | {
        "status": "AVAILABLE",
        "status_reason": None,
        "source": SOURCE,
        "n_places": len(enriched),
        "selected_elevation_m": selected_elevation,
        "selected_elevation_source": ELEVATION_SOURCE if selected_elevation is not None else None,
        "ranking_note": RANKING_NOTE,
        "places": enriched,
        "data_status": "LIVE",
        "disclaimer": DISCLAIMER,
    }