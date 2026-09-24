"""Hermetic tests for GET /api/v1/safe-places/nearby (real OpenStreetMap places)."""
import pytest

from backend.app.data_sources import safe_place_provider


def canned_place(osm_id=101, category="hospital", name="Doon Hospital", distance_m=900):
    label, priority = safe_place_provider._CATEGORIES[category]
    return {
        "osm_type": "node",
        "osm_id": osm_id,
        "name": name,
        "category": category,
        "category_label": label,
        "priority": priority,
        "latitude": 30.3299,
        "longitude": 78.049,
        "distance_m": distance_m,
        "address": "Rajpur Road, Dehradun",
    }


@pytest.fixture
def stash():
    """Where tests place the canned provider result / error."""
    return {}


@pytest.fixture
def fake_fetch(monkeypatch, stash):
    def fetch(latitude, longitude, radius_m=5000.0, timeout=20.0):
        stash["calls"] = [
            {"latitude": latitude, "longitude": longitude, "radius_m": radius_m}
        ]
        if "error" in stash:
            raise stash["error"]
        return stash.get("result", [])

    monkeypatch.setattr(safe_place_provider, "fetch_nearby_places", fetch)


def test_predefined_location_returns_ranked_real_places(
    client, fake_fetch, stash, mock_elevation
):
    stash["result"] = [
        canned_place(101, "hospital", "Doon Hospital", distance_m=900),
        canned_place(202, "school", "Bright Hill School", distance_m=200),
        canned_place(303, "police", "City Police Station", distance_m=400),
    ]
    response = client.get("/api/v1/safe-places/nearby", params={"location_id": "dehradun"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "AVAILABLE"
    assert body["status_reason"] is None
    assert body["data_status"] == "LIVE"
    assert body["location_id"] == "dehradun"
    assert body["n_places"] == 3
    assert stash["calls"] == [{"latitude": 30.3165, "longitude": 78.0322, "radius_m": 5000.0}]

    # ranking: emergency services (police, hospital) before the school
    order = [p["category"] for p in body["places"]]
    assert order == ["police", "hospital", "school"]
    assert [p["rank"] for p in body["places"]] == [1, 2, 3]
    assert body["places"][0]["ranking_reason"].startswith("Emergency service")
    assert body["places"][0]["name"] == "City Police Station"
    assert body["places"][0]["distance_m"] == 400
    assert body["ranking_note"] is not None


def test_arbitrary_location_uses_its_own_coordinates(client, fake_fetch, stash, mock_elevation):
    stash["result"] = [canned_place(101, "hospital", "Rome Hospital", distance_m=1200)]
    response = client.get(
        "/api/v1/safe-places/nearby",
        params={"location_id": "search-rome", "latitude": 41.9, "longitude": 12.48, "radius_m": 3000},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "AVAILABLE"
    assert body["location_id"] == "arbitrary-41.9-12.48"
    assert stash["calls"] == [{"latitude": 41.9, "longitude": 12.48, "radius_m": 3000.0}]
    assert body["places"][0]["name"] == "Rome Hospital"


def test_unknown_location_without_coordinates_is_404(client):
    response = client.get("/api/v1/safe-places/nearby", params={"location_id": "nope"})
    assert response.status_code == 404


def test_radius_out_of_bounds_is_422(client, fake_fetch, stash):
    response = client.get(
        "/api/v1/safe-places/nearby",
        params={"location_id": "dehradun", "radius_m": 50},
    )
    assert response.status_code == 422
    response = client.get(
        "/api/v1/safe-places/nearby",
        params={"location_id": "dehradun", "radius_m": 30000},
    )
    assert response.status_code == 422


def test_empty_provider_result_is_an_honest_empty_list(client, fake_fetch, stash, mock_elevation):
    stash["result"] = []
    response = client.get("/api/v1/safe-places/nearby", params={"location_id": "dehradun"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "AVAILABLE"
    assert body["n_places"] == 0
    assert body["places"] == []
    assert body["data_status"] == "LIVE"


def test_provider_unavailable_is_an_honest_unavailable_state(client, fake_fetch, stash):
    stash["result"] = None
    response = client.get("/api/v1/safe-places/nearby", params={"location_id": "dehradun"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "UNAVAILABLE"
    assert body["status_reason"] == "PLACE_PROVIDER_UNAVAILABLE"
    assert body["n_places"] == 0
    assert body["places"] == []
    assert body["data_status"] == "UNAVAILABLE"
    assert "no fabricated list" in body["disclaimer"]


def test_provider_failure_is_an_honest_unavailable_state(client, fake_fetch, stash):
    stash["error"] = safe_place_provider.ProviderError("Overpass request failed")
    response = client.get("/api/v1/safe-places/nearby", params={"location_id": "dehradun"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "UNAVAILABLE"
    assert body["status_reason"] == "PLACE_PROVIDER_UNAVAILABLE"
    assert body["places"] == []


def test_enrichment_adds_elevation_and_river_metadata(
    client, fake_fetch, stash, mock_elevation, mock_river
):
    stash["result"] = [canned_place(101, "hospital", "Doon Hospital", distance_m=900)]
    mock_elevation.configure(value=700.0)
    mock_river.configure(distance=250)
    response = client.get("/api/v1/safe-places/nearby", params={"location_id": "dehradun"})
    body = response.json()
    place = body["places"][0]
    assert body["selected_elevation_m"] == 700.0
    assert place["elevation_m"] == 700.0
    assert place["elevation_diff_m"] == 0
    assert place["elevation_source"] == "Open-Meteo elevation API"
    assert place["nearest_river_distance_m"] == 250
    assert place["river_distance_source"] == "HydroRIVERS v1.0"
    assert place["source"] == "OpenStreetMap via Overpass API (https://overpass-api.de)"


def test_enrichment_degrades_gracefully_when_provider_errors(
    client, fake_fetch, stash, mock_elevation, mock_river, elevation_error, river_error
):
    stash["result"] = [canned_place(101, "hospital", "Doon Hospital", distance_m=900)]
    mock_elevation.configure(error=elevation_error)
    mock_river.configure(error=river_error)
    response = client.get("/api/v1/safe-places/nearby", params={"location_id": "dehradun"})
    body = response.json()
    assert body["status"] == "AVAILABLE"
    place = body["places"][0]
    assert place["elevation_m"] is None
    assert place["elevation_source"] is None
    assert place["elevation_diff_m"] is None
    assert place["nearest_river_distance_m"] is None
    assert place["river_distance_source"] is None