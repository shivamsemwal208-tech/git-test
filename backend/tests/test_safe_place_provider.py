"""Hermetic tests for the OpenStreetMap safe-place provider (transport + ranking)."""
import pytest

from backend.app.data_sources import safe_place_provider
from backend.app.data_sources.safe_place_provider import ProviderError

LAT, LON = 30.3165, 78.0322


def canned_overpass_response():
    """A deterministic Overpass element set (nodes + a way with a center)."""
    return {
        "version": 0.6,
        "generator": "Overpass API",
        "elements": [
            {
                "type": "node",
                "id": 101,
                "lat": 30.3299,
                "lon": 78.049,
                "tags": {
                    "amenity": "hospital",
                    "name": "Doon Hospital",
                    "addr:street": "Rajpur Road",
                    "addr:city": "Dehradun",
                },
            },
            {
                "type": "way",
                "id": 202,
                "center": {"lat": 30.3001, "lon": 78.028},
                "tags": {"amenity": "school", "name": "Bright Hill School"},
            },
            {
                "type": "node",
                "id": 103,
                "lat": 30.312,
                "lon": 78.04,
                "tags": {"amenity": "police", "name": "City Police Station"},
            },
            # malformed / non-queried entries must be skipped, never crash
            {"type": "node", "id": 104, "lat": 30.31, "lon": 78.03, "tags": {"amenity": "hospital", "name": "No coords ok"}},  # valid
            {"type": "node", "id": 105, "lat": "30.40", "lon": 78.02, "tags": {"amenity": "clinic", "name": "Non numeric"}},
            {"type": "way", "id": 106, "tags": {"amenity": "clinic", "name": "Missing center"}},
            {"type": "node", "id": 107, "lat": 30.31, "lon": 78.03, "tags": {"amenity": "pub", "name": "Not a destination"}},
            {"type": "node", "id": 108},
        ],
    }


class FakeResponse:
    """Minimal stand-in for the httpx response used by the provider."""

    def __init__(self, payload=None, status_code=200, json_error=None, raise_error=None):
        self._payload = payload
        self.status_code = status_code
        self._json_error = json_error
        self._raise_error = raise_error

    def raise_for_status(self):
        if self._raise_error is not None:
            raise self._raise_error
        if self.status_code >= 400:
            raise ConnectionError(f"HTTP {self.status_code}")

    def json(self):
        if self._json_error is not None:
            raise self._json_error
        return self._payload


@pytest.fixture
def fake_overpass(monkeypatch):
    """Patch the provider transport, capturing every request body."""
    calls = []

    def post(url, data=None, timeout=None, **kwargs):
        calls.append({"url": url, "body": data["data"] if data else None})
        return FakeResponse(payload=canned_overpass_response())

    monkeypatch.setattr(safe_place_provider, "_http_post", post)
    return calls


def test_normalizes_array_of_places_and_skips_malformed(fake_overpass, monkeypatch):
    places = safe_place_provider.fetch_nearby_places(LAT, LON)
    assert places is not None
    # 101 hospital, 202 school, 103 police, 104 hospital = 4 kept records
    assert len(places) == 4

    by_id = {p["osm_id"]: p for p in places}
    hospital = by_id[101]
    assert hospital["name"] == "Doon Hospital"
    assert hospital["category"] == "hospital"
    assert hospital["category_label"] == "Hospital"
    assert hospital["priority"] == 1
    assert hospital["latitude"] == 30.3299
    assert hospital["longitude"] == 78.049
    assert hospital["address"] == "Rajpur Road, Dehradun"
    assert hospital["distance_m"] > 0
    assert "osm_type" in hospital

    school = by_id[202]
    assert school["priority"] == 2
    assert school["category_label"] == "School"
    assert school["latitude"] == 30.3001  # from way center

    # malformed / out-of-category records are dropped
    for osm_id in (105, 106, 107, 108):
        assert osm_id not in by_id


