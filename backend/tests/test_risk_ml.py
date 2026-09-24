"""Focused tests for wiring the real ML predictor into /risk/assess (Phase 7).

Covers: predefined and arbitrary coordinates -> real ML prediction, missing
live feature -> honest unavailable, model status/version propagation, explicit
simulation/demo scenario behavior (``simulate: true``) intact, and existing
risk API compatibility.
"""
import pytest

from backend.app.risk_engine import features, predictor

REAL_ARTIFACT = predictor.DEFAULT_ARTIFACT_PATH

# Required features of the v1 production artifact (9 canonical features).
V1_REQUIRED = {
    "rainfall_1h", "rainfall_3h", "rainfall_6h", "rainfall_24h",
    "rainfall_72h", "rainfall_7d", "antecedent_rainfall_7d",
    "soil_moisture_0_to_7cm", "elevation",
}


@pytest.fixture(autouse=True)
def ml_predictor_ready():
    """Point the predictor at the real saved artifact and reset between tests."""
    predictor.configure(REAL_ARTIFACT)
    yield
    predictor.configure()


def assess(client, payload: dict):
    return client.post("/api/v1/risk/assess", json=payload)


def arbitrary_payload(latitude: float = 35.0, longitude: float = 78.5, scenario: str = "normal") -> dict:
    return {
        "location_id": f"arbitrary-{latitude}-{longitude}",
        "scenario": scenario,
        "latitude": latitude,
        "longitude": longitude,
    }


def with_full_history(client, mock_open_meteo, open_meteo_canned):
    """Give the mocked live provider 168h of past precipitation so every ML
    rainfall window (72h, 7d, antecedent) is available, exactly like a live
    forecast request with past_days=7."""
    mock_open_meteo.configure(payload=open_meteo_canned(past_precipitation=[1.0] * 168))


# ─── Arbitrary coordinates -> real ML prediction ─────────────────────────

def test_arbitrary_location_produces_real_ml_prediction(
    client, mock_open_meteo, mock_elevation, open_meteo_canned
):
    with_full_history(client, mock_open_meteo, open_meteo_canned)
    response = assess(client, arbitrary_payload())
    assert response.status_code == 200
    body = response.json()
    assert body["prediction_status"] == "PREDICTION"
    assert body["data_status"] == "LIVE"
    assert body["is_simulated"] is False
    assert isinstance(body["probability"], float)
    assert 0.0 <= body["probability"] <= 100.0
    assert body["risk_level"] in ("LOW", "MODERATE", "HIGH", "CRITICAL")
    assert body["probability"] not in (18.0, 51.0, 74.0, 87.0)  # not demo constants
    assert all(isinstance(factor, str) for factor in body["factors"])  # human-readable


def test_arbitrary_ml_prediction_matches_predictor_directly(
    client, mock_open_meteo, mock_elevation, open_meteo_canned
):
    with_full_history(client, mock_open_meteo, open_meteo_canned)
    latitude, longitude = 35.0, 78.5
    body = assess(client, arbitrary_payload(latitude, longitude)).json()
    expected = predictor.predict(features.build_features(features.live_components(latitude, longitude)))
    assert body["probability"] == expected["probability_pct"]
    assert body["risk_level"] == expected["risk_level"]
    assert body["contributing_factors"] == expected["contributing_factors"]


# ─── Missing live feature -> honest unavailable ──────────────────────────

def test_arbitrary_missing_live_feature_is_honest_unavailable(
    client, mock_open_meteo, mock_elevation
):
    # Default mock has only 24h history -> 72h/7d/antecedent windows are None.
    response = assess(client, arbitrary_payload())
    assert response.status_code == 200
    body = response.json()
    assert body["prediction_status"] == "UNAVAILABLE"
    assert body["reason"] == "DATA_INCOMPLETE"
    assert body["probability"] is None
    assert body["risk_level"] is None
    assert body["factors"] == []
    assert "rainfall_72h" in body["missing_features"]
    assert "rainfall_7d" in body["missing_features"]
    assert "no demo" in body["disclaimer"].lower() or "no demo/scenario" in body["disclaimer"].lower()
    assert body["is_simulated"] is False


