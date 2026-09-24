"""Tests for the canonical feature engine (shared contract for training + inference)."""
import math

import pytest

from backend.app.risk_engine import features
from backend.app.services import weather_service


# ─── Canonical contract ─────────────────────────────────────────────────

def test_feature_schema_canonical_ordering_and_units():
    names = features.feature_names()
    assert names == [
        "rainfall_1h", "rainfall_3h", "rainfall_6h", "rainfall_24h",
        "rainfall_72h", "rainfall_7d", "antecedent_rainfall_7d",
        "soil_moisture_0_to_7cm", "elevation",
        "slope_degrees", "aspect_degrees", "river_distance_m",
    ]
    assert len(names) == len(set(names))  # no duplicates
    # All 12 features are declared; the 11-feature model contract excludes the
    # optional river_distance_m (reported field, never blocks a prediction).
    assert features.model_feature_names() == [
        "rainfall_1h", "rainfall_3h", "rainfall_6h", "rainfall_24h",
        "rainfall_72h", "rainfall_7d", "antecedent_rainfall_7d",
        "soil_moisture_0_to_7cm", "elevation",
        "slope_degrees", "aspect_degrees",
    ]
    assert len(features.model_feature_names()) == 11
    assert features.core_feature_names() == features.model_feature_names()
    assert features.optional_feature_names() == ["river_distance_m"]
    assert list(features.UNAVAILABLE_FEATURE_NAMES) == []
    units = features.feature_units()
    assert units["rainfall_1h"] == "mm"
    assert units["rainfall_7d"] == "mm"
    assert units["antecedent_rainfall_7d"] == "mm"
    assert units["soil_moisture_0_to_7cm"] == "%"
    assert units["elevation"] == "m"
    assert units["slope_degrees"] == "degrees"
    assert units["aspect_degrees"] == "degrees"
    assert units["river_distance_m"] == "m"


# ─── build_features: canonical vector + null policy ─────────────────────

def test_build_features_returns_canonical_vector_in_schema_order():
    components = {
        "rainfall_1h": 1.0, "rainfall_24h": 24.0, "soil_moisture_0_to_7cm": 55.0,
        "elevation": 652.0, "rainfall_3h": 3.0, "antecedent_rainfall_7d": 144.0,
        "unknown_extra": 99.0,
    }
    vector = features.build_features(components)
    assert list(vector.keys()) == features.feature_names()
    assert vector["rainfall_1h"] == 1.0
    assert vector["rainfall_3h"] == 3.0
    assert vector["rainfall_24h"] == 24.0
    assert vector["antecedent_rainfall_7d"] == 144.0
    assert vector["soil_moisture_0_to_7cm"] == 55.0
    assert vector["elevation"] == 652.0
    # Extra keys are ignored and never leak into the canonical vector.
    assert "unknown_extra" not in vector


def test_build_features_missing_components_are_none_not_fabricated():
    vector = features.build_features({"elevation": 500.0})
    for name in features.feature_names():
        value = vector[name]
        assert name in vector
        if name == "elevation":
            assert value == 500.0
        else:
            assert value is None  # omitted components stay null


def test_available_terrain_features_are_kept_when_supplied():
    vector = features.build_features(
        {
            "slope_degrees": 23.5,
            "aspect_degrees": 120.0,
            "river_distance_m": 400.0,
        }
    )
    assert vector["slope_degrees"] == 23.5
    assert vector["aspect_degrees"] == 120.0
    assert vector["river_distance_m"] == 400.0


def test_available_terrain_features_are_none_when_omitted():
    vector = features.build_features({"elevation": 500.0})
    assert vector["slope_degrees"] is None
    assert vector["aspect_degrees"] is None
    assert vector["river_distance_m"] is None


def test_build_features_coerces_numeric_strings_but_rejects_garbage():
    vector = features.build_features({"elevation": "652.0", "rainfall_1h": "n/a", "rainfall_3h": None})
    assert vector["elevation"] == 652.0
    assert vector["rainfall_1h"] is None
    assert vector["rainfall_3h"] is None


# ─── transform_vector: deterministic modelling transform ────────────────

def test_transform_vector_applies_log1p_to_rainfall_only():
    raw = features.build_features(
        {
            "rainfall_1h": 1.0, "rainfall_3h": 3.0, "rainfall_24h": 24.0,
            "soil_moisture_0_to_7cm": 55.0, "elevation": 652.0,
        }
    )
    transformed = features.transform_vector(raw)
    assert transformed["rainfall_1h"] == pytest.approx(math.log1p(1.0))
    assert transformed["rainfall_3h"] == pytest.approx(math.log1p(3.0))
    assert transformed["rainfall_24h"] == pytest.approx(math.log1p(24.0))
    # Non-rainfall features are passed through unchanged.
    assert transformed["soil_moisture_0_to_7cm"] == 55.0
    assert transformed["elevation"] == 652.0
    # None values stay None through the transform.
    assert transformed["slope_degrees"] is None
    assert transformed["rainfall_72h"] is None


