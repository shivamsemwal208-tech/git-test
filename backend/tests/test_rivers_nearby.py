"""API-level tests for GET /api/v1/rivers/nearby (real river geometry, read-only).

These tests are hermetic: they patch ``river_provider.fetch_nearby_segments``
(the module boundary the route calls) so the suite never depends on the real
``data/processed/river_index`` being present. They cover the predefined
location path, the arbitrary-coordinate path, the honest-unavailable path
(missing index), the 404 path, the truncation flag, and validation bounds.
"""
import pytest

from backend.app.data_sources import river_provider

SEGMENTS = [[77.9, 30.2, 78.1, 30.2], [78.1, 30.2, 78.2, 30.3]]


def route(client, **params):
    return client.get("/api/v1/rivers/nearby", params=params)


def test_predefined_location_returns_real_segments(client, monkeypatch):
    calls = []

    def fake(latitude, longitude, radius_m=15000.0, max_rows=1500):
        calls.append((latitude, longitude, radius_m, max_rows))
        return list(SEGMENTS), False

    monkeypatch.setattr(river_provider, "fetch_nearby_segments", fake)
    response = route(client, location_id="dehradun")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "AVAILABLE"
    assert body["status_reason"] is None
    assert body["data_status"] == "LIVE"
    assert body["location_id"] == "dehradun"
    assert body["n_segments"] == len(SEGMENTS)
    assert body["segments"] == SEGMENTS
    assert body["truncated"] is False
    assert "HydroRIVERS" in body["source"]
    assert body["disclaimer"]
    assert body["latitude"] == 30.3165
    assert body["longitude"] == 78.0322
    assert calls == [(30.3165, 78.0322, 12000.0, 1500)]


def test_arbitrary_coordinates_are_resolved(client, monkeypatch):
    calls = []

    def fake(latitude, longitude, radius_m=15000.0, max_rows=1500):
        calls.append((latitude, longitude, radius_m, max_rows))
        return [], False

    monkeypatch.setattr(river_provider, "fetch_nearby_segments", fake)
    response = route(
        client,
        location_id="search-rome",
        latitude=41.9,
        longitude=12.48,
        radius_m=8000,
        max_segments=50,
    )
    body = response.json()
    assert response.status_code == 200
    assert body["status"] == "AVAILABLE"
    assert body["location_id"] == "arbitrary-41.9-12.48"
    assert body["radius_m"] == 8000
    assert body["n_segments"] == 0
    assert body["truncated"] is False
    assert calls == [(41.9, 12.48, 8000.0, 50)]
    assert body["latitude"] == 41.9
    assert body["longitude"] == 12.48


def test_missing_index_is_honest_unavailable(client, monkeypatch):
    monkeypatch.setattr(river_provider, "fetch_nearby_segments", lambda *a, **k: None)
    response = route(client, location_id="dehradun")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "UNAVAILABLE"
    assert body["status_reason"] == "INDEX_UNAVAILABLE"
    assert body["source"] is None
    assert body["data_status"] == "UNAVAILABLE"
    assert body["segments"] == []
    assert body["n_segments"] == 0
    assert body["truncated"] is False
    assert "fabricated geometry" in body["disclaimer"]


def test_truncation_flag_is_passed_through(client, monkeypatch):
    monkeypatch.setattr(
        river_provider,
        "fetch_nearby_segments",
        lambda *a, **k: ([[78.0, 30.0, 78.1, 30.1]], True),
    )
    body = route(client, location_id="dehradun").json()
    assert body["status"] == "AVAILABLE"
    assert body["truncated"] is True
    assert body["n_segments"] == 1


def test_unknown_location_without_coordinates_404(client, monkeypatch):
    monkeypatch.setattr(river_provider, "fetch_nearby_segments", lambda *a, **k: None)
    response = route(client, location_id="atlantis")
    assert response.status_code == 404


@pytest.mark.parametrize(
    ("params", "field"),
    [
        ({"radius_m": 10}, "radius_m"),
        ({"radius_m": 60_000}, "radius_m"),
        ({"max_segments": 0}, "max_segments"),
        ({"max_segments": 10_000}, "max_segments"),
        ({"latitude": 95}, "latitude"),
        ({"longitude": 200}, "longitude"),
    ],
)
def test_validation_bounds_rejected(client, params, field):
    response = route(client, location_id="unknown-place", **params)
    assert response.status_code == 422
    assert field in response.json()["detail"][0]["loc"]