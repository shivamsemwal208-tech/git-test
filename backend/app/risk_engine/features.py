"""Canonical flood-risk feature definitions shared by training and inference.

This module is the single source of truth for the flood-risk feature contract:
feature names, units, canonical ordering, source group, and the missing-value /
transform policy. Both ML training (``ml/src``) and live inference (the future
predictor and risk route) must go through ``build_features`` so that a feature
means exactly the same thing on both sides.

Canonical ordering is fixed by ``FEATURE_SCHEMA``. Training builds a dataset as
``FEATURE_NAMES`` columns; live inference produces the same ordered vector, so
no column-order drift is possible.

Null policy
===========
A feature is ``None`` when its source is unavailable or its window is
incomplete. Missing values are NEVER fabricated, estimated, or imputed here;
any imputation belongs to the fitted model in a later phase. The vector always
contains every feature in canonical order even when the value is ``None``, so
downstream code can rely on a fixed column layout.

Terrain features are NOT fabricated: when their provider fails or a value is
genuinely unavailable the feature stays ``None`` (same null policy as weather),
and downstream consumers report the honest missing state rather than a guess.

Units
=====
* Rainfall features: millimetres (Open-Meteo ``precipitation`` hourly totals,
  accumulated by ``weather_service`` — identical windows live and in training).
* ``soil_moisture_0_to_7cm``: percent (volumetric m³/m³ * 100) at the 0-7 cm
  depth band — the depth exposed by the Open-Meteo ARCHIVE API used for
  training, so training and live inference share the same depth and units.
* ``elevation``: metres above mean sea level (Open-Meteo elevation API).
* ``slope_degrees`` / ``aspect_degrees``: derived deterministically from a 3x3
  Open-Meteo elevation neighbourhood (see ``terrain_provider``); aspect is the
  downhill compass bearing clockwise from north, ``0.0`` by convention when
  flat.
* ``river_distance_m``: distance (metres) to the nearest mapped river from the
  global HydroRIVERS v1.0 network via the local grid index (see
  ``river_provider``). ``None`` = no mapped river within the search radius or
  the index is not built — never a claim about water presence, and never
  silently zero. It is excluded from the model contract (optional) and never
  blocks a prediction when unavailable.

Transform policy
================
``transform_vector`` applies the deterministic, fit-free ``log1p`` transform to
rainfall (mm) features. Training and inference must both call it before model
input so the modelling view is identical; the raw vector stays intact for
explanation/display. Unit of an ``log1p``-transformed mm feature is
``log(mm + 1)``, dimensionless.
"""

import math
from dataclasses import dataclass

from backend.app.data_sources import (
    elevation_provider,
    river_provider,
    terrain_provider,
)
from backend.app.services import weather_service


@dataclass(frozen=True)
class FeatureSpec:
    """Describes one canonical feature.

    ``available=False`` marks features declared in the schema but with no
    connected source yet: they are always ``None`` (never fabricated).
    ``optional=True`` marks reported/display features that are excluded from
    the model contract (``MODEL_FEATURE_NAMES`` / ``CORE_FEATURE_NAMES``) and
    therefore never block a prediction when unavailable.
    """
    name: str
    unit: str
    group: str
    description: str
    transform: str | None = None
    available: bool = True
    optional: bool = False


# ─── Canonical feature schema ────────────────────────────────────────────

def _spec(name, unit, group, description, transform=None, available=True,
          optional=False):
    return FeatureSpec(
        name=name,
        unit=unit,
        group=group,
        description=description,
        transform=transform,
        available=available,
        optional=optional,
    )


