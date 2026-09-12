"""Seismic routes.

Predefined demo locations keep the deterministic demo event. Arbitrary
coordinates query the real USGS earthquake catalogue: a live event when one
exists within the search window, or an honest response otherwise. FlashGuard
never predicts earthquakes.
"""
from datetime import datetime, timezone

from fastapi import APIRouter

from backend.app.data_sources import usgs_provider
from backend.app.services.demo_service import (
    arbitrary_location_id,
    get_location,
    is_predefined_location,
    seismic,
)

router = APIRouter(prefix="/api/v1/seismic", tags=["Seismic"])


def _no_event_response(latitude: float | None, longitude: float | None) -> dict:
    return {
        "data_status": "UNAVAILABLE",
        "is_simulated": False,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "disclaimer": (
            "No catalogue event is available near these coordinates in the query "
            "window. No simulated values have been substituted."
        ),
        "location_id": arbitrary_location_id(latitude, longitude),
        "event_id": "none",
        "magnitude": None,
        "depth_km": None,
        "distance_km": None,
        "event_time": "No recent event",
        "latitude": latitude,
        "longitude": longitude,
        "seismic_status": "NO RECENT EVENT",
        "note": (
            "No catalogued event (M>=3.0, 150 km, last 7 days) near these "
            "coordinates. FlashGuard does not predict earthquakes."
        ),
        "earthquake_prediction_provided": False,
        "secondary_hazards": [],
    }


@router.get("/latest")
def get_latest_seismic(
    location_id: str = "dehradun",
    latitude: float | None = None,
    longitude: float | None = None,
):
    if is_predefined_location(location_id):
        return seismic(location_id)
    if latitude is None or longitude is None:
        get_location(location_id)  # raises 404 for unknown IDs without coordinates
    try:
        event = usgs_provider.fetch_latest_event(latitude, longitude)
    except usgs_provider.ProviderError as exc:
        return {
            "data_status": "UNAVAILABLE",
            "is_simulated": False,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "disclaimer": (
                "Real seismic monitoring is currently unavailable for these "
                "coordinates. No simulated values have been substituted."
            ),
            "location_id": arbitrary_location_id(latitude, longitude),
            "event_id": "unavailable",
            "magnitude": None,
            "depth_km": None,
            "distance_km": None,
            "event_time": "No monitoring data",
            "latitude": latitude,
            "longitude": longitude,
            "seismic_status": "DATA UNAVAILABLE",
            "note": (
                "Seismic monitoring data could not be retrieved: "
                f"{exc}. FlashGuard does not predict earthquakes."
            ),
            "earthquake_prediction_provided": False,
            "secondary_hazards": [],
        }
    if event is None:
        return _no_event_response(latitude, longitude)
    return {
        "data_status": "LIVE",
        "is_simulated": False,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "disclaimer": (
            "Live earthquake catalogue data from USGS (earthquake.usgs.gov). "
            "Monitored events only; FlashGuard does not predict earthquakes."
        ),
        "location_id": arbitrary_location_id(latitude, longitude),
        "event_id": event["event_id"],
        "magnitude": event["magnitude"],
        "depth_km": event["depth_km"],
        "distance_km": event["distance_km"],
        "event_time": event["time"],
        "latitude": event["latitude"],
        "longitude": event["longitude"],
        "seismic_status": "MONITORING",
        "note": (
            f"Nearest catalogued {event['mag_type']} event M{event['magnitude']} at "
            f"{event['place']}, {event['distance_km']} km away. "
            "FlashGuard does not predict earthquakes."
        ),
        "earthquake_prediction_provided": False,
        "secondary_hazards": [],
    }