def test_transform_vector_preserves_canonical_order():
    transformed = features.transform_vector(features.build_features({}))
    assert list(transformed.keys()) == features.feature_names()


# ─── Live inference adapter ─────────────────────────────────────────────

def test_live_feature_vector_uses_real_providers(
    mock_open_meteo, mock_elevation, mock_terrain, mock_river
):
    vector = features.live_feature_vector(30.555, 79.565)
    assert list(vector.keys()) == features.feature_names()
    # Default mock has 24h history: 1h/3h/6h/24h windows populate.
    assert vector["rainfall_1h"] == 1.0
    assert vector["rainfall_3h"] == 3.0
    assert vector["rainfall_6h"] == 6.0
    assert vector["rainfall_24h"] == 24.0
    # ML windows are honestly null when history is insufficient.
    assert vector["rainfall_72h"] is None
    assert vector["rainfall_7d"] is None
    assert vector["antecedent_rainfall_7d"] is None
    # Archive-aligned soil depth and real elevation.
    assert vector["soil_moisture_0_to_7cm"] == 55.0
    assert vector["elevation"] == 652.0
    # Terrain features come from their own providers (not fabricated).
    assert vector["slope_degrees"] == 23.5
    assert vector["aspect_degrees"] == 135.0
    # River distance is optional and defaults to None under the canned mock
    # (honest "no mapped river near / unavailable", never a guessed value).
    assert vector["river_distance_m"] is None
    # The weather provider must be queried for THIS location, not a default.
    assert mock_open_meteo.calls[0]["latitude"] == 30.555
    assert mock_open_meteo.calls[0]["longitude"] == 79.565
    assert mock_elevation.calls[0]["latitude"] == 30.555
    assert mock_terrain.calls[0]["latitude"] == 30.555
    assert mock_river.calls[0]["latitude"] == 30.555


def test_live_feature_vector_full_ml_windows(mock_open_meteo, mock_elevation, open_meteo_canned):
    mock_open_meteo.configure(payload=open_meteo_canned(past_precipitation=[1.0] * 168))
    vector = features.live_feature_vector(30.555, 79.565)
    assert vector["rainfall_72h"] == 72.0
    assert vector["rainfall_7d"] == 168.0
    assert vector["antecedent_rainfall_7d"] == 144.0
    assert vector["rainfall_24h"] == 24.0


def test_live_feature_vector_provider_failure_all_null(
    mock_open_meteo,
    mock_elevation,
    mock_terrain,
    mock_river,
    provider_error,
    elevation_error,
    terrain_error,
    river_error,
):
    mock_open_meteo.configure(error=provider_error)
    mock_elevation.configure(error=elevation_error)
    mock_terrain.configure(error=terrain_error)
    mock_river.configure(error=river_error)
    vector = features.live_feature_vector(30.555, 79.565)
    assert list(vector.keys()) == features.feature_names()
    assert all(value is None for value in vector.values())


def test_model_input_is_transform_of_live_vector(mock_open_meteo, mock_elevation):
    assert features.model_input(30.555, 79.565) == features.transform_vector(
        features.live_feature_vector(30.555, 79.565)
    )


# ─── Same definitions for training and live inference ───────────────────

def test_training_components_build_identical_vector_to_live():
    """The trainer reuses weather_service window helpers and build_features, so
    a live vector and a training row with the same raw numbers are identical."""
    precipitation = [1.0] * 168 + [2.0] * 24
    acc = weather_service.rainfall_accumulation(precipitation, now_index=167)
    ext = weather_service.extended_rainfall_accumulation(precipitation, now_index=167)
    training_components = {
        **acc,
        **ext,
        "soil_moisture_0_to_7cm": 55.0,
        "elevation": 652.0,
    }
    training_vector = features.transform_vector(features.build_features(training_components))

    # Live path with the same history/values produces the same transformed vector.
    live_vector = features.transform_vector(
        features.build_features(
            {
                "rainfall_1h": 1.0, "rainfall_3h": 3.0, "rainfall_6h": 6.0,
                "rainfall_24h": 24.0, "rainfall_72h": 72.0, "rainfall_7d": 168.0,
                "antecedent_rainfall_7d": 144.0,
                "soil_moisture_0_to_7cm": 55.0, "elevation": 652.0,
            }
        )
    )
    assert training_vector == live_vector