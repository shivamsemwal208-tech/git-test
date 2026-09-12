def test_weather_current(client, mock_open_meteo):
    response = client.get("/api/v1/weather/current", params={"location_id": "dehradun", "scenario": "normal"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "LIVE"
    assert body["data_status"] == "LIVE"
    assert body["source"] == "Open-Meteo"
    assert body["is_simulated"] is False
    assert body["location_name"] == "Dehradun"
    assert body["temperature"] == 24.0
    assert body["humidity"] == 68.0
    assert body["current_rainfall"] == 1.0
    assert body["rainfall_1h"] == 1.0
    assert body["rainfall_3h"] == 3.0
    assert body["rainfall_6h"] == 6.0
    assert body["rainfall_24h"] == 24.0
    assert body["forecast_rainfall"] == 48.0
    assert body["wind_direction"] == "NW"
    assert body["soil_moisture"] == 42.0
    assert body["soil_moisture_0_to_7cm"] == 55.0
    # The default mock has only 24h of history, so the ML windows are honestly null.
    assert body["rainfall_72h"] is None
    assert body["rainfall_7d"] is None
    assert body["antecedent_rainfall_7d"] is None
    assert mock_open_meteo.calls[0]["latitude"] == 30.3165
    assert mock_open_meteo.calls[0]["longitude"] == 78.0322


def test_weather_current_accepts_hyphenated_scenario(client, mock_open_meteo):
    response = client.get("/api/v1/weather/current", params={"scenario": "heavy-rain"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "LIVE"
    assert body["scenario"] == "heavy_rain"


def test_weather_current_provider_failure_returns_unavailable(client, mock_open_meteo, provider_error):
    mock_open_meteo.configure(error=provider_error)
    response = client.get("/api/v1/weather/current", params={"location_id": "dehradun"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "UNAVAILABLE"
    assert body["temperature"] is None
    assert body["hourly_rainfall"] is None
    assert body["note"] is not None


def test_weather_forecast(client, mock_open_meteo):
    response = client.get("/api/v1/weather/forecast", params={"scenario": "extreme_rain"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "LIVE"
    assert body["source"] == "Open-Meteo"
    assert body["forecast_rainfall"] == 48.0
    assert len(body["hourly_rainfall"]) == 24
    assert len(body["entries"]) == 24


def test_seismic_latest(client):
    response = client.get("/api/v1/seismic/latest", params={"location_id": "dehradun"})
    assert response.status_code == 200
    body = response.json()
    assert body["magnitude"] == 4.8
    assert body["earthquake_prediction_provided"] is False
    assert len(body["secondary_hazards"]) == 5


def test_safe_places(client):
    response = client.get("/api/v1/safe-places", params={"location_id": "dehradun"})
    assert response.status_code == 200
    body = response.json()
    assert len(body["places"]) == 3
    assert all(place["data_status"] == "DEMO" for place in body["places"])


def test_alerts(client):
    response = client.get("/api/v1/alerts", params={"location_id": "dehradun", "scenario": "critical_flood"})
    assert response.status_code == 200
    body = response.json()
    assert len(body["alerts"]) == 2
    assert body["alerts"][0]["severity"] == "CRITICAL"


def test_evacuation_assess(client):
    response = client.post(
        "/api/v1/evacuation/assess",
        json={"location_id": "dehradun", "destination_id": "dehradun-relief", "scenario": "critical_flood"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["illustrative"] is True
    assert len(body["coordinates"]) == 3
    assert "not guaranteed safe" in body["hazard_warning"].lower()