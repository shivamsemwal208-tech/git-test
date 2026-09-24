"""Focused tests for the Phase-6 ML predictor service.

Covers the required behaviours: successful prediction, probability/risk-band
mapping, model loading, missing/corrupt artifact, missing required features,
contributing factors, and model version/status honesty.
"""
import math

import pytest

from backend.app.risk_engine import predictor
from backend.app.risk_engine.predictor import (
    DEFAULT_ARTIFACT_PATH,
    PredictorError,
    _canonical_missing_order,
    configure,
    contributing_factors,
    load_model,
    predict,
    risk_level,
)

REAL_ARTIFACT = DEFAULT_ARTIFACT_PATH

# The v1 production artifact contract: 9 canonical features. Slope/aspect/river
# are reported canonical features but NOT required by the loaded artifact.
V1_FEATURES = (
    "rainfall_1h", "rainfall_3h", "rainfall_6h", "rainfall_24h",
    "rainfall_72h", "rainfall_7d", "antecedent_rainfall_7d",
    "soil_moisture_0_to_7cm", "elevation",
)


@pytest.fixture(autouse=True)
def clean_predictor_state():
    """Reset predictor cache/path so tests are independent and never leak."""
    configure()
    yield
    configure()


def complete_vector() -> dict:
    """A canonical RAW feature vector with all 12 features present (units follow
    the shared engine: mm, soil %, m, degrees, m). The v1 artifact's 9 required
    features are all supplied; slope/aspect/river are present for completeness
    but are not part of the required contract."""
    return {
        "rainfall_1h": 2.0,
        "rainfall_3h": 6.0,
        "rainfall_6h": 12.0,
        "rainfall_24h": 40.0,
        "rainfall_72h": 110.0,
        "rainfall_7d": 180.0,
        "antecedent_rainfall_7d": 96.0,
        "soil_moisture_0_to_7cm": 62.0,
        "elevation": 950.0,
        "slope_degrees": 23.5,
        "aspect_degrees": 135.0,
        "river_distance_m": 350.0,
    }


# ─── Successful prediction ───────────────────────────────────────────────

def test_successful_prediction_uses_real_artifact(clean_predictor_state):
    result = predict(complete_vector(), path=REAL_ARTIFACT)
    assert result["status"] == "PREDICTION"
    assert isinstance(result["probability_pct"], float)
    assert 0.0 <= result["probability_pct"] <= 100.0
    assert result["risk_level"] in ("LOW", "MODERATE", "HIGH", "CRITICAL")
    assert result["model_status"] == "READY"
    assert result["data_status"] == "COMPLETE"
    assert result["model"]["version"] == "rf_calibrated_baseline_v1"
    assert result["model"]["loaded"] is True
    assert result["model_path"] == str(REAL_ARTIFACT)
    assert "timestamp" in result


# ─── Probability / risk-band mapping ─────────────────────────────────────

@pytest.mark.parametrize(
    "probability,expected",
    [
        (0.0, "LOW"),
        (10.0, "LOW"),
        (29.99, "LOW"),
        (30.0, "MODERATE"),
        (45.5, "MODERATE"),
        (59.99, "MODERATE"),
        (60.0, "HIGH"),
        (74.0, "HIGH"),
        (79.99, "HIGH"),
        (80.0, "CRITICAL"),
        (100.0, "CRITICAL"),
    ],
)
def test_risk_level_maps_probability_to_existing_bands(probability, expected):
    assert risk_level(probability) == expected


def test_risk_level_clamps_out_of_range_inputs():
    assert risk_level(-5.0) == "LOW"
    assert risk_level(101.0) == "CRITICAL"


def test_predicted_level_matches_band_function():
    result = predict(complete_vector(), path=REAL_ARTIFACT)
    assert result["risk_level"] == risk_level(result["probability_pct"])


# ─── Model loading ───────────────────────────────────────────────────────

def test_load_model_reads_real_artifact(clean_predictor_state):
    loaded = load_model(REAL_ARTIFACT)
    assert loaded.version == "rf_calibrated_baseline_v1"
    assert loaded.feature_names == V1_FEATURES
    assert len(loaded.model.predict_proba([[0.2] * len(V1_FEATURES)])) == 1
    assert set(loaded.importance) == set(loaded.feature_names)


def test_load_model_missing_artifact_raises(tmp_path):
    with pytest.raises(PredictorError) as excinfo:
        load_model(tmp_path / "nope.joblib")
    assert "not found" in str(excinfo.value)


def test_load_model_corrupt_artifact_raises(tmp_path):
    corrupt = tmp_path / "corrupt.joblib"
    corrupt.write_bytes(b"this is not a joblib file...\x00\x01garbage")
    with pytest.raises(PredictorError) as excinfo:
        load_model(corrupt)
    assert "corrupt" in str(excinfo.value)


# ─── Missing / corrupt artifact produce honest unavailable results ───────

