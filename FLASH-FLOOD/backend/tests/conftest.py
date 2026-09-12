import datetime
import os
import sys
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.app.main import app  # noqa: E402
from backend.app.data_sources import (  # noqa: E402
    elevation_provider,
    river_provider,
    terrain_provider,
    usgs_provider,
)
from backend.app.data_sources.weather_provider import ProviderError  # noqa: E402
from backend.app.services import weather_service  # noqa: E402


def canned_open_meteo(
    *,
    latitude: float = 30.3165,
    longitude: float = 78.0322,
    temperature: float = 24.0,
    humidity: float = 68.0,
    probability: float = 35.0,
    wind_speed: float = 8.0,
    wind_direction: float = 315.0,
    pressure: float = 1011.0,
    soil_moisture: float = 0.42,
    soil_moisture_7cm: float = 0.55,
    past_precipitation: list[float] | None = None,
    forecast_precipitation: list[float] | None = None,
):
    """Deterministic mock of an Open-Meteo Forecast API response.

    Default hourly arrays: 24 past/observed hours then 24 forecast hours.
    ``now`` is the last observed hour (index 23), so with the default arrays:
    rainfall_1h = 1.0, rainfall_3h = 3.0, rainfall_6h = 6.0,
    rainfall_24h = 24.0, forecast_rainfall = 48.0.
    The ML windows (rainfall_72h / rainfall_7d / antecedent_rainfall_7d) are
    null with the default 24 past hours; pass ``past_precipitation`` with at
    least 168 values to populate them.
    """
    past_precipitation = past_precipitation or [1.0] * 24
    forecast_precipitation = forecast_precipitation or [2.0] * 24
    observed = len(past_precipitation)
    hours = observed + len(forecast_precipitation)
    base = datetime.datetime(2026, 9, 11, 0, 0, tzinfo=datetime.timezone.utc)
    times = [(base + datetime.timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M") for h in range(hours)]
    now_time = times[observed - 1]

    def series(future_value):
        return [float(p) for p in past_precipitation] + [float(future_value)] * len(
            forecast_precipitation
        )

    return {
        "latitude": latitude,
        "longitude": longitude,
        "timezone": "GMT",
        "generationtime_ms": 7,
        "current": {
            "time": now_time,
            "interval": 900,
            "temperature_2m": temperature,
            "relative_humidity_2m": humidity,
            "precipitation": None,
            "precipitation_probability": probability,
            "wind_speed_10m": wind_speed,
            "wind_direction_10m": wind_direction,
            "surface_pressure": pressure,
            "soil_moisture_0_to_1cm": soil_moisture,
            "soil_moisture_0_to_7cm": soil_moisture_7cm,
        },
        "hourly": {
            "time": times,
            "temperature_2m": [float(temperature)] * hours,
            "relative_humidity_2m": [float(humidity)] * hours,
            "precipitation": [float(p) for p in past_precipitation]
            + [float(p) for p in forecast_precipitation],
            "precipitation_probability": [float(probability)] * hours,
            "wind_speed_10m": [float(wind_speed)] * hours,
            "wind_direction_10m": [float(wind_direction)] * hours,
            "surface_pressure": [float(pressure)] * hours,
            "soil_moisture_0_to_1cm": [float(soil_moisture)] * hours,
            "soil_moisture_0_to_7cm": [float(soil_moisture_7cm)] * hours,
        },
    }


@pytest.fixture
def open_meteo_canned():
    return canned_open_meteo


@pytest.fixture(autouse=True)
def clear_weather_cache():
    weather_service._cache.clear()
    elevation_provider._cache.clear()
    terrain_provider._cache.clear()
    river_provider._cache.clear()
    usgs_provider._cache.clear()
    yield
    weather_service._cache.clear()
    elevation_provider._cache.clear()
    terrain_provider._cache.clear()
    river_provider._cache.clear()
    usgs_provider._cache.clear()


@pytest.fixture(autouse=True)
def mock_open_meteo(monkeypatch, open_meteo_canned):
    """Replace the provider with a deterministic fake for every test.

    Tests can re-configure via ``mock_open_meteo.configure(payload=..., error=...)``
    or inspect ``mock_open_meteo.calls``.
    """
    calls = []
    state = {"payload": None, "error": None}

    def fake_fetch(latitude, longitude, timeout=6.0):
        calls.append({"latitude": latitude, "longitude": longitude, "timeout": timeout})
        if state["error"] is not None:
            raise state["error"]
        payload = state["payload"]
        return payload(latitude, longitude) if callable(payload) else payload

    if state["payload"] is None:
        state["payload"] = open_meteo_canned()
    monkeypatch.setattr(weather_service, "fetch_open_meteo", fake_fetch)
    return SimpleNamespace(
        calls=calls,
        state=state,
        configure=lambda payload=None, error=None: _configure_mock(state, open_meteo_canned, payload, error),
    )


def _configure_mock(state, open_meteo_canned, payload, error):
    if payload is not None:
        state["payload"] = payload
    if error is not None:
        state["error"] = error


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def provider_error():
    return ProviderError("Open-Meteo request failed: mocked failure")


@pytest.fixture
def elevation_error():
    return elevation_provider.ProviderError(
        "Open-Meteo elevation request failed: mocked failure"
    )


@pytest.fixture
def terrain_error():
    return terrain_provider.ProviderError(
        "Open-Meteo elevation request failed: mocked failure"
    )


@pytest.fixture
def river_error():
    return river_provider.ProviderError("Overpass request failed: mocked failure")


@pytest.fixture
def usgs_error():
    return usgs_provider.ProviderError("USGS request failed: mocked failure")


@pytest.fixture
def canned_usgs_event():
    """Builder fixture matching ``test_arbitrary`` usage: call it to get a record."""
    return _canned_usgs_event


@pytest.fixture
def usgs_geo_json():
    """Builder fixture for a raw USGS GeoJSON response used by transport tests."""
    return _usgs_geo_json


def _canned_usgs_event(
    *,
    event_id: str = "us2026demo1",
    magnitude: float = 4.2,
    depth_km: float = 18.0,
    longitude: float | None = None,
    latitude: float | None = None,
    place: str = "10 km SSE of Somewhere",
    mag_type: str = "mb",
):
    """A deterministic parsed USGS provider record (matches the provider contract)."""
    return {
        "event_id": event_id,
        "magnitude": magnitude,
        "depth_km": depth_km,
        "distance_km": 35.0,
        "time": "2026-09-11T04:20:00+00:00",
        "latitude": latitude if latitude is not None else 29.9,
        "longitude": longitude if longitude is not None else 78.2,
        "place": place,
        "mag_type": mag_type,
    }


def _usgs_geo_json(
    *,
    event_id: str = "us2026demo1",
    magnitude: float = 4.2,
    depth_km: float = 18.0,
    longitude: float = 78.2,
    latitude: float = 29.9,
    place: str = "10 km SSE of Somewhere",
    mag_type: str = "mb",
    time_ms: int = 1786000000000,
):
    """A deterministic raw USGS GeoJSON response used by the transport tests."""
    return {
        "type": "FeatureCollection",
        "metadata": {"count": 1},
        "features": [
            {
                "id": event_id,
                "properties": {
                    "mag": magnitude,
                    "place": place,
                    "time": time_ms,
                    "magType": mag_type,
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [longitude, latitude, depth_km],
                },
            }
        ],
    }


@pytest.fixture
def mock_elevation(monkeypatch):
    """Replace the Open-Meteo elevation provider with a deterministic fake."""
    state = {"value": 652.0, "error": None}
    calls = []

    def fake_fetch(latitude, longitude, timeout=6.0):
        calls.append({"latitude": latitude, "longitude": longitude, "timeout": timeout})
        if state["error"] is not None:
            raise state["error"]
        return state["value"]

    monkeypatch.setattr(elevation_provider, "fetch_elevation", fake_fetch)
    return SimpleNamespace(
        calls=calls,
        state=state,
        configure=lambda value=None, error=None: _set_fields(state, value, error),
    )


@pytest.fixture(autouse=True)
def mock_terrain(monkeypatch, request):
    """Deterministic fake for the slope/aspect terrain provider (autouse).

    Defaults to a temperate hill (23.5 deg slope, SE-facing aspect). Tests can
    reconfigure via ``mock_terrain.configure(terrain=..., error=...)``.

    ``test_live_sources`` exercises the real provider transport instead, so
    the canned mock is skipped for that module.
    """
    if request.node.path.name == "test_live_sources.py":
        yield SimpleNamespace(
            calls=lambda: [], state={}, configure=lambda **kwargs: None
        )
        return
    state = {"terrain": {"slope_degrees": 23.5, "aspect_degrees": 135.0}, "error": None}
    calls = []

    def fake_fetch(latitude, longitude, timeout=8.0):
        calls.append({"latitude": latitude, "longitude": longitude, "timeout": timeout})
        if state["error"] is not None:
            raise state["error"]
        return state["terrain"]

    monkeypatch.setattr(terrain_provider, "fetch_terrain", fake_fetch)
    yield SimpleNamespace(
        calls=calls,
        state=state,
        configure=lambda terrain=None, error=None: _set_terrain_mock(state, terrain, error),
    )


def _set_terrain_mock(state, terrain, error):
    if terrain is not None:
        state["terrain"] = terrain
    if error is not None:
        state["error"] = error


@pytest.fixture(autouse=True)
def mock_river(monkeypatch, request):
    """Deterministic fake for the river-distance provider (autouse).

    The real provider has NO source in this release and always returns ``None``
    (honest "no river source", optional feature). Tests can reconfigure via
    ``mock_river.configure(distance=..., error=...)``.

    ``test_live_sources`` exercises the real provider transport instead, so
    the canned mock is skipped for that module.
    """
    if request.node.path.name == "test_live_sources.py":
        yield SimpleNamespace(
            calls=lambda: [], state={}, configure=lambda **kwargs: None
        )
        return
    state = {"distance": None, "error": None}
    calls = []

    def fake_fetch(latitude, longitude, radius_m=15000.0, timeout=25.0):
        calls.append(
            {
                "latitude": latitude,
                "longitude": longitude,
                "radius_m": radius_m,
                "timeout": timeout,
            }
        )
        if state["error"] is not None:
            raise state["error"]
        return state["distance"]

    monkeypatch.setattr(river_provider, "fetch_nearest_river_distance", fake_fetch)
    yield SimpleNamespace(
        calls=calls,
        state=state,
        configure=lambda distance=None, error=None: _set_river_mock(state, distance, error),
    )


def _set_river_mock(state, distance, error):
    if distance is not None:
        state["distance"] = distance
    if error is not None:
        state["error"] = error


@pytest.fixture
def mock_usgs(monkeypatch):
    """Replace the USGS provider with a deterministic fake (default: no event)."""
    state = {"event": None, "error": None}
    calls = []

    def fake_fetch(latitude, longitude, radius_km=150.0, min_magnitude=3.0, timeout=8.0):
        calls.append(
            {
                "latitude": latitude,
                "longitude": longitude,
                "radius_km": radius_km,
                "min_magnitude": min_magnitude,
            }
        )
        if state["error"] is not None:
            raise state["error"]
        return state["event"]

    monkeypatch.setattr(usgs_provider, "fetch_latest_event", fake_fetch)
    return SimpleNamespace(
        calls=calls,
        state=state,
        configure=lambda event=None, error=None: _set_fields(state, event, error),
    )


def _set_fields(state, value, error):
    if value is not None:
        for key in ("value", "event"):
            if key in state:
                state[key] = value
                break
    if error is not None:
        state["error"] = error