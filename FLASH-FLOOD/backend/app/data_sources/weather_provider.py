"""Open-Meteo weather provider.

This module is the single network-facing adapter for live weather. It performs
transport only (request/response) and raises ``ProviderError`` when live data
cannot be retrieved or parsed. Normalization into the FlashGuard weather
contract happens in ``backend.app.services.weather_service``.
"""
import httpx

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

# Weather variables requested from the Forecast API (documented methodology).
# ``current`` exposes the "now" values; ``hourly`` gives the time series used
# for rainfall accumulation and the forecast.
#
# Two soil-moisture depths are requested deliberately:
#   * ``soil_moisture_0_to_1cm`` feeds the legacy ``soil_moisture`` field.
#   * ``soil_moisture_0_to_7cm`` matches the depth exposed by the Open-Meteo
#     ARCHIVE/Historical API used for ML training, so live inference and
#     training features share the same depth band and units. The two depths are
#     distinct measurements and are never treated as interchangeable.
CURRENT_VARIABLES = [
    "temperature_2m",
    "relative_humidity_2m",
    "precipitation",
    "precipitation_probability",
    "wind_speed_10m",
    "wind_direction_10m",
    "surface_pressure",
    "soil_moisture_0_to_1cm",
    "soil_moisture_0_to_7cm",
]

HOURLY_VARIABLES = CURRENT_VARIABLES

# Seven days of history backs the ML rainfall windows: ``rainfall_72h``,
# ``rainfall_7d`` (168h) and ``antecedent_rainfall_7d`` (see weather_service).
# Two days of forecast covers the forecast window without excessive payload.
PAST_DAYS = 7
FORECAST_DAYS = 2
REQUEST_TIMEOUT_SECONDS = 6.0

_http_get = httpx.get


class ProviderError(Exception):
    """Raised when live weather cannot be retrieved or parsed."""


def fetch_open_meteo(
    latitude: float,
    longitude: float,
    timeout: float = REQUEST_TIMEOUT_SECONDS,
) -> dict:
    """Fetch the Open-Meteo forecast for the given coordinates and return the raw JSON."""
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": ",".join(CURRENT_VARIABLES),
        "hourly": ",".join(HOURLY_VARIABLES),
        "past_days": PAST_DAYS,
        "forecast_days": FORECAST_DAYS,
        "timezone": "GMT",
    }
    try:
        response = _http_get(FORECAST_URL, params=params, timeout=timeout)
        response.raise_for_status()
    except (httpx.HTTPError, OSError) as exc:
        raise ProviderError(f"Open-Meteo request failed: {exc}") from exc
    try:
        data = response.json()
    except ValueError as exc:
        raise ProviderError("Open-Meteo returned malformed JSON") from exc
    _validate_payload(data)
    return data


def _validate_payload(data: object) -> None:
    if not isinstance(data, dict):
        raise ProviderError("Open-Meteo response is not an object")
    current = data.get("current")
    if not isinstance(current, dict):
        raise ProviderError("Open-Meteo response missing current block")
    hourly = data.get("hourly")
    if not isinstance(hourly, dict):
        raise ProviderError("Open-Meteo response missing hourly block")
    times = hourly.get("time")
    if not isinstance(times, list) or not times:
        raise ProviderError("Open-Meteo hourly data missing time series")
    required = set(HOURLY_VARIABLES)
    present = {
        variable
        for variable in HOURLY_VARIABLES
        if isinstance(hourly.get(variable), list) and len(hourly[variable]) == len(times)
    }
    missing = sorted(required - present)
    if missing:
        raise ProviderError(
            "Open-Meteo hourly data missing variables: " + ", ".join(missing)
        )