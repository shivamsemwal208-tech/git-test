"""Real global elevation provider (Open-Meteo elevation API).

Resolves WGS84 elevation (metres above mean sea level) for any coordinates via
``https://api.open-meteo.com/v1/elevation``. This is a transport-only adapter
mirroring ``weather_provider``: it raises ``ProviderError`` when elevation
cannot be retrieved or parsed so callers degrade to an honest ``None`` instead
of fabricating terrain.
"""
import time

import httpx

ELEVATION_URL = "https://api.open-meteo.com/v1/elevation"
REQUEST_TIMEOUT_SECONDS = 6.0
CACHE_TTL_SECONDS = 600

_cache: dict[tuple[float, float], tuple[float, float | None]] = {}

_http_get = httpx.get


class ProviderError(Exception):
    """Raised when real elevation cannot be retrieved or parsed."""


def fetch_elevation(
    latitude: float,
    longitude: float,
    timeout: float = REQUEST_TIMEOUT_SECONDS,
) -> float | None:
    """Return metres above mean sea level for the coordinates (short TTL cache)."""
    key = (round(latitude, 5), round(longitude, 5))
    now = time.time()
    cached = _cache.get(key)
    if cached is not None and now - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]
    try:
        response = _http_get(
            ELEVATION_URL,
            params={"latitude": latitude, "longitude": longitude},
            timeout=timeout,
        )
        response.raise_for_status()
    except (httpx.HTTPError, OSError) as exc:
        raise ProviderError(f"Open-Meteo elevation request failed: {exc}") from exc
    try:
        payload = response.json()
    except ValueError as exc:
        raise ProviderError("Open-Meteo elevation returned malformed JSON") from exc
    if not isinstance(payload, dict):
        raise ProviderError("Open-Meteo elevation response is not an object")
    values = payload.get("elevation")
    if not isinstance(values, list) or not values:
        raise ProviderError("Open-Meteo elevation response missing elevation list")
    value = values[0]
    if not isinstance(value, (int, float)):
        raise ProviderError("Open-Meteo elevation value is not numeric")
    _cache[key] = (time.time(), float(value))
    return float(value)