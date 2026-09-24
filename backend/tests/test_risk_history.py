"""API-level tests for the historical flood intelligence block (Phase 3C).

Uses the REAL ``history_provider`` against a tiny synthetic on-disk index
pointed at via ``FLASHGUARD_HISTORY_INDEX_DIR`` (no autouse provider mock —
see ``conftest.mock_history``'s module skip-list). Verifies the live risk
response carries the block, the demo path stays untouched (``historical:
null`` + existing demo terrain strings), and that historical data NEVER
changes the ML prediction.
"""
import pytest

from backend.app.data_sources import history_index, history_provider


def make_event(
    *,
    fid: int,
    anchor_lat: float,
    anchor_lon: float,
    rings: list[list[list[float]]] | None = None,
    begin_date: str = "2002-08-11",
    end_date: str = "2002-08-13",
    country: str = "India",
    cause: str = "Heavy rain",
):
    lons = [c[0] for ring in rings for c in ring] if rings else [anchor_lon]
    lats = [c[1] for ring in rings for c in ring] if rings else [anchor_lat]
    return {
        "fid": fid,
        "report_number": str(fid),
        "country": country,
        "subdivision": "",
        "area_km2": None,
        "main_cause": cause,
        "severity": 1.0,
        "flood_impact_index": 4.3,
        "begin_date": begin_date,
        "end_date": end_date,
        "lon_min": min(lons),
        "lon_max": max(lons),
        "lat_min": min(lats),
        "lat_max": max(lats),
        "anchor_lat": anchor_lat,
        "anchor_lon": anchor_lon,
        "rings": rings or [[[anchor_lon, anchor_lat], [anchor_lon, anchor_lat]]],
    }


NEAR_RING = [
    [[78.4, 30.4], [78.6, 30.4], [78.6, 30.6], [78.4, 30.6], [78.4, 30.4]]
]
QUERY = (30.5, 78.5)  # sits inside NEAR_RING and 0 m from an anchor


@pytest.fixture
def history_available(tmp_path, monkeypatch):
    """Real, tiny index with an event anchored at the default query point."""
    events = [
        make_event(fid=2027, anchor_lat=30.5, anchor_lon=78.5, rings=NEAR_RING),
        make_event(fid=999, anchor_lat=30.55, anchor_lon=78.55, rings=NEAR_RING),
    ]
    idx = history_index.write_index(events, tmp_path / "idx", source="synthetic test")
    monkeypatch.setenv("FLASHGUARD_HISTORY_INDEX_DIR", str(idx))
    history_provider._index = True
    history_provider._cache.clear()
    yield idx
    history_provider._index = True
    history_provider._cache.clear()


@pytest.fixture
def history_missing(tmp_path, monkeypatch):
    monkeypatch.setenv("FLASHGUARD_HISTORY_INDEX_DIR", str(tmp_path / "missing"))
    history_provider._index = True
    history_provider._cache.clear()
    yield tmp_path / "missing"
    history_provider._index = True
    history_provider._cache.clear()


def with_full_history(mock_open_meteo, open_meteo_canned):
    mock_open_meteo.configure(payload=open_meteo_canned(past_precipitation=[1.0] * 168))


def arbitrary_payload(latitude=30.5, longitude=78.5, scenario="normal") -> dict:
    return {
        "location_id": f"arbitrary-{latitude}-{longitude}",
        "scenario": scenario,
        "latitude": latitude,
        "longitude": longitude,
    }


