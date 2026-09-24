"""Real global terrain provider (slope + aspect from Open-Meteo elevation).

Derives ``slope_degrees`` and ``aspect_degrees`` from a 3x3 neighbourhood of
Open-Meteo elevation samples (Copernicus DEM via
``https://api.open-meteo.com/v1/elevation``) around the requested coordinate.

Methodology (deterministic, no fitting once model trained):
* Sample a 3x3 grid with ``NEIGHBORHOOD_SPACING_DEGREES`` (0.001 deg = ~111 m
  north-south; east-west scaled by cos(latitude)) centred on the coordinate.
* Fit ``z = a*x + b*y + c`` (metres east/north) by least squares over the 9
  samples; this is a landscape-scale (~200 m) slope/aspect proxy, deliberately
  coarser than a 30 m per-pixel DEM so the feature is stable for arbitrary
  coordinates.
* ``slope_degrees = degrees(atan(sqrt(a^2 + b^2)))``.
* ``aspect_degrees`` is the compass bearing of the *downhill* direction,
  clockwise from north (0 = N, 90 = E). For near-flat terrain (gradient below
  ``FLAT_GRADIENT_THRESHOLD``) the aspect is reported as ``0.0`` — a documented
  convention, not a measurement; the slope already conveys flatness.

This is a transport adapter like ``elevation_provider``: it raises
``ProviderError`` when the neighbourhood cannot be retrieved or any sample is
missing, so callers degrade to an honest ``None`` instead of fabricating
terrain.
"""
import math
import time

import httpx

ELEVATION_URL = "https://api.open-meteo.com/v1/elevation"
NEIGHBORHOOD_SPACING_DEGREES = 0.001
LATITUDE_METERS_PER_DEGREE = 111320.0
FLAT_GRADIENT_THRESHOLD = 1e-6
REQUEST_TIMEOUT_SECONDS = 8.0
CACHE_TTL_SECONDS = 600
RETRY_ATTEMPTS = 2

# 3x3 neighbourhood as (dy north, dx east) degree offsets, south row first so
# the centre point is index 4.
_TEXT = NEIGHBORHOOD_SPACING_DEGREES
GRID_OFFSETS: tuple[tuple[float, float], ...] = tuple(
    (dy, dx) for dy in (-_TEXT, 0.0, _TEXT) for dx in (-_TEXT, 0.0, _TEXT)
)

_cache: dict[tuple[float, float], tuple[float, dict[str, float | None]]] = {}

_http_get = httpx.get


class ProviderError(Exception):
    """Raised when terrain cannot be retrieved or parsed safely."""


def _round1(value: float) -> float:
    return round(float(value), 1)


def slope_aspect_from_grid(
    elevations: list[float | None],
    spacing_degrees: float = NEIGHBORHOOD_SPACING_DEGREES,
    reference_latitude: float = 0.0,
) -> dict[str, float | None]:
    """Derive slope/aspect from the 3x3 elevation grid (plane fit).

    ``elevations`` must be the 9 samples in ``GRID_OFFSETS`` order (centre at
    index 4). Any ``None`` or non-finite sample raises ``ProviderError`` —
    slope/aspect are never fabricated from partial neighbourhoods.
    """
    if len(elevations) != len(GRID_OFFSETS):
        raise ProviderError(
            f"terrain grid must have {len(GRID_OFFSETS)} samples, got {len(elevations)}"
        )
    if any(value is None for value in elevations):
        raise ProviderError("terrain neighbourhood has missing elevation samples")
    values = [float(value) for value in elevations]
    if not all(math.isfinite(value) for value in values):
        raise ProviderError("terrain neighbourhood has non-finite elevation samples")

    metres_per_degree = math.cos(math.radians(reference_latitude)) * (
        LATITUDE_METERS_PER_DEGREE
    )
    rows: list[tuple[float, float, float]] = []
    for offset, elevation in zip(GRID_OFFSETS, values):
        dy_north, dx_east = offset
        rows.append((dx_east * metres_per_degree, dy_north * LATITUDE_METERS_PER_DEGREE, elevation))

    design = [[x, y, 1.0] for x, y, _ in rows]
    target = [z for _, _, z in rows]
    try:
        coefficients = _solve_plane(design, target)
    except (ValueError, ZeroDivisionError, OverflowError) as exc:
        raise ProviderError(f"terrain plane fit failed: {exc}") from exc
    a, b, _ = coefficients

    gradient = math.hypot(a, b)
    slope = math.degrees(math.atan(gradient))
    if gradient < FLAT_GRADIENT_THRESHOLD:
        aspect = 0.0
    else:
        aspect = (math.degrees(math.atan2(-a, -b)) + 360.0) % 360.0

    return {"slope_degrees": _round1(slope), "aspect_degrees": _round1(aspect)}