FEATURE_SCHEMA: tuple[FeatureSpec, ...] = (
    # Rainfall windows (mm), accumulated identically by weather_service for
    # live (forecast API) and training (archive API).
    _spec("rainfall_1h", "mm", "rainfall",
          "Precipitation during the current hour (preceding-hour sum).", "log1p"),
    _spec("rainfall_3h", "mm", "rainfall",
          "Precipitation accumulated over the last 3 hours.", "log1p"),
    _spec("rainfall_6h", "mm", "rainfall",
          "Precipitation accumulated over the last 6 hours.", "log1p"),
    _spec("rainfall_24h", "mm", "rainfall",
          "Precipitation accumulated over the last 24 hours.", "log1p"),
    _spec("rainfall_72h", "mm", "rainfall",
          "Precipitation accumulated over the last 72 hours.", "log1p"),
    _spec("rainfall_7d", "mm", "rainfall",
          "Precipitation accumulated over the last 7 days (168 hours).", "log1p"),
    _spec("antecedent_rainfall_7d", "mm", "rainfall",
          "Pre-wetting context: 144 hours ending 24h before now (six days "
          "before the last 24h window; never overlaps rainfall_24h).", "log1p"),
    # Soil wetness at the archive-aligned depth band (%). 0-7 cm is the depth
    # exposed by the Open-Meteo ARCHIVE API, so live/training are comparable.
    _spec("soil_moisture_0_to_7cm", "%", "soil",
          "Volumetric soil moisture (m³/m³ * 100) over the 0-7 cm depth band."),
    # Terrain — all three are live and follow the shared null policy (None when
    # the provider fails or a value is genuinely unavailable; never fabricated).
    _spec("elevation", "m", "terrain",
          "Elevation above mean sea level."),
    _spec("slope_degrees", "degrees", "terrain",
          "Terrain slope (degrees) from a 3x3 Open-Meteo elevation "
          "neighbourhood plane fit (~111 m north-south spacing)."),
    _spec("aspect_degrees", "degrees", "terrain",
          "Compass bearing of the downhill direction (degrees clockwise from "
          "north; 0.0 by convention when flat)."),
    _spec("river_distance_m", "m", "terrain",
          "Great-circle distance (metres) to the nearest mapped river from "
          "the global HydroRIVERS v1.0 network (local grid index). None = no "
          "mapped river within the search radius, or index not built — never "
          "a guess about water. Optional: excluded from the model contract "
          "and never blocks a prediction.", optional=True),
)

# Canonical ordered feature names — training columns and inference vectors both
# use exactly this order. The response/schema keeps all 12.
FEATURE_NAMES: tuple[str, ...] = tuple(spec.name for spec in FEATURE_SCHEMA)
# The 11 features of the v2 model contract: every available feature that is not
# marked optional (river_distance_m is excluded). NOTE: the production artifact
# (v1) is trained on the 9-feature subset (rainfall x7, soil, elevation); the
# predictor always derives the required set from the LOADED artifact's own
# declared feature_names, so slope/aspect are never required by v1 predictions.
MODEL_FEATURE_NAMES: tuple[str, ...] = tuple(
    spec.name for spec in FEATURE_SCHEMA if spec.available and not spec.optional
)
OPTIONAL_FEATURE_NAMES: tuple[str, ...] = tuple(
    spec.name for spec in FEATURE_SCHEMA if spec.optional
)
# Required features for an ML prediction — identical to the model contract.
CORE_FEATURE_NAMES: tuple[str, ...] = MODEL_FEATURE_NAMES
UNAVAILABLE_FEATURE_NAMES: tuple[str, ...] = tuple(
    spec.name for spec in FEATURE_SCHEMA if not spec.available
)

_UNIT_BY_NAME: dict[str, str] = {spec.name: spec.unit for spec in FEATURE_SCHEMA}
_GROUP_BY_NAME: dict[str, str] = {spec.name: spec.group for spec in FEATURE_SCHEMA}
_LOG1P_FEATURES: tuple[str, ...] = tuple(
    spec.name for spec in FEATURE_SCHEMA if spec.transform == "log1p"
)


def feature_names() -> list[str]:
    """Canonical feature names in canonical order."""
    return list(FEATURE_NAMES)


def feature_units() -> dict[str, str]:
    """Map of feature name -> unit (raw units; log1p items are raw mm)."""
    return dict(_UNIT_BY_NAME)


def core_feature_names() -> list[str]:
    """Names of the maximal available model contract (v2, 11 features).

    The predictor's actual required set derives from the loaded artifact's own
    feature_names (v1 production = 9)."""
    return list(CORE_FEATURE_NAMES)


def model_feature_names() -> list[str]:
    """Names of the v2 model contract (same as core; 11 features)."""
    return list(MODEL_FEATURE_NAMES)


def optional_feature_names() -> list[str]:
    """Reported/display features excluded from the model contract."""
    return list(OPTIONAL_FEATURE_NAMES)