def test_live_response_carries_available_history_block(
    client,
    mock_open_meteo,
    mock_elevation,
    open_meteo_canned,
    history_available,
):
    with_full_history(mock_open_meteo, open_meteo_canned)
    body = client.post("/api/v1/risk/assess", json=arbitrary_payload()).json()
    assert body["data_status"] == "LIVE"
    historical = body["historical"]
    assert historical["status"] == "AVAILABLE"
    assert historical["source"] == history_provider.SOURCE
    assert historical["distance_basis"] == "ANCHOR_VERTEX"
    assert historical["search_radius_m"] == 50000
    nearest = historical["nearest"]
    assert nearest["fid"] == 2027
    assert nearest["report_number"] == "2027"
    assert nearest["distance_m"] == 0
    assert nearest["begin_date"] == "2002-08-11"
    assert nearest["cause"] == "Heavy rain"
    assert nearest["latitude"] == 30.5
    assert nearest["longitude"] == 78.5
    assert historical["coverage"]["usable_event_count"] == 2
    assert historical["polygon_contains_location"] is True
    assert historical["events_nearby"][0]["fid"] == 999
    assert historical["events_nearby"][0]["latitude"] == 30.55
    assert historical["events_nearby"][0]["longitude"] == 78.55
    assert historical["disclaimer"]
    # Legacy terrain.historical stays truthful and consistent with the block.
    assert "2027" in body["terrain"]["historical"]


def test_live_response_missing_index_reports_honest_unavailable(
    client,
    mock_open_meteo,
    mock_elevation,
    open_meteo_canned,
    history_missing,
):
    with_full_history(mock_open_meteo, open_meteo_canned)
    body = client.post("/api/v1/risk/assess", json=arbitrary_payload()).json()
    historical = body["historical"]
    assert historical["status"] == "UNAVAILABLE"
    assert historical["status_reason"] == "INDEX_UNAVAILABLE"
    assert historical["nearest"] is None
    assert historical["events_nearby"] == []
    assert body["terrain"]["historical"] == "Unavailable"


def test_history_never_changes_the_ml_prediction(
    client,
    monkeypatch,
    tmp_path,
    mock_open_meteo,
    mock_elevation,
    open_meteo_canned,
    history_available,
):
    with_full_history(mock_open_meteo, open_meteo_canned)
    payload = arbitrary_payload()
    with_hist = client.post("/api/v1/risk/assess", json=payload).json()
    assert with_hist["historical"]["status"] == "AVAILABLE"
    assert bool(with_hist["historical"]["nearest"]) is True

    # Point the provider at a missing index and force a lazy reload, then
    # re-run the identical request. The ML output must be byte-identical.
    monkeypatch.setenv("FLASHGUARD_HISTORY_INDEX_DIR", str(tmp_path / "missing"))
    history_provider._index = True
    history_provider._cache.clear()
    without_hist = client.post("/api/v1/risk/assess", json=payload).json()
    assert without_hist["historical"]["status"] == "UNAVAILABLE"
    for key in (
        "probability",
        "risk_level",
        "prediction_status",
        "contributing_factors",
        "model_version",
        "weather",
    ):
        assert without_hist[key] == with_hist[key]


def test_demo_response_stays_unchanged(
    client, mock_open_meteo, mock_elevation, history_available
):
    body = client.post(
        "/api/v1/risk/assess",
        json={"location_id": "dehradun", "scenario": "critical_flood", "simulate": True},
    ).json()
    assert body["data_status"] == "DEMO"
    assert body["is_simulated"] is True
    assert body["probability"] == 87
    assert body["historical"] is None
    assert body["prediction_status"] is None
    assert body["terrain"]["historical"] == "Seasonal exposure"


def test_demo_arbitrary_scenario_history_none(
    client, mock_open_meteo, mock_elevation, history_available
):
    body = client.post(
        "/api/v1/risk/assess",
        json=arbitrary_payload(scenario="heavy_rain") | {"simulate": True},
    ).json()
    assert "DEMO" in body["data_status"]
    assert body["is_simulated"] is True
    assert body["historical"] is None
    assert body["prediction_status"] is None


def test_unknown_location_still_404(client, history_available):
    response = client.post(
        "/api/v1/risk/assess", json={"location_id": "atlantis", "scenario": "normal"}
    )
    assert response.status_code == 404