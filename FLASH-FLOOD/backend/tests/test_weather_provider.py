"""Tests for the Open-Meteo weather provider and its normalization service."""
import httpx
import pytest

from backend.app.data_sources import weather_provider
from backend.app.data_sources.weather_provider import ProviderError
from backend.app.services import weather_service


# ─── Provider transport ────────────────────────────────────────────────

def test_fetch_open_meteo_builds_request_with_requested_coordinates(monkeypatch, open_meteo_canned):
    captured = {}

    def fake_get(url, params=None, timeout=None):
        captured["url"] = url
        captured["params"] = params
        captured["timeout"] = timeout

        class FakeResponse:
            def raise_for_status(self):
                pass

            def json(self):
                return open_meteo_canned(latitude=35.0, longitude=78.5)

        return FakeResponse()

    monkeypatch.setattr(weather_provider, "_http_get", fake_get)
    result = weather_provider.fetch_open_meteo(35.0, 78.5)
    assert captured["url"] == weather_provider.FORECAST_URL
    assert captured["params"]["latitude"] == 35.0
    assert captured["params"]["longitude"] == 78.5
    assert "past_days" in captured["params"]
    assert captured["params"]["past_days"] == weather_provider.PAST_DAYS
    assert captured["params"]["past_days"] == 7
    assert "forecast_days" in captured["params"]
    assert captured["params"]["timezone"] == "GMT"
    assert captured["timeout"] == weather_provider.REQUEST_TIMEOUT_SECONDS
    assert result["latitude"] == 35.0


def test_fetch_open_meteo_http_error_raises_provider_error(monkeypatch):
    def fake_get(url, params=None, timeout=None):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(weather_provider, "_http_get", fake_get)
    with pytest.raises(ProviderError):
        weather_provider.fetch_open_meteo(30.0, 79.0)


def test_fetch_open_meteo_malformed_json_raises_provider_error(monkeypatch):
    def fake_get(url, params=None, timeout=None):
        class FakeResponse:
            def raise_for_status(self):
                pass

            def json(self):
                raise ValueError("bad json")

        return FakeResponse()

    monkeypatch.setattr(weather_provider, "_http_get", fake_get)
    with pytest.raises(ProviderError):
        weather_provider.fetch_open_meteo(30.0, 79.0)


def test_fetch_open_meteo_missing_hourly_variables_raises(monkeypatch, open_meteo_canned):
    payload = open_meteo_canned()
    del payload["hourly"]["soil_moisture_0_to_1cm"]

    def fake_get(url, params=None, timeout=None):
        class FakeResponse:
            def raise_for_status(self):
                pass

            def json(self):
                return payload

        return FakeResponse()

    monkeypatch.setattr(weather_provider, "_http_get", fake_get)
    with pytest.raises(ProviderError) as exc:
        weather_provider.fetch_open_meteo(30.0, 79.0)
    assert "soil_moisture_0_to_1cm" in str(exc.value)


def test_fetch_open_meteo_missing_soil_7cm_variable_raises(monkeypatch, open_meteo_canned):
    payload = open_meteo_canned()
    del payload["hourly"]["soil_moisture_0_to_7cm"]

    def fake_get(url, params=None, timeout=None):
        class FakeResponse:
            def raise_for_status(self):
                pass

            def json(self):
                return payload

        return FakeResponse()

    monkeypatch.setattr(weather_provider, "_http_get", fake_get)
    with pytest.raises(ProviderError) as exc:
        weather_provider.fetch_open_meteo(30.0, 79.0)
    assert "soil_moisture_0_to_7cm" in str(exc.value)


# ─── Rainfall accumulation methodology ─────────────────────────────────

def test_rainfall_accumulation_windows():
    precipitation = [1.0] * 24 + [2.0] * 24
    acc = weather_service.rainfall_accumulation(precipitation, now_index=23)
    assert acc["rainfall_1h"] == 1.0
    assert acc["rainfall_3h"] == 3.0
    assert acc["rainfall_6h"] == 6.0
    assert acc["rainfall_24h"] == 24.0
    assert weather_service.forecast_rainfall_window(precipitation, now_index=23) == 48.0


def test_rainfall_accumulation_insufficient_history_is_null():
    # Only 4 observed hours before "now": the 6h and 24h windows are too large
    # for the available history so they must be null, not estimated.
    precipitation = [1.0] * 4 + [2.0] * 24
    acc = weather_service.rainfall_accumulation(precipitation, now_index=4)
    assert acc["rainfall_1h"] == 2.0
    assert acc["rainfall_3h"] == 4.0
    assert acc["rainfall_6h"] is None
    assert acc["rainfall_24h"] is None


def test_rainfall_accumulation_null_values_are_not_estimated():
    precipitation = [1.0] * 22 + [None, 2.0] * 12
    acc = weather_service.rainfall_accumulation(precipitation, now_index=23)
    assert acc["rainfall_1h"] == 2.0
    assert acc["rainfall_3h"] is None
    assert acc["rainfall_6h"] is None
    assert weather_service.forecast_rainfall_window(precipitation, now_index=23) is None


# ─── ML rainfall windows (72h / 7d / antecedent) ───────────────────────