def _as_float(value) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def build_features(components: dict) -> dict[str, float | None]:
    """Assemble the canonical RAW feature vector from a components dict.

    ``components`` maps canonical feature names to measured values. Keys may be
    omitted (treated as missing) and extra keys are ignored. Output is an
    ordered dict with exactly ``FEATURE_NAMES`` keys — values preserved,
    including ``None`` for anything missing or unavailable. No values are ever
    fabricated, estimated, or imputed here.
    """
    vector: dict[str, float | None] = {}
    for spec in FEATURE_SCHEMA:
        if spec.available:
            vector[spec.name] = _as_float(components.get(spec.name))
        else:
            vector[spec.name] = None
    return vector


def transform_vector(vector: dict) -> dict[str, float | None]:
    """Deterministic modelling transform shared by training and inference.

    Applies ``log1p`` to rainfall (mm) features and leaves non-rainfall
    features unchanged. Requires the canonical keys; unknown keys are passed
    through untouched. ``None`` stays ``None``. No fitted parameters (no
    imputation, no scaling) — purely deterministic so a trained model and a
    live request can never drift apart.
    """
    transformed: dict[str, float | None] = {}
    for name, value in vector.items():
        if value is not None and name in _LOG1P_FEATURES:
            transformed[name] = math.log1p(value)
        else:
            transformed[name] = value
    return transformed


# ─── Live inference adapter ──────────────────────────────────────────────

def live_components(
    latitude: float,
    longitude: float,
    current: dict | None = None,
) -> dict:
    """Pull raw component values for a location from the live providers.

    Uses ``weather_service.current_weather`` (which already returns an honest
    UNAVAILABLE payload — all ``None`` — on provider failure), plus the live
    elevation and terrain (slope/aspect) providers. ``river_distance_m`` is
    pulled from the HydroRIVERS-backed river provider (optional feature; never
    blocks a prediction, ``None`` when no mapped river is near or the index is
    not built). Every failure degrades to ``None`` — never a fabricated value.

    ``current`` optionally accepts an already-fetched weather payload (the dict
    produced by ``weather_service.current_weather``). The risk route passes the
    payload it fetched for display so the weather provider is queried once per
    request instead of twice; when omitted (direct calls, training/tests) the
    weather is fetched here as before.
    """
    location_label = f"{latitude:g}, {longitude:g}"
    if current is None:
        current = weather_service.current_weather(
            latitude,
            longitude,
            location_label,
            location_label,
            "normal",
        )
    elevation: float | None = None
    try:
        value = elevation_provider.fetch_elevation(latitude, longitude)
        elevation = None if value is None else float(value)
    except (elevation_provider.ProviderError, OSError, ValueError):
        elevation = None

    terrain: dict = {}
    try:
        terrain = terrain_provider.fetch_terrain(latitude, longitude)
        terrain = terrain if isinstance(terrain, dict) else {}
    except (terrain_provider.ProviderError, OSError, ValueError):
        terrain = {}

    river_distance: float | None = None
    try:
        value = river_provider.fetch_nearest_river_distance(latitude, longitude)
        river_distance = None if value is None else float(value)
    except (river_provider.ProviderError, OSError, ValueError):
        river_distance = None

    return {
        "rainfall_1h": current.get("rainfall_1h"),
        "rainfall_3h": current.get("rainfall_3h"),
        "rainfall_6h": current.get("rainfall_6h"),
        "rainfall_24h": current.get("rainfall_24h"),
        "rainfall_72h": current.get("rainfall_72h"),
        "rainfall_7d": current.get("rainfall_7d"),
        "antecedent_rainfall_7d": current.get("antecedent_rainfall_7d"),
        "soil_moisture_0_to_7cm": current.get("soil_moisture_0_to_7cm"),
        "elevation": elevation,
        "slope_degrees": terrain.get("slope_degrees"),
        "aspect_degrees": terrain.get("aspect_degrees"),
        "river_distance_m": river_distance,
    }


def live_feature_vector(latitude: float, longitude: float) -> dict[str, float | None]:
    """Canonical RAW feature vector for the given coordinates (live data)."""
    return build_features(live_components(latitude, longitude))


def model_input(latitude: float, longitude: float) -> dict[str, float | None]:
    """Modelling-ready vector (transformed) for the coordinates — used by the
    future predictor; training applies the same ``build_features`` +
    ``transform_vector`` path from archive-derived components."""
    return transform_vector(live_feature_vector(latitude, longitude))