"""Live USGS earthquake catalog provider.

Queries the USGS FDSN event query API
(``https://earthquake.usgs.gov/fdsnws/event/1/query``) for the most recent
catalogued event near arbitrary coordinates. Transport and parsing only:
returns ``None`` when no event matches and raises ``ProviderError`` on failure
so callers degrade honestly.

FlashGuard never predicts earthquakes. This provider only reports events that
USGS has already catalogued; it must never be used to claim prediction.
"""
import math
import time
from datetime import datetime, timedelta, timezone

import httpx

QUERY_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query"
WINDOW_DAYS = 7
DEFAULT_RADIUS_KM = 150.0
DEFAULT_MIN_MAGNITUDE = 3.0
REQUEST_TIMEOUT_SECONDS = 8.0
CACHE_TTL_SECONDS = 300

_cache: dict[tuple[float, float], tuple[float, dict | None]] = {}

_http_get = httpx.get


class ProviderError(Exception):
    """Raised when catalogue data cannot be retrieved or parsed."""


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def fetch_latest_event(
    latitude: float,
    longitude: float,
    radius_km: float = DEFAULT_RADIUS_KM,
    min_magnitude: float = DEFAULT_MIN_MAGNITUDE,
    timeout: float = REQUEST_TIMEOUT_SECONDS,
) -> dict | None:
    """Return the most recent catalogued event near the coordinates, or None.

    The returned record contains ``event_id``, ``magnitude``, ``depth_km``,
    ``distance_km``, ``time`` (ISO-8601 UTC), ``latitude``, ``longitude``,
    ``place`` and ``mag_type``.
    """
    key = (round(latitude, 5), round(longitude, 5))
    now = time.time()
    cached = _cache.get(key)
    if cached is not None and now - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    start = datetime.now(timezone.utc) - timedelta(days=WINDOW_DAYS)
    params = {
        "format": "geojson",
        "starttime": start.strftime("%Y-%m-%dT%H:%M:%S"),
        "minmagnitude": min_magnitude,
        "maxradiuskm": radius_km,
        "latitude": latitude,
        "longitude": longitude,
        "orderby": "time",
        "limit": 1,
    }
    try:
        response = _http_get(QUERY_URL, params=params, timeout=timeout)
        response.raise_for_status()
    except (httpx.HTTPError, OSError) as exc:
        raise ProviderError(f"USGS request failed: {exc}") from exc
    try:
        payload = response.json()
    except ValueError as exc:
        raise ProviderError("USGS returned malformed JSON") from exc
    event = _parse_event(payload, latitude, longitude)
    _cache[key] = (time.time(), event)
    return event


def _parse_event(payload: object, latitude: float, longitude: float) -> dict | None:
    if not isinstance(payload, dict):
        raise ProviderError("USGS response is not an object")
    features = payload.get("features")
    if not isinstance(features, list):
        raise ProviderError("USGS response missing features list")
    if not features:
        return None
    feature = features[0]
    if not isinstance(feature, dict):
        raise ProviderError("USGS event entry is not an object")
    properties = feature.get("properties")
    if not isinstance(properties, dict):
        raise ProviderError("USGS event missing properties")
    geometry = feature.get("geometry")
    if not isinstance(geometry, dict):
        raise ProviderError("USGS event missing geometry")
    coords = geometry.get("coordinates")
    if not isinstance(coords, list) or len(coords) < 2:
        raise ProviderError("USGS event geometry is malformed")
    event_lng, event_lat = float(coords[0]), float(coords[1])
    depth = coords[2] if len(coords) > 2 else None
    magnitude = properties.get("mag")
    if not isinstance(magnitude, (int, float)):
        raise ProviderError("USGS event missing magnitude")
    return {
        "event_id": str(feature.get("id") or "unknown"),
        "magnitude": round(float(magnitude), 1),
        "depth_km": None if depth is None else round(float(depth), 1),
        "distance_km": round(_haversine_km(latitude, longitude, event_lat, event_lng), 1),
        "time": datetime.fromtimestamp(
            properties.get("time", 0) / 1000, tz=timezone.utc
        ).isoformat(),
        "latitude": event_lat,
        "longitude": event_lng,
        "place": str(properties.get("place") or "Unknown location"),
        "mag_type": str(properties.get("magType") or "unknown"),
    }