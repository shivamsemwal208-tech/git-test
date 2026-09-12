"""Tests for arbitrary-coordinate location support.

Weather and terrain elevation/soil moisture resolve live (mocked Open-Meteo)
for arbitrary coordinates; the remaining risk fields, safe places, alerts and
evacuation stay demo/unavailable for arbitrary coordinates, while seismic uses
the real (mocked) USGS catalogue.
"""


def test_risk_arbitrary_coordinates_real_ml_prediction(
    client, mock_open_meteo, mock_elevation, open_meteo_canned
):
    # Seven days of history -> all ML rainfall windows are available live.
    mock_open_meteo.configure(payload=open_meteo_canned(past_precipitation=[1.0] * 168))
    response = client.post(
        "/api/v1/risk/assess",
        json={
            "location_id": "arbitrary-35.0-78.5",
            "scenario": "critical_flood",
            "latitude": 35.0,
            "longitude": 78.5,
            "location_name": "High Camp",
        },
    )
    assert response.status_code == 200
    body = response.json()
    # Real ML prediction, clearly marked LIVE and not simulated.
    assert body["data_status"] == "LIVE"
    assert body["is_simulated"] is False
    assert body["prediction_status"] == "PREDICTION"
    assert isinstance(body["probability"], float)
    assert 0.0 <= body["probability"] <= 100.0
    assert body["risk_level"] in ("LOW", "MODERATE", "HIGH", "CRITICAL")
    assert body["model_version"] == "rf_calibrated_baseline_v1"
    assert body["factors"]
    assert body["contributing_factors"]
    # Live canonical features feed the model: real elevation/soil/rain windows.
    assert body["terrain"]["elevation"] == 652
    assert body["terrain"]["soil_moisture"] == 42.0
    assert body["terrain"]["slope"] == 23.5
    assert body["terrain"]["aspect"] == 135.0
    assert body["terrain"]["river_distance"] is None
    assert body["weather"]["rainfall_72h"] == 72
    assert body["weather"]["soil_moisture_0_to_7cm"] == 55.0
    assert body["location_id"] == "arbitrary-35.0-78.5"
    # The live sources must be queried for the requested coordinates, never a demo location.
    assert mock_elevation.calls[0]["latitude"] == 35.0
    assert mock_elevation.calls[0]["longitude"] == 78.5
    assert mock_open_meteo.calls[0]["latitude"] == 35.0
    assert mock_open_meteo.calls[0]["longitude"] == 78.5


