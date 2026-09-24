"""Phase 1: /risk/assess request validation and honest live diagnostics.

Covers: arbitrary in-range coordinates accepted (with edge values), out-of-range
latitude/longitude rejected with 422 even for simulation requests, genuine
DATA_INCOMPLETE reporting with deterministic (canonical-order) missing features,
`simulate: false` never substituting a demo probability, and the single-fetch
weather reuse in the live ML pipeline.
"""
import pytest

from backend.app.risk_engine import predictor

REAL_ARTIFACT = predictor.DEFAULT_ARTIFACT_PATH

# Canonical FEATURE_NAMES order (see risk_engine/features.FEATURE_NAMES).
CANONICAL_MISSING = ["rainfall_72h", "rainfall_7d", "antecedent_rainfall_7d"]


@pytest.fixture(autouse=True)
def ml_predictor_ready():
    """Point the predictor at the real saved artifact and reset between tests."""
    predictor.configure(REAL_ARTIFACT)
    yield
    predictor.configure()


def assess(client, payload: dict):
    return client.post("/api/v1/risk/assess", json=payload)


def arbitrary_payload(latitude: float, longitude: float, scenario: str = "normal") -> dict:
    return {
        "location_id": f"arbitrary-{latitude}-{longitude}",
        "scenario": scenario,
        "latitude": latitude,
        "longitude": longitude,
    }


def with_full_history(client, mock_open_meteo, open_meteo_canned):
    """168h of past precipitation so every ML rainfall window is available."""
    mock_open_meteo.configure(payload=open_meteo_canned(past_precipitation=[1.0] * 168))


# ─── Coordinate validation ──────────────────────────────────────────────────

def test_valid_arbitrary_coordinates_accepted(
    client, mock_open_meteo, mock_elevation, open_meteo_canned
):
    with_full_history(client, mock_open_meteo, open_meteo_canned)
    response = assess(client, arbitrary_payload(35.0, 78.5))
    assert response.status_code == 200
    body = response.json()
    assert body["prediction_status"] == "PREDICTION"
    assert body["data_status"] == "LIVE"


@pytest.mark.parametrize(
    "latitude,longitude",
    [
        (-90.0, 0.0),
        (90.0, 0.0),
        (0.0, -180.0),
        (0.0, 180.0),
    ],
)
def test_boundary_coordinate_values_accepted(
    client, mock_open_meteo, mock_elevation, open_meteo_canned, latitude, longitude
):
    with_full_history(client, mock_open_meteo, open_meteo_canned)
    response = assess(client, arbitrary_payload(latitude, longitude))
    assert response.status_code == 200


@pytest.mark.parametrize("latitude", [90.1, -90.1])
def test_out_of_range_latitude_rejected_422(client, latitude):
    response = assess(client, arbitrary_payload(latitude, 78.5))
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert any("latitude" in str(item["loc"]) for item in detail)


@pytest.mark.parametrize("longitude", [180.1, -180.1])
def test_out_of_range_longitude_rejected_422(client, longitude):
    response = assess(client, arbitrary_payload(35.0, longitude))
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert any("longitude" in str(item["loc"]) for item in detail)


def test_invalid_coordinates_rejected_even_for_simulation(client):
    # Validation applies before any demo/scenario path: an explicit bad
    # coordinate is a client error, not something to simulate around.
    response = assess(
        client,
        {
            "location_id": "dehradun",
            "scenario": "critical_flood",
            "simulate": True,
            "latitude": 100.0,
            "longitude": 78.0,
        },
    )
    assert response.status_code == 422


def test_missing_coordinates_with_unknown_location_still_404(client):
    response = assess(client, {"location_id": "atlantis", "scenario": "normal"})
    assert response.status_code == 404


# ─── Deterministic DATA_INCOMPLETE diagnostics ──────────────────────────────

def test_genuine_data_incomplete_is_deterministic(client, mock_open_meteo, mock_elevation):
    # Default mocked provider has only 24h history: the 72h/7d/antecedent ML
    # windows are genuinely missing live features.
    body = assess(client, arbitrary_payload(35.0, 78.5)).json()
    assert body["prediction_status"] == "UNAVAILABLE"
    assert body["reason"] == "DATA_INCOMPLETE"
    assert body["probability"] is None
    assert body["risk_level"] is None
    assert body["is_simulated"] is False
    # Missing features are reported in canonical schema order, not artifact order.
    assert body["missing_features"] == CANONICAL_MISSING


def test_simulate_false_never_substitutes_demo_probability(client, mock_open_meteo, mock_elevation):
    # Predefined demo location, critical_flood (demo constant 87), but the live
    # pipeline is incomplete and simulate=false: honest UNAVAILABLE, never 87.
    body = assess(client, {"location_id": "dehradun", "scenario": "critical_flood"}).json()
    assert body["data_status"] == "LIVE"
    assert body["is_simulated"] is False
    assert body["prediction_status"] == "UNAVAILABLE"
    assert body["reason"] == "DATA_INCOMPLETE"
    assert body["probability"] is None
    assert body["risk_level"] is None
    assert "no demo" in body["disclaimer"].lower()


# ─── Single-fetch weather reuse ─────────────────────────────────────────────

def test_live_prediction_conforms_to_single_fetch(
    client, mock_open_meteo, mock_elevation, open_meteo_canned
):
    """The risk route shares one weather payload between the display payload
    and the ML feature builder: the provider is hit exactly once per request
    (regression guard — a second fetch would race or desync the display).
    """
    with_full_history(client, mock_open_meteo, open_meteo_canned)
    body = assess(client, arbitrary_payload(35.0, 78.5)).json()
    assert body["prediction_status"] == "PREDICTION"
    assert len(mock_open_meteo.calls) == 1