def _solve_plane(design: list[list[float]], target: list[float]) -> list[float]:
    """Least-squares fit of ``z = a*x + b*y + c`` via the normal equations
    (3 unknowns solved exactly with Cramer's rule)."""
    n = len(design)
    sx = sum(row[0] for row in design)
    sy = sum(row[1] for row in design)
    sz = sum(target)
    sxx = sum(row[0] * row[0] for row in design)
    syy = sum(row[1] * row[1] for row in design)
    sxy = sum(row[0] * row[1] for row in design)
    sxz = sum(row[0] * z for row, z in zip(design, target))
    syz = sum(row[1] * z for row, z in zip(design, target))

    # Normal equations [[sxx, sxy, sx],[sxy, syy, sy],[sx, sy, n]] . [a, b, c] = [sxz, syz, sz]
    matrix = [
        [sxx, sxy, sx],
        [sxy, syy, sy],
        [sx, sy, float(n)],
    ]
    right = [sxz, syz, sz]
    det = _determinant3(matrix)
    if abs(det) < 1e-12:
        raise ZeroDivisionError("singular terrain plane fit")
    solution = []
    for column in range(3):
        replaced = [row[:] for row in matrix]
        for row in range(3):
            replaced[row][column] = right[row]
        solution.append(_determinant3(replaced) / det)
    return solution


def _determinant3(matrix: list[list[float]]) -> float:
    a, b, c = matrix[0]
    d, e, f = matrix[1]
    g, h, i = matrix[2]
    return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)


def _fetch_elevations(
    latitude: float,
    longitude: float,
    timeout: float,
) -> list[float | None]:
    """Fetch the 9 neighbourhood elevations via the batch elevation endpoint."""
    lats = ",".join(f"{latitude + dy:.6f}" for dy, _ in GRID_OFFSETS)
    lons = ",".join(f"{longitude + dx:.6f}" for _, dx in GRID_OFFSETS)
    response = None
    last_error: Exception | None = None
    for attempt in range(RETRY_ATTEMPTS):
        try:
            response = _http_get(
                ELEVATION_URL,
                params={"latitude": lats, "longitude": lons},
                timeout=timeout,
            )
            response.raise_for_status()
            break
        except (httpx.HTTPError, OSError) as exc:
            last_error = exc
            time.sleep(0.4 * (attempt + 1))
    if response is None:
        raise ProviderError(
            f"Open-Meteo elevation request failed: {last_error}"
        )
    if response.status_code != 200:
        raise ProviderError(f"Open-Meteo elevation request failed: HTTP {response.status_code}")
    try:
        payload = response.json()
    except ValueError as exc:
        raise ProviderError("Open-Meteo elevation returned malformed JSON") from exc
    if not isinstance(payload, dict):
        raise ProviderError("Open-Meteo elevation response is not an object")
    values = payload.get("elevation")
    if not isinstance(values, list) or len(values) != len(GRID_OFFSETS):
        raise ProviderError("Open-Meteo elevation response has an unexpected grid size")
    result: list[float | None] = []
    for value in values:
        if value is None:
            result.append(None)
        elif isinstance(value, (int, float)) and math.isfinite(float(value)):
            result.append(float(value))
        else:
            result.append(None)
    return result


def fetch_terrain(
    latitude: float,
    longitude: float,
    timeout: float = REQUEST_TIMEOUT_SECONDS,
) -> dict[str, float | None]:
    """Return ``{"slope_degrees": .., "aspect_degrees": ..}`` for coordinates.

    Short-TTL cached. Raises ``ProviderError`` when the neighbourhood cannot be
    fully retrieved so callers degrade to an honest ``None``.
    """
    key = (round(latitude, 5), round(longitude, 5))
    now = time.time()
    cached = _cache.get(key)
    if cached is not None and now - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]
    elevations = _fetch_elevations(latitude, longitude, timeout)
    result = slope_aspect_from_grid(
        elevations, NEIGHBORHOOD_SPACING_DEGREES, latitude
    )
    _cache[key] = (time.time(), result)
    return result