def test_risk_arbitrary_requires_preset_scenario(client, mock_open_meteo, mock_elevation):
    # Only 24h of history -> ML rainfall windows are incomplete -> honest
    # unavailable, never a demo/scenario probability.
    for scenario in ("normal", "heavy_rain", "extreme_rain", "critical_flood"):
        response = client.post(
            "/api/v1/risk/assess",
            json={"location_id": "x", "latitude": 30.0, "longitude": 79.0, "scenario": scenario},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["data_status"] == "LIVE"
        assert body["is_simulated"] is False
        assert body["prediction_status"] == "UNAVAILABLE"
        assert body["reason"] == "DATA_INCOMPLETE"
        assert body["probability"] is None
        assert body["risk_level"] is None


def test_risk_unknown_location_without_coordinates_404(client):
    response = client.post(
        "/api/v1/risk/assess",
        json={"location_id": "atlantis", "scenario": "normal"},
    )
    assert response.status_code == 404


def test_risk_arbitrary_elevation_failure_is_null(client, mock_open_meteo, mock_elevation, elevation_error):
    mock_elevation.configure(error=elevation_error)
    response = client.post(
        "/api/v1/risk/assess",
        json={"location_id": "x", "scenario": "normal", "latitude": 35.0, "longitude": 78.5},
    )
    body = response.json()
    assert response.status_code == 200
    # Live data stays honest (elevation unknown -> feature missing -> unavailable).
    assert body["terrain"]["elevation"] is None
    assert body["terrain"]["soil_moisture"] == 42.0
    assert body["prediction_status"] == "UNAVAILABLE"
    assert "elevation" in body["missing_features"]


def test_risk_arbitrary_weather_failure_keeps_elevation(client, mock_open_meteo, mock_elevation, provider_error):
    mock_open_meteo.configure(error=provider_error)
    response = client.post(
        "/api/v1/risk/assess",
        json={"location_id": "x", "scenario": "normal", "latitude": 35.0, "longitude": 78.5},
    )
    body = response.json()
    assert response.status_code == 200
    # Elevation survives a weather outage; the ML prediction honestly stays
    # unavailable (rock: no fabricated or demo probability).
    assert body["terrain"]["elevation"] == 652
    assert body["terrain"]["soil_moisture"] is None
    assert body["prediction_status"] == "UNAVAILABLE"
    assert body["probability"] is None


def test_weather_current_arbitrary_coordinates(client, mock_open_meteo):
    response = client.get(
        "/api/v1/weather/current",
        params={"location_id": "arbitrary-35.0-78.5", "latitude": 35.0, "longitude": 78.5},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "LIVE"
    assert body["data_status"] == "LIVE"
    assert body["location_id"] == "arbitrary-35.0-78.5"
    assert body["latitude"] == 35.0
    assert body["longitude"] == 78.5
    assert body["temperature"] == 24.0
    assert len(mock_open_meteo.calls) == 1
    assert mock_open_meteo.calls[0]["latitude"] == 35.0
    assert mock_open_meteo.calls[0]["longitude"] == 78.5


def test_weather_forecast_arbitrary_coordinates(client, mock_open_meteo):
    response = client.get(
        "/api/v1/weather/forecast",
        params={"location_id": "arbitrary-35.0-78.5", "latitude": 35.0, "longitude": 78.5},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "LIVE"
    assert body["location_id"] == "arbitrary-35.0-78.5"
    assert len(body["entries"]) == 24
    assert mock_open_meteo.calls[0]["latitude"] == 35.0
    assert mock_open_meteo.calls[0]["longitude"] == 78.5


def test_weather_current_arbitrary_provider_failure(client, mock_open_meteo, provider_error):
    mock_open_meteo.configure(error=provider_error)
    response = client.get(
        "/api/v1/weather/current",
        params={"location_id": "arbitrary-35.0-78.5", "latitude": 35.0, "longitude": 78.5},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "UNAVAILABLE"
    assert body["temperature"] is None
    assert body["note"] is not None


def test_safe_places_arbitrary_coordinates_empty(client):
    response = client.get(
        "/api/v1/safe-places",
        params={"location_id": "arbitrary-35.0-78.5", "latitude": 35.0, "longitude": 78.5},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["data_status"] == "DEMO_UNAVAILABLE"
    assert body["places"] == []


def test_alerts_arbitrary_coordinates_empty(client):
    response = client.get(
        "/api/v1/alerts",
        params={
            "location_id": "arbitrary-35.0-78.5",
            "scenario": "critical_flood",
            "latitude": 35.0,
            "longitude": 78.5,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["data_status"] == "DEMO_UNAVAILABLE"
    assert body["alerts"] == []


def test_seismic_latest_arbitrary_coordinates_no_event(client, mock_usgs):
    response = client.get(
        "/api/v1/seismic/latest",
        params={"location_id": "arbitrary-35.0-78.5", "latitude": 35.0, "longitude": 78.5},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["data_status"] == "UNAVAILABLE"
    assert body["seismic_status"] == "NO RECENT EVENT"
    assert body["magnitude"] is None
    assert body["secondary_hazards"] == []
    assert mock_usgs.calls[0]["latitude"] == 35.0
    assert mock_usgs.calls[0]["longitude"] == 78.5


def test_seismic_latest_arbitrary_coordinates_live_event(client, mock_usgs, canned_usgs_event):
    mock_usgs.configure(event=canned_usgs_event())
    response = client.get(
        "/api/v1/seismic/latest",
        params={"location_id": "arbitrary-35.0-78.5", "latitude": 35.0, "longitude": 78.5},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["data_status"] == "LIVE"
    assert body["is_simulated"] is False
    assert body["seismic_status"] == "MONITORING"
    assert body["magnitude"] == 4.2
    assert body["distance_km"] == 35.0
    assert body["event_id"] == "us2026demo1"
    assert body["earthquake_prediction_provided"] is False
    assert body["secondary_hazards"] == []


def test_seismic_latest_arbitrary_coordinates_provider_failure(client, mock_usgs, usgs_error):
    mock_usgs.configure(error=usgs_error)
    response = client.get(
        "/api/v1/seismic/latest",
        params={"location_id": "arbitrary-35.0-78.5", "latitude": 35.0, "longitude": 78.5},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["data_status"] == "UNAVAILABLE"
    assert body["seismic_status"] == "DATA UNAVAILABLE"
    assert body["magnitude"] is None
    assert body["secondary_hazards"] == []


def test_evacuation_arbitrary_coordinates_unavailable(client):
    response = client.post(
        "/api/v1/evacuation/assess",
        json={
            "location_id": "arbitrary-35.0-78.5",
            "destination_id": "some-destination",
            "scenario": "critical_flood",
            "latitude": 35.0,
            "longitude": 78.5,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["data_status"] == "DEMO_UNAVAILABLE"
    assert body["route_status"] == "Unavailable"
    assert body["distance_km"] is None


def test_evacuation_unknown_location_without_coordinates_404(client):
    response = client.post(
        "/api/v1/evacuation/assess",
        json={
            "location_id": "atlantis",
            "destination_id": "some-destination",
            "scenario": "critical_flood",
        },
    )
    assert response.status_code == 404