def test_predict_missing_artifact_is_honest_unavailable(tmp_path):
    result = predict(complete_vector(), path=tmp_path / "missing.joblib")
    assert result["status"] == "UNAVAILABLE"
    assert result["reason"] == "MODEL_UNAVAILABLE"
    assert result["probability_pct"] is None
    assert result["risk_level"] is None
    assert result["model_status"] == "UNAVAILABLE"
    assert result["contributing_factors"] == []
    assert "No demo-scenario probability" in result["disclaimer"]


def test_predict_corrupt_artifact_is_honest_unavailable(tmp_path):
    corrupt = tmp_path / "corrupt.joblib"
    corrupt.write_bytes(b"definitely not a valid model\xff\xfe")
    result = predict(complete_vector(), path=corrupt)
    assert result["status"] == "UNAVAILABLE"
    assert result["reason"] == "MODEL_UNAVAILABLE"
    assert result["probability_pct"] is None


# ─── Missing required features → DATA_INCOMPLETE (never fabricated) ──────

def test_predict_missing_one_required_feature_is_data_incomplete(
    clean_predictor_state,
):
    vector = complete_vector()
    del vector["rainfall_7d"]
    result = predict(vector, path=REAL_ARTIFACT)
    assert result["status"] == "UNAVAILABLE"
    assert result["reason"] == "DATA_INCOMPLETE"
    assert result["data_status"] == "INCOMPLETE"
    assert result["missing_features"] == ["rainfall_7d"]
    assert "rainfall_7d" in result["detail"]
    assert result["probability_pct"] is None
    # the model itself is healthy — that is reported honestly
    assert result["model_status"] == "READY"


def test_predict_empty_vector_lists_all_required_features():
    result = predict({}, path=REAL_ARTIFACT)
    assert result["reason"] == "DATA_INCOMPLETE"
    assert set(result["missing_features"]) == set(V1_FEATURES)


def test_predict_non_numeric_feature_is_treated_as_missing():
    vector = complete_vector()
    vector["elevation"] = "not-a-number"
    result = predict(vector, path=REAL_ARTIFACT)
    assert result["reason"] == "DATA_INCOMPLETE"
    assert "elevation" in result["missing_features"]


# ─── Contributing factors ────────────────────────────────────────────────

def test_contributing_factors_are_ranked_by_learned_importance(
    clean_predictor_state,
):
    loaded = load_model(REAL_ARTIFACT)
    vector = complete_vector()
    factors = contributing_factors(loaded, predictor.build_features(vector))
    assert len(factors) == 3
    importances = [f["importance"] for f in factors]
    assert importances == sorted(importances, reverse=True)
    for factor in factors:
        assert factor["feature"] in loaded.feature_names
        assert factor["value"] == vector[factor["feature"]]
        assert isinstance(factor["unit"], str)
        assert "importance" in factor


def test_contributing_factors_referenced_in_explanation():
    result = predict(complete_vector(), path=REAL_ARTIFACT)
    for factor in result["contributing_factors"]:
        assert factor["feature"] in result["explanation"]


# ─── Model version / status honesty ──────────────────────────────────────

def test_prediction_reports_model_version_and_not_demo():
    result = predict(complete_vector(), path=REAL_ARTIFACT)
    assert result["model"]["version"] == "rf_calibrated_baseline_v1"
    assert result["model_status"] == "READY"
    assert "baseline" in result["disclaimer"].lower()

    # Ensure the probability is actually derived from the artifact, not a
    # demo-scenario constant (demo constants: 18, 51, 74, 87).
    assert result["probability_pct"] not in {18.0, 51.0, 74.0, 87.0}


def test_probability_is_finite_float_and_equals_artifact_output():
    loaded = load_model(REAL_ARTIFACT)
    result = predict(complete_vector(), path=REAL_ARTIFACT)
    from backend.app.risk_engine.features import transform_vector

    transformed = transform_vector(predictor.build_features(complete_vector()))
    row = [[float(transformed[name]) for name in loaded.feature_names]]
    expected = loaded.model.predict_proba(row)[0, 1] * 100.0
    assert result["probability_pct"] == pytest.approx(expected, abs=0.06)
    assert math.isfinite(result["probability_pct"])


# ─── Deterministic missing-feature diagnostics (no artifact needed) ────────

def test_canonical_missing_order_is_deterministic():
    # Artifact order is not the schema order; the reported list must be.
    assert _canonical_missing_order(
        ["antecedent_rainfall_7d", "rainfall_7d", "rainfall_72h"]
    ) == ["rainfall_72h", "rainfall_7d", "antecedent_rainfall_7d"]
    # Duplicates collapse, unknown names sort after known ones.
    assert _canonical_missing_order(["X", "elevation", "elevation"]) == ["elevation", "X"]
    # The output never depends on the input order.
    scrambled = list(reversed(V1_FEATURES))
    assert _canonical_missing_order(scrambled) == list(V1_FEATURES)