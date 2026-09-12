"""Transport and parsing tests for the live terrain/seismic providers.

These tests exercise the raw HTTP adapters (elevation, terrain and USGS
providers) with monkeypatched transports; the river provider has no source in
this release and its stub is tested directly. Route-level behavior is covered
in ``test_arbitrary.py`` and ``test_routes.py``.
"""
import httpx
import pytest

from backend.app.data_sources import (
    elevation_provider,
    river_provider,
    terrain_provider,
    usgs_provider,
)


class FakeResponse:
    def __init__(self, payload=None, error=None, status_code=200):
        self._payload = payload
        self._error = error
        self.status_code = status_code

    def raise_for_status(self):
        if self._error is not None:
            raise self._error
        return None

    def json(self):
        if self._payload is None:
            raise ValueError("bad json")
        return self._payload


# ─── Elevation provider ────────────────────────────────────────────────

def test_fetch_elevation_builds_request_and_parses(monkeypatch):
    captured = {}

    def fake_get(url, params=None, timeout=None):
        captured["url"] = url
        captured["params"] = params
        captured["timeout"] = timeout
        return FakeResponse(payload={"elevation": [652.0]})

    monkeypatch.setattr(elevation_provider, "_http_get", fake_get)
    result = elevation_provider.fetch_elevation(30.3165, 78.0322)
    assert captured["url"] == elevation_provider.ELEVATION_URL
    assert captured["params"]["latitude"] == 30.3165
    assert captured["params"]["longitude"] == 78.0322
    assert captured["timeout"] == elevation_provider.REQUEST_TIMEOUT_SECONDS
    assert result == 652.0


def test_fetch_elevation_http_error_raises_provider_error(monkeypatch):
    def fake_get(url, params=None, timeout=None):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(elevation_provider, "_http_get", fake_get)
    with pytest.raises(elevation_provider.ProviderError):
        elevation_provider.fetch_elevation(30.0, 79.0)


def test_fetch_elevation_malformed_payload_raises(monkeypatch):
    monkeypatch.setattr(
        elevation_provider,
        "_http_get",
        lambda url, params=None, timeout=None: FakeResponse(payload={"elevation": []}),
    )
    with pytest.raises(elevation_provider.ProviderError):
        elevation_provider.fetch_elevation(30.0, 79.0)


def test_fetch_elevation_uses_short_ttl_cache(monkeypatch):
    calls = []

    def fake_get(url, params=None, timeout=None):
        calls.append(1)
        return FakeResponse(payload={"elevation": [100.0]})

    monkeypatch.setattr(elevation_provider, "_http_get", fake_get)
    assert elevation_provider.fetch_elevation(30.0, 79.0) == 100.0
    assert elevation_provider.fetch_elevation(30.0, 79.0) == 100.0
    assert len(calls) == 1


# ─── USGS provider ─────────────────────────────────────────────────────

def test_fetch_latest_event_builds_request_and_parses(monkeypatch, usgs_geo_json):
    captured = {}

    def fake_get(url, params=None, timeout=None):
        captured["url"] = url
        captured["params"] = params
        captured["timeout"] = timeout
        return FakeResponse(payload=usgs_geo_json())

    monkeypatch.setattr(usgs_provider, "_http_get", fake_get)
    event = usgs_provider.fetch_latest_event(35.0, 78.5)
    assert captured["url"] == usgs_provider.QUERY_URL
    assert captured["params"]["latitude"] == 35.0
    assert captured["params"]["longitude"] == 78.5
    assert captured["params"]["format"] == "geojson"
    assert captured["params"]["maxradiuskm"] == 150.0
    assert captured["params"]["minmagnitude"] == 3.0
    assert captured["params"]["limit"] == 1
    assert captured["timeout"] == usgs_provider.REQUEST_TIMEOUT_SECONDS
    assert event["event_id"] == "us2026demo1"
    assert event["magnitude"] == 4.2
    assert event["depth_km"] == 18.0
    # Haversine distance between the query point (35.0, 78.5) and the canned
    # event position (29.9, 78.2).
    assert event["distance_km"] == pytest.approx(567.8, abs=1.0)


def test_fetch_latest_event_no_matches_returns_none(monkeypatch):
    monkeypatch.setattr(
        usgs_provider,
        "_http_get",
        lambda url, params=None, timeout=None: FakeResponse(payload={"features": []}),
    )
    assert usgs_provider.fetch_latest_event(35.0, 78.5) is None


def test_fetch_latest_event_http_error_raises(monkeypatch):
    def fake_get(url, params=None, timeout=None):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(usgs_provider, "_http_get", fake_get)
    with pytest.raises(usgs_provider.ProviderError):
        usgs_provider.fetch_latest_event(35.0, 78.5)


def test_fetch_latest_event_missing_magnitude_raises(monkeypatch, usgs_geo_json):
    payload = usgs_geo_json()
    del payload["features"][0]["properties"]["mag"]
    monkeypatch.setattr(
        usgs_provider,
        "_http_get",
        lambda url, params=None, timeout=None: FakeResponse(payload=payload),
    )
    with pytest.raises(usgs_provider.ProviderError):
        usgs_provider.fetch_latest_event(35.0, 78.5)


