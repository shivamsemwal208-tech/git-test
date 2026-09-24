"""River-distance provider — NO SOURCE CONNECTED IN THIS RELEASE.

``fetch_nearest_river_distance`` intentionally returns ``None`` for every
location: no global river/hydrology source is connected yet. The previous
Overpass waterway approach was removed, and the much larger global
HydroRIVERS download was explicitly stopped by project decision (2026-09-12),
so no download or hosted lookup backs this feature in this release.

Returning ``None`` is the honest state, never a claim about water:

* The feature is a reported/optional field in the response schema
  (``OPTIONAL_FEATURE_NAMES``), NOT part of the 11-feature model contract.
* It never blocks a prediction: ``features.live_feature_vector`` and the
  predictor gate ignore it, so arbitrary-location predictions proceed even
  though the value is ``None``.

The signature and return shape are kept stable so ``features.live_components``
and a future source can drop in without contract churn. ``ProviderError`` is
retained for API compatibility although the stub never raises it.
"""
import time

DEFAULT_RADIUS_M = 15_000
REQUEST_TIMEOUT_SECONDS = 25.0
CACHE_TTL_SECONDS = 600

_cache: dict[tuple[float, float], tuple[float, None]] = {}


class ProviderError(Exception):
    """Retained for API compatibility; the stub never raises it."""


def fetch_nearest_river_distance(
    latitude: float,
    longitude: float,
    radius_m: float = DEFAULT_RADIUS_M,
    timeout: float = REQUEST_TIMEOUT_SECONDS,
) -> int | None:
    """Return the nearest mapped-waterway distance in metres, or ``None``.

    No source is connected in this release: the value is ``None`` for every
    location. None means "no river source in this release" — it never asserts
    anything about the presence or absence of water. Short-TTL cached.
    """
    key = (round(latitude, 5), round(longitude, 5))
    now = time.time()
    cached = _cache.get(key)
    if cached is not None and now - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]
    _cache[key] = (now, None)
    return None