def test_arbitrary_all_live_features_missing_is_unavailable(
    client, mock_open_meteo, mock_elevation, provider_error
):
    mock_open_meteo.configure(error=provider_error)
    body = assess(client, arbitrary_payload()).json()
    assert body["prediction_status"] == "UNAVAILABLE"
    assert body["reason"] == "DATA_INCOMPLETE"
    # Soil + all rainfall windows are missing (weather provider down); elevation
    # still resolves from its own provider. Slope/aspect are reported canonical
    # features but NOT required by the v1 artifact.
    expected_missing = V1_REQUIRED - {"elevation"}
    assert set(body["missing_features"]) == expected_missing
    assert "elevation" not in body["missing_features"]


# ─── Model status / version propagation ──────────────────────────────────

def test_ml_model_status_and_version_propagate(
    client, mock_open_meteo, mock_elevation, open_meteo_canned
):
    with_full_history(client, mock_open_meteo, open_meteo_canned)
    body = assess(client, arbitrary_payload()).json()
    assert body["model_version"] == "rf_calibrated_baseline_v1"
    assert "rf_calibrated_baseline_v1" in body["model_status"]
    assert "READY" in body["model_status"]
    assert body["model_status"] != "Not connected — demo scenario logic only"


def test_arbitrary_corrupt_model_reports_model_unavailable(
    client, mock_open_meteo, mock_elevation, open_meteo_canned, tmp_path
):
    with_full_history(client, mock_open_meteo, open_meteo_canned)
    corrupt = tmp_path / "corrupt.joblib"
    corrupt.write_bytes(b"garbage model payload")
    predictor.configure(corrupt)
    body = assess(client, arbitrary_payload()).json()
    assert body["prediction_status"] == "UNAVAILABLE"
    assert body["reason"] == "MODEL_UNAVAILABLE"
    assert body["probability"] is None
    assert body["risk_level"] is None
    assert body["model_status"] != "Not connected — demo scenario logic only"
    assert "no demo/scenario probability was substituted" in body["disclaimer"].lower()


# ─── Predefined demo locations -> live ML pipeline ───────────────────────

def test_predefined_location_uses_live_ml_pipeline(
    client, mock_open_meteo, mock_elevation, open_meteo_canned
):
    with_full_history(client, mock_open_meteo, open_meteo_canned)
    response = assess(client, {"location_id": "dehradun", "scenario": "normal"})
    assert response.status_code == 200
    body = response.json()
    assert body["prediction_status"] == "PREDICTION"
    assert body["data_status"] == "LIVE"
    assert body["is_simulated"] is False
    assert body["location_id"] == "dehradun"
    assert isinstance(body["probability"], float)
    assert 0.0 <= body["probability"] <= 100.0
    assert body["probability"] not in (18.0, 51.0, 74.0, 87.0)  # not demo constants
    assert body["model_status"] != "Not connected — demo scenario logic only"


def test_predefined_location_uses_its_own_fixture_coordinates(
    client, mock_open_meteo, mock_elevation, open_meteo_canned
):
    # joshimath carries distinct fixture coordinates; the live pipeline must
    # query weather/elevation for those coordinates, not the arbitrary default.
    with_full_history(client, mock_open_meteo, open_meteo_canned)
    assess(client, {"location_id": "joshimath", "scenario": "normal"})
    assert mock_open_meteo.calls[-1]["latitude"] == 30.555
    assert mock_open_meteo.calls[-1]["longitude"] == 79.565


def test_predefined_location_honest_unavailable(client, mock_open_meteo, mock_elevation):
    # Default mock has only 24h history -> the live ML windows are missing, so
    # the predefined location must return an honest UNAVAILABLE (no fabricated
    # probability, no demo substitution without simulate: true).
    response = assess(client, {"location_id": "dehradun", "scenario": "normal"})
    assert response.status_code == 200
    body = response.json()
    assert body["prediction_status"] == "UNAVAILABLE"
    assert body["reason"] == "DATA_INCOMPLETE"
    assert body["probability"] is None
    assert body["risk_level"] is None
    assert body["is_simulated"] is False
    assert set(body["missing_features"]) == {
        "rainfall_72h",
        "rainfall_7d",
        "antecedent_rainfall_7d",
    }
    assert body["location_id"] == "dehradun"


