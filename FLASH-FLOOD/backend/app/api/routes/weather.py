"""Weather routes.

Live weather is fetched from the Open-Meteo provider for the resolved
coordinates: predefined locations resolve through the demo location fixtures,
arbitrary coordinates are used directly. Scenario values are never substituted
for real weather; when the provider is unavailable an honest UNAVAILABLE
response is returned. The scenario parameter is echoed as provenance metadata
for compatibility (it no longer drives displayed values here).
"""
from fastapi import APIRouter

from backend.app.services import weather_service
from backend.app.services.demo_service import (
    find_location,
    get_scenario,
    normalize_scenario,
)

router = APIRouter(prefix="/api/v1/weather", tags=["Weather"])


def _resolve_coordinates(
    location_id: str,
    latitude: float | None,
    longitude: float | None,
    location_name: str | None = None,
) -> tuple[float | None, float | None, str]:
    location = find_location(location_id)
    if location is not None:
        return location["latitude"], location["longitude"], location["name"]
    if latitude is not None and longitude is not None:
        name = location_name.strip() if location_name and location_name.strip() else f"{latitude}, {longitude}"
        return latitude, longitude, name
    return None, None, location_id


def _valid_coordinates(latitude: float, longitude: float) -> bool:
    return -90 <= latitude <= 90 and -180 <= longitude <= 180


@router.get("/current")
def get_weather_current(
    location_id: str = "dehradun",
    scenario: str = "critical_flood",
    latitude: float | None = None,
    longitude: float | None = None,
    location_name: str | None = None,
):
    key = normalize_scenario(scenario)
    get_scenario(key)
    lat, lng, name = _resolve_coordinates(location_id, latitude, longitude, location_name)
    if lat is None or lng is None:
        return weather_service.unavailable_current(
            location_id, name, key, "No coordinates available for this location"
        )
    if not _valid_coordinates(lat, lng):
        return weather_service.unavailable_current(
            location_id, name, key, "Invalid or out-of-range coordinates"
        )
    return weather_service.current_weather(lat, lng, location_id, name, key)


@router.get("/forecast")
def get_weather_forecast(
    location_id: str = "dehradun",
    scenario: str = "critical_flood",
    latitude: float | None = None,
    longitude: float | None = None,
    location_name: str | None = None,
):
    key = normalize_scenario(scenario)
    get_scenario(key)
    lat, lng, name = _resolve_coordinates(location_id, latitude, longitude, location_name)
    if lat is None or lng is None:
        return weather_service.unavailable_forecast(
            location_id, name, key, "No coordinates available for this location"
        )
    if not _valid_coordinates(lat, lng):
        return weather_service.unavailable_forecast(
            location_id, name, key, "Invalid or out-of-range coordinates"
        )
    return weather_service.forecast_weather(lat, lng, location_id, name, key)