def test_extended_rainfall_windows():
    # 168 hours of 1.0 then 24 hours of 2.0; now is the last hour of history.
    precipitation = [1.0] * 168 + [2.0] * 24
    ext = weather_service.extended_rainfall_accumulation(precipitation, now_index=167)
    assert ext["rainfall_72h"] == 72.0
    assert ext["rainfall_7d"] == 168.0
    # 144 hourly values from now-167 to now-24 (all 1.0), ending 24h before now.
    assert ext["antecedent_rainfall_7d"] == 144.0
    # The existing windows stay correct with the longer history.
    acc = weather_service.rainfall_accumulation(precipitation, now_index=167)
    assert acc["rainfall_1h"] == 1.0
    assert acc["rainfall_24h"] == 24.0
    assert weather_service.forecast_rainfall_window(precipitation, now_index=167) == 48.0


def test_extended_rainfall_insufficient_history_is_null():
    # Only 100 observed hours: the 72h window fits, 7d and antecedent cannot.
    precipitation = [1.0] * 100
    ext = weather_service.extended_rainfall_accumulation(precipitation, now_index=99)
    assert ext["rainfall_72h"] == 72.0
    assert ext["rainfall_7d"] is None
    assert ext["antecedent_rainfall_7d"] is None


def test_extended_rainfall_null_values_are_not_estimated():
    # A single null inside the antecedent window nulls that whole window only.
    precipitation = [1.0] * 168
    precipitation[20] = None
    ext = weather_service.extended_rainfall_accumulation(precipitation, now_index=167)
    assert ext["rainfall_7d"] is None
    assert ext["antecedent_rainfall_7d"] is None
    # The 72h window (indices 96..167) is untouched by the null, so it stays.
    assert ext["rainfall_72h"] == 72.0


# ─── Service normalization via the API ─────────────────────────────────

def test_current_weather_live_shape(client, mock_open_meteo):
    response = client.get(
        "/api/v1/weather/current",
        params={"location_id": "joshimath", "scenario": "normal"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "LIVE"
    assert body["location_name"] == "Joshimath"
    assert body["latitude"] == 30.555
    assert body["longitude"] == 79.565
    assert body["forecast_rainfall"] == 48.0
    assert body["updated_at"] is not None
    assert body["timestamp"] is not None
    # Provider must be queried with Joshimath's own coordinates, never a default/demo location.
    assert mock_open_meteo.calls[0]["latitude"] == 30.555
    assert mock_open_meteo.calls[0]["longitude"] == 79.565


def test_current_weather_ml_windows_and_soil_depth_fields(client, mock_open_meteo, open_meteo_canned):
    # 168 hours of history so the 72h / 7d / antecedent windows can be computed.
    mock_open_meteo.configure(
        payload=open_meteo_canned(past_precipitation=[1.0] * 168, soil_moisture_7cm=0.55)
    )
    response = client.get("/api/v1/weather/current", params={"location_id": "dehradun"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "LIVE"
    assert body["rainfall_72h"] == 72.0
    assert body["rainfall_7d"] == 168.0
    assert body["antecedent_rainfall_7d"] == 144.0
    # Both depth bands are exposed with explicit, distinct depth labels.
    assert body["soil_moisture"] == 42.0
    assert body["soil_moisture_0_to_7cm"] == 55.0
    # Existing windows remain correct with the longer history.
    assert body["rainfall_1h"] == 1.0
    assert body["rainfall_24h"] == 24.0
    assert body["forecast_rainfall"] == 48.0


def test_current_weather_compass_wind_direction(client, mock_open_meteo, open_meteo_canned):
    mock_open_meteo.configure(payload=open_meteo_canned(wind_direction=90.0))
    response = client.get("/api/v1/weather/current", params={"location_id": "dehradun"})
    assert response.json()["wind_direction"] == "E"


def test_current_weather_nan_coordinates_unavailable(client, mock_open_meteo):
    response = client.get(
        "/api/v1/weather/current",
        params={"location_id": "x", "latitude": 95.0, "longitude": 78.5},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "UNAVAILABLE"
    assert body["temperature"] is None
    assert mock_open_meteo.calls == []


def test_current_weather_no_coordinates_unavailable(client, mock_open_meteo):
    response = client.get("/api/v1/weather/current", params={"location_id": "unknown-place"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "UNAVAILABLE"
    assert body["note"] is not None
    assert mock_open_meteo.calls == []


def test_weather_uses_small_ttl_cache_and_avoids_repeated_requests(client, mock_open_meteo):
    client.get("/api/v1/weather/current", params={"location_id": "nainital"})
    client.get("/api/v1/weather/forecast", params={"location_id": "nainital"})
    # Both endpoints resolve to the same coordinates and hit the cache on the second call.
    assert len(mock_open_meteo.calls) == 1
    assert mock_open_meteo.calls[0]["latitude"] == 29.3919
    assert mock_open_meteo.calls[0]["longitude"] == 79.4542


def test_forecast_entries_carry_expected_window(client, mock_open_meteo):
    response = client.get(
        "/api/v1/weather/forecast",
        params={"location_id": "dehradun", "scenario": "extreme_rain"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "LIVE"
    assert body["scenario"] == "extreme_rain"
    assert len(body["entries"]) == 24
    first = body["entries"][0]
    assert set(first) == {"time", "temperature", "precipitation", "precipitation_probability", "wind_speed"}


def test_unavailable_when_provider_returns_malformed_data(client, mock_open_meteo):
    mock_open_meteo.configure(payload={"not": "an open-meteo payload"})
    response = client.get("/api/v1/weather/current", params={"location_id": "dehradun"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "UNAVAILABLE"
    assert body["temperature"] is None
    assert body["note"] is not None


def test_unsupported_scenario_still_rejected(client, mock_open_meteo):
    response = client.get("/api/v1/weather/current", params={"scenario": "not_a_scenario"})
    assert response.status_code == 422
    assert mock_open_meteo.calls == []