"""Real emergency-destination provider — OpenStreetMap via the Overpass API.

Discovers candidate emergency/public destinations near any coordinates from the
live OpenStreetMap database through the public Overpass API (transport-only
adapter mirroring ``usgs_provider``). Only mapped amenity categories that can
plausibly serve as emergency or public destinations are queried: hospitals,
clinics, fire stations, police stations, schools and community centres.

Honesty contract
================
- Every returned place is a **potential** destination: this module never
  certifies any place as flood-safe, and never claims an official shelter
  designation that OpenStreetMap does not imply.
- When the provider is unreachable, rate-limited or malformed, the module
  returns ``None`` (never a fabricated list of places).
- Ranking is transparent and deterministic: emergency-service types (hospital,
  clinic, fire station, police station) sort before public buildings (school,
  community centre), then by great-circle distance. Every record carries a
  ``ranking_reason``. No opaque or AI-derived score is used.
"""
import math
import os
import time

import httpx

OVERPASS_URL = os.environ.get(
    "FLASHGUARD_OVERPASS_URL", "https://overpass-api.de/api/interpreter"
)
REQUEST_TIMEOUT_SECONDS = 20.0
CACHE_TTL_SECONDS = 600
DEFAULT_RADIUS_M = 5_000
MAX_PLACES = 40
EARTH_RADIUS_M = 6_371_000.0

# amenity tag -> (label, ranking priority). Priority 1 = emergency services,
# priority 2 = public buildings that may host emergency operations.
_CATEGORIES: dict[str, tuple[str, int]] = {
    "hospital": ("Hospital", 1),
    "clinic": ("Clinic", 1),
    "fire_station": ("Fire station", 1),
    "police": ("Police station", 1),
    "school": ("School", 2),
    "community_centre": ("Community centre", 2),
}

_PRIORITY_ONE_REASON = (
    "Emergency service (hospital/clinic/fire/police) — higher-priority "
    "destination type"
)
_PRIORITY_TWO_REASON = (
    "Public building (school/community centre) — secondary destination type"
)

_cache: dict[tuple[float, float, int], tuple[float, list[dict] | None]] = {}

_http_post = httpx.post


class ProviderError(Exception):
    """Raised when OpenStreetMap data cannot be retrieved or parsed."""


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> int:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    metres = EARTH_RADIUS_M * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return int(round(metres))


def _overpass_query(latitude: float, longitude: float, radius_m: int) -> str:
    tag_regex = "|".join(_CATEGORIES)
    return (
        "[out:json][timeout:25];"
        f'(nwr(around:{radius_m},{latitude},{longitude})'
        f'["amenity"~"^({tag_regex})$"];);'
        "out center tags;"
    )


def _place_coordinates(element: dict) -> tuple[float, float] | None:
    """Return ``(lat, lon)`` for node/way/relation elements or ``None``."""
    if element.get("type") == "node":
        lat, lon = element.get("lat"), element.get("lon")
    else:
        center = element.get("center")
        if not isinstance(center, dict):
            return None
        lat, lon = center.get("lat"), center.get("lon")
    if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
        return None
    if not math.isfinite(lat) or not math.isfinite(lon):
        return None
    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        return None
    return float(lat), float(lon)


def _address(tags: dict) -> str | None:
    parts = [
        tags.get("addr:street"),
        tags.get("addr:neighbourhood"),
        tags.get("addr:suburb"),
        tags.get("addr:city"),
        tags.get("addr:district"),
        tags.get("addr:place"),
    ]
    compact = ", ".join(part.strip() for part in parts if part and part.strip())
    return compact or None


def _parse_payload(payload: object, latitude: float, longitude: float) -> list[dict]:
    """Normalise an Overpass response element set into provider records."""
    if not isinstance(payload, dict):
        raise ProviderError("Overpass response is not an object")
    # Overpass attaches `remark` on parse/evaluator errors.
    remark = payload.get("remark")
    if remark:
        raise ProviderError(f"Overpass returned an error remark: {remark}")
    elements = payload.get("elements")
    if not isinstance(elements, list):
        raise ProviderError("Overpass response missing elements list")

    places: list[dict] = []
    seen: set[tuple[str, int]] = set()
    for element in elements:
        if not isinstance(element, dict):
            continue  # skip malformed entries, never crash
        osm_type = element.get("type")
        osm_id = element.get("id")
        if osm_type not in ("node", "way", "relation") or not isinstance(osm_id, int):
            continue
        key = (osm_type, osm_id)
        if key in seen:
            continue
        tags = element.get("tags")
        if not isinstance(tags, dict):
            tags = {}
        amenity = tags.get("amenity")
        category = _CATEGORIES.get(amenity)
        if category is None:
            continue  # not one of the queried destination types
        coords = _place_coordinates(element)
        if coords is None:
            continue  # missing/malformed coordinates — never invent a position
        lat, lon = coords
        seen.add(key)
        label, priority = category
        places.append(
            {
                "osm_type": osm_type,
                "osm_id": osm_id,
                "name": tags.get("name"),
                "category": amenity,
                "category_label": label,
                "priority": priority,
                "latitude": round(lat, 6),
                "longitude": round(lon, 6),
                "distance_m": _haversine_m(latitude, longitude, lat, lon),
                "address": _address(tags),
            }
        )
    places.sort(key=lambda p: (p["priority"], p["distance_m"], p["osm_id"]))
    return places[:MAX_PLACES]


def fetch_nearby_places(
    latitude: float,
    longitude: float,
    radius_m: float = DEFAULT_RADIUS_M,
    timeout: float = REQUEST_TIMEOUT_SECONDS,
) -> list[dict] | None:
    """Return potential emergency destinations near the coordinates, or ``None``.

    ``None`` is the honest unavailable state: the Overpass provider could not be
    reached (network failure, rate limiting, timeout, malformed response). The
    module never fabricates a list of places. Short-TTL cached per query point.
    """
    key = (round(latitude, 5), round(longitude, 5), int(radius_m))
    now = time.time()
    cached = _cache.get(key)
    if cached is not None and now - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    query = _overpass_query(latitude, longitude, int(radius_m))
    try:
        response = _http_post(
            OVERPASS_URL,
            data={"data": query},
            timeout=timeout,
            headers={"User-Agent": "FlashGuard/0.1 (flash-flood assessment)"},
        )
        response.raise_for_status()
    except (httpx.HTTPError, OSError) as exc:
        raise ProviderError(f"Overpass request failed: {exc}") from exc
    try:
        payload = response.json()
    except ValueError as exc:
        raise ProviderError("Overpass returned malformed JSON") from exc

    places = _parse_payload(payload, latitude, longitude)
    _cache[key] = (time.time(), places)
    return places


def rank_places(places: list[dict]) -> list[dict]:
    """Return a transparently ranked copy of the provider records.

    Ordering: emergency-service types (priority 1) first, then public buildings
    (priority 2); within a priority, nearest first. Each record gains ``rank``
    (1-based) and a ``ranking_reason`` explaining its placement. The input list
    is treated as read-only — a new list is returned.
    """
    ordered = sorted(
        places,
        key=lambda p: (p.get("priority", 2), p.get("distance_m", 2**31), p.get("osm_id", 0)),
    )
    ranked: list[dict] = []
    for index, place in enumerate(ordered, start=1):
        entry = dict(place)
        entry["rank"] = index
        entry["ranking_reason"] = (
            _PRIORITY_ONE_REASON
            if entry.get("priority") == 1
            else _PRIORITY_TWO_REASON
        )
        ranked.append(entry)
    return ranked