# ─── Demo scenario behavior remains intact (explicit simulate: true) ─────

def test_predefined_demo_location_scenario_unchanged(client):
    for scenario, probability, level in (
        ("normal", 18, "LOW"),
        ("heavy_rain", 51, "MODERATE"),
        ("extreme_rain", 74, "HIGH"),
        ("critical_flood", 87, "CRITICAL"),
    ):
        body = assess(
            client,
            {"location_id": "joshimath", "scenario": scenario, "simulate": True},
        ).json()
        assert body["data_status"] == "DEMO"
        assert body["is_simulated"] is True
        assert body["probability"] == probability
        assert body["risk_level"] == level
        assert body["model_status"] == "Not connected — demo scenario logic only"
        assert body["prediction_status"] is None  # demo path has no ML status


def test_predefined_demo_never_uses_predictor(
    client, mock_open_meteo, mock_elevation, tmp_path
):
    # Even if the model is pointing at a corrupt artifact, an explicit
    # simulation request keeps its scenario result untouched.
    corrupt = tmp_path / "corrupt.joblib"
    corrupt.write_bytes(b"garbage model payload")
    predictor.configure(corrupt)
    response = assess(
        client,
        {"location_id": "dehradun", "scenario": "critical_flood", "simulate": True},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["data_status"] == "DEMO"
    assert body["probability"] == 87
    assert body["risk_level"] == "CRITICAL"


# ─── Existing risk API compatibility ─────────────────────────────────────

def test_existing_risk_field_contract_intact_for_live_ml(
    client, mock_open_meteo, mock_elevation, open_meteo_canned
):
    with_full_history(client, mock_open_meteo, open_meteo_canned)
    body = assess(client, arbitrary_payload()).json()
    for key in (
        "location_id", "scenario", "scenario_label", "probability", "risk_level",
        "factors", "warning", "recommended_action", "terrain", "weather",
        "model_status", "data_status", "is_simulated", "timestamp", "disclaimer",
    ):
        assert key in body
    assert body["scenario"] in ("normal", "heavy_rain", "extreme_rain", "critical_flood")
    assert body["terrain"]["slope"] == 23.5
    assert body["terrain"]["aspect"] == 135.0
    assert body["terrain"]["river_distance"] is None
    assert body["weather"]["wind_direction"] == "NW"


def test_risk_unknown_location_without_coordinates_404(client):
    response = assess(client, {"location_id": "atlantis", "scenario": "normal"})
    assert response.status_code == 404
    assert "unknown" in response.json()["detail"].lower()


def test_live_risk_response_carries_real_river_distance(
    client, mock_open_meteo, mock_elevation, mock_river, open_meteo_canned
):
    # The provider returns a real HydroRIVERS-backed distance; it must be
    # exposed as an integer metre value in the LIVE terrain payload — never
    # dropped, never zeroed.
    mock_river.configure(distance=3120.4)
    with_full_history(client, mock_open_meteo, open_meteo_canned)
    body = assess(client, arbitrary_payload()).json()
    assert body["data_status"] == "LIVE"
    assert body["prediction_status"] == "PREDICTION"
    assert body["terrain"]["river_distance"] == 3120


def test_live_risk_response_keeps_none_river_distance_when_provider_returns_none(
    client, mock_open_meteo, mock_elevation, mock_river, open_meteo_canned
):
    # Unknown/unmapped rivers stay honest None in the response — the UI must
    # render "Unavailable", not a fabricated 0 m.
    mock_river.configure(distance=None)
    with_full_history(client, mock_open_meteo, open_meteo_canned)
    body = assess(client, arbitrary_payload()).json()
    assert body["data_status"] == "LIVE"
    assert body["terrain"]["river_distance"] is None


def test_risk_scenario_normalization_still_applies(client):
    response = assess(
        client,
        {"location_id": "dehradun", "scenario": "critical-flood", "simulate": True},
    )
    assert response.status_code == 200
    assert response.json()["probability"] == 87