def test_results_are_distance_presorted_within_category(fake_overpass):
    places = safe_place_provider.fetch_nearby_places(LAT, LON)
    ids = [p["osm_id"] for p in places]
    # priority 1 (hospital 104, police 103, hospital 101 — nearest first) then
    # priority 2 (school 202): all sorted by (priority, distance_m).
    assert ids == [104, 103, 101, 202]
    assert all(places[i]["priority"] <= places[i + 1]["priority"] for i in range(len(places) - 1))


def test_overpass_query_encodes_radius_and_categories(fake_overpass):
    safe_place_provider.fetch_nearby_places(LAT, LON, radius_m=3500)
    body = fake_overpass[-1]["body"]
    assert "around:3500" in body
    assert "hospital" in body
    assert "community_centre" in body
    assert f"{LAT}" in body and f"{LON}" in body


def test_provider_is_short_ttl_cached(fake_overpass):
    safe_place_provider.fetch_nearby_places(LAT, LON)
    safe_place_provider.fetch_nearby_places(LAT, LON)
    assert len(fake_overpass) == 1


def test_overpass_requires_rate_limited_http_error(monkeypatch):
    def post(url, data=None, timeout=None, **kwargs):
        return FakeResponse(status_code=429)

    monkeypatch.setattr(safe_place_provider, "_http_post", post)
    with pytest.raises(ProviderError):
        safe_place_provider.fetch_nearby_places(LAT, LON)


def test_overpass_transport_failure_raises(monkeypatch):
    def post(url, data=None, timeout=None, **kwargs):
        raise ConnectionError("no network")

    monkeypatch.setattr(safe_place_provider, "_http_post", post)
    with pytest.raises(ProviderError):
        safe_place_provider.fetch_nearby_places(LAT, LON)


def test_overpass_remark_is_honest_error(monkeypatch):
    def post(url, data=None, timeout=None, **kwargs):
        return FakeResponse(payload={"remark": "runtime error: query timed out"})

    monkeypatch.setattr(safe_place_provider, "_http_post", post)
    with pytest.raises(ProviderError) as exc:
        safe_place_provider.fetch_nearby_places(LAT, LON)
    assert "remark" in str(exc.value)


def test_overpass_malformed_json_raises(monkeypatch):
    def post(url, data=None, timeout=None, **kwargs):
        return FakeResponse(json_error=ValueError("bad json"))

    monkeypatch.setattr(safe_place_provider, "_http_post", post)
    with pytest.raises(ProviderError):
        safe_place_provider.fetch_nearby_places(LAT, LON)


# ─── ranking ──────────────────────────────────────────────────────────────


def _place(osm_id, category, distance_m):
    label, priority = safe_place_provider._CATEGORIES[category]
    return {
        "osm_type": "node",
        "osm_id": osm_id,
        "name": f"Place {osm_id}",
        "category": category,
        "category_label": label,
        "priority": priority,
        "latitude": 30.3,
        "longitude": 78.0,
        "distance_m": distance_m,
        "address": None,
    }


def test_rank_places_puts_emergency_services_first_then_nearest():
    ranked = safe_place_provider.rank_places(
        [
            _place(1, "school", 200),
            _place(2, "hospital", 3000),
            _place(3, "police", 500),
            _place(4, "community_centre", 100),
        ]
    )
    osms = [p["osm_id"] for p in ranked]
    # hospitals/police (priority 1) first, then public buildings (priority 2);
    # within a priority, nearest first.
    assert osms == [3, 2, 4, 1]
    assert [p["rank"] for p in ranked] == [1, 2, 3, 4]
    assert ranked[0]["ranking_reason"].startswith("Emergency service")
    assert ranked[2]["ranking_reason"].startswith("Public building")


def test_rank_places_never_mutates_input():
    places = [_place(1, "school", 200), _place(2, "hospital", 100)]
    snapshot = [dict(p) for p in places]
    safe_place_provider.rank_places(places)
    assert places == snapshot