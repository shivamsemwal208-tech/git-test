import pytest


def simulate(client, payload: dict):
    """POST /risk/assess with an explicit simulation/demo scenario request."""
    return client.post("/api/v1/risk/assess", json={**payload, "simulate": True})


def test_risk_assessment_demo_scenario_normal(client):
    response = simulate(
        client,
        {"location_id": "dehradun", "scenario": "normal"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["risk_level"] == "LOW"
    assert body["probability"] == 18
    assert body["data_status"] == "DEMO"
    assert body["model_status"] == "Not connected — demo scenario logic only"


def test_risk_assessment_demo_scenario_critical(client):
    response = simulate(
        client,
        {"location_id": "joshimath", "scenario": "critical_flood"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["risk_level"] == "CRITICAL"
    assert body["probability"] == 87
    assert body["location_id"] == "joshimath"


@pytest.mark.parametrize(
    "hyphenated,underscored",
    [
        ("heavy-rain", "heavy_rain"),
        ("extreme-rain", "extreme_rain"),
        ("critical-flood", "critical_flood"),
    ],
)
def test_risk_assessment_scenario_normalization(client, hyphenated, underscored):
    hyphenated_response = simulate(
        client,
        {"location_id": "dehradun", "scenario": hyphenated},
    )
    underscored_response = simulate(
        client,
        {"location_id": "dehradun", "scenario": underscored},
    )
    assert hyphenated_response.status_code == 200
    assert underscored_response.status_code == 200
    assert hyphenated_response.json()["probability"] == underscored_response.json()["probability"]
    assert hyphenated_response.json()["risk_level"] == underscored_response.json()["risk_level"]


def test_risk_assessment_invalid_location(client):
    response = client.post(
        "/api/v1/risk/assess",
        json={"location_id": "atlantis", "scenario": "normal"},
    )
    assert response.status_code == 404
    assert "unknown demo location" in response.json()["detail"].lower()


def test_risk_assessment_invalid_scenario(client):
    response = client.post(
        "/api/v1/risk/assess",
        json={"location_id": "dehradun", "scenario": "mega-flood"},
    )
    assert response.status_code in (404, 422)


def test_risk_assessment_location_variation(client):
    dehradun = simulate(
        client,
        {"location_id": "dehradun", "scenario": "critical_flood"},
    ).json()
    nainital = simulate(
        client,
        {"location_id": "nainital", "scenario": "critical_flood"},
    ).json()
    assert dehradun["terrain"]["elevation"] == 640
    assert nainital["terrain"]["elevation"] == 2084
    assert dehradun["terrain"]["slope"] == 34
    assert nainital["terrain"]["slope"] == 29