def test_fetch_latest_event_uses_short_ttl_cache(monkeypatch, usgs_geo_json):
    calls = []

    def fake_get(url, params=None, timeout=None):
        calls.append(1)
        return FakeResponse(payload=usgs_geo_json())

    monkeypatch.setattr(usgs_provider, "_http_get", fake_get)
    usgs_provider.fetch_latest_event(35.0, 78.5)
    usgs_provider.fetch_latest_event(35.0, 78.5)
    assert len(calls) == 1


def test_haversine_distance(monkeypatch, usgs_geo_json):
    # Event exactly at the query point must be 0 km away.
    payload = usgs_geo_json(latitude=35.0, longitude=78.5)
    monkeypatch.setattr(
        usgs_provider,
        "_http_get",
        lambda url, params=None, timeout=None: FakeResponse(payload=payload),
    )
    event = usgs_provider.fetch_latest_event(35.0, 78.5)
    assert event["distance_km"] == 0.0


# ─── Terrain provider (slope/aspect) ────────────────────────────────────

def _terrain_grid_for_east_downhill():
    # GRID_OFFSETS order: south row then mid then north row; each row West,
    # Center, East. East edge lower (95), west higher (105): downhill east.
    return {"elevation": [105.0, 100.0, 95.0] * 3}


def test_fetch_terrain_builds_9_point_request_and_parses(monkeypatch):
    captured = {}

    def fake_get(url, params=None, timeout=None):
        captured["url"] = url
        captured["params"] = params
        captured["timeout"] = timeout
        return FakeResponse(payload=_terrain_grid_for_east_downhill())

    monkeypatch.setattr(terrain_provider, "_http_get", fake_get)
    result = terrain_provider.fetch_terrain(30.0, 79.0)
    assert captured["url"] == terrain_provider.ELEVATION_URL
    assert captured["timeout"] == terrain_provider.REQUEST_TIMEOUT_SECONDS
    assert captured["params"]["latitude"].count(",") == 8
    assert captured["params"]["longitude"].count(",") == 8
    # A 10 m step over ~0.002 deg at cos(30) -> ~5.19% grade -> ~2.97 deg,
    # downhill to the EAST (bearing 90).
    assert result["slope_degrees"] == pytest.approx(2.97, abs=0.15)
    assert result["aspect_degrees"] == pytest.approx(90.0, abs=1.0)


def test_slope_aspect_from_grid_downhill_north():
    # South row 110, mid 100, north 90: uphill to the south, downhill north.
    elevations = [110.0, 110.0, 110.0, 100.0, 100.0, 100.0, 90.0, 90.0, 90.0]
    result = terrain_provider.slope_aspect_from_grid(elevations, 0.001, 0.0)
    # dz/dy_deg = -10000 -> -0.0898 m/m -> 5.13 deg; bearing north (0).
    assert result["slope_degrees"] == pytest.approx(5.13, abs=0.15)
    assert result["aspect_degrees"] == pytest.approx(0.0, abs=1.0)


def test_slope_aspect_from_grid_flat_is_zero():
    result = terrain_provider.slope_aspect_from_grid(
        [100.0] * 9, terrain_provider.NEIGHBORHOOD_SPACING_DEGREES, 0.0
    )
    assert result["slope_degrees"] == 0.0
    assert result["aspect_degrees"] == 0.0


def test_fetch_terrain_missing_sample_raises(monkeypatch):
    payload = {"elevation": [100.0] * 8 + [None]}
    monkeypatch.setattr(
        terrain_provider,
        "_http_get",
        lambda url, params=None, timeout=None: FakeResponse(payload=payload),
    )
    with pytest.raises(terrain_provider.ProviderError):
        terrain_provider.fetch_terrain(30.0, 79.0)


def test_fetch_terrain_http_error_raises(monkeypatch):
    def fake_get(url, params=None, timeout=None):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(terrain_provider, "_http_get", fake_get)
    with pytest.raises(terrain_provider.ProviderError):
        terrain_provider.fetch_terrain(30.0, 79.0)


def test_fetch_terrain_uses_short_ttl_cache(monkeypatch):
    calls = []

    def fake_get(url, params=None, timeout=None):
        calls.append(1)
        return FakeResponse(payload=_terrain_grid_for_east_downhill())

    monkeypatch.setattr(terrain_provider, "_http_get", fake_get)
    terrain_provider.fetch_terrain(30.0, 79.0)
    terrain_provider.fetch_terrain(30.0, 79.0)
    assert len(calls) == 1


# ─── River provider (no source in this release) ───────────────────────────

def test_fetch_river_returns_none_for_any_location():
    """No river/hydrology source is connected in this release: the optional
    feature is honestly ``None`` for every location, never a guess."""
    assert river_provider.fetch_nearest_river_distance(30.0, 79.0) is None


def test_fetch_river_none_never_claims_about_water():
    value = river_provider.fetch_nearest_river_distance(
        29.9, 78.2, radius_m=15000.0
    )
    assert value is None


def test_fetch_river_is_short_ttl_cached():
    first = river_provider.fetch_nearest_river_distance(30.0, 79.0)
    second = river_provider.fetch_nearest_river_distance(30.0, 79.0)
    assert first is None
    assert second is None