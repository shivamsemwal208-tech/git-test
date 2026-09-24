"""Focused tests for the historical flood intelligence provider (Phase 3C).

Covers the real ``history_provider``/``history_index`` path against tiny
synthetic on-disk indexes (mirroring how ``test_river_index`` tests the real
river provider): availability, deterministic ordering with fid tie-break,
radius boundary, no-nearby honesty, polygon containment (including hole
semantics), corrupt/missing source → honest unavailable, format-version
mismatch, repeated-query determinism, and metadata integrity.
"""
import json

import pytest

from backend.app.data_sources import history_index, history_provider
from backend.app.data_sources.history_provider import DEFAULT_RADIUS_M


def make_event(
    *,
    fid: int,
    report_number: str = "",
    anchor_lat: float,
    anchor_lon: float,
    rings: list[list[list[float]]] | None = None,
    begin_date: str = "2002-08-11",
    end_date: str = "2002-08-13",
    country: str = "India",
    cause: str = "Heavy rain",
    severity: float | None = 1.0,
    impact: float | None = 4.3,
):
    lons = [c[0] for ring in rings for c in ring] if rings else [anchor_lon]
    lats = [c[1] for ring in rings for c in ring] if rings else [anchor_lat]
    return {
        "fid": fid,
        "report_number": report_number or str(fid),
        "country": country,
        "subdivision": "",
        "area_km2": None,
        "main_cause": cause,
        "severity": severity,
        "flood_impact_index": impact,
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


SQUARE = [
    [[77.9, 30.0], [78.1, 30.0], [78.1, 30.2], [77.9, 30.2], [77.9, 30.0]]
]


@pytest.fixture
def tiny_index(tmp_path):
    """An index with a small, well-understood event set.

    Events A (fid 5) and B (fid 3) share the anchor (30.0, 78.0); D is ~50 km
    south-east; Far is beyond the default radius at (30.0, 85.0).
    """
    events = [
        make_event(fid=5, anchor_lat=30.0, anchor_lon=78.0, rings=SQUARE),
        make_event(fid=3, anchor_lat=30.0, anchor_lon=78.0, rings=SQUARE),
        make_event(fid=9, anchor_lat=29.55, anchor_lon=78.45, rings=SQUARE),
        make_event(fid=12, anchor_lat=30.0, anchor_lon=85.0, rings=SQUARE),
    ]
    return history_index.write_index(
        events,
        tmp_path / "idx",
        source="synthetic test index",
        event_count=len(events) + 1,
        skipped_event_count=1,
    )


@pytest.fixture
def env_index(tmp_path, monkeypatch):
    """Point the provider at an index directory and reset its module state."""
    monkeypatch.setenv("FLASHGUARD_HISTORY_INDEX_DIR", str(tmp_path))
    history_provider._index = True
    history_provider._cache.clear()
    yield tmp_path
    history_provider._index = True
    history_provider._cache.clear()


def test_available_block_shape(tmp_path, monkeypatch):
    events = [make_event(fid=1, anchor_lat=30.0, anchor_lon=78.0)]
    idx = history_index.write_index(events, tmp_path, source="synthetic")
    monkeypatch.setenv("FLASHGUARD_HISTORY_INDEX_DIR", str(idx))
    history_provider._index = True
    history_provider._cache.clear()
    block = history_provider.historical_context(30.0, 78.0)
    assert block["status"] == "AVAILABLE"
    assert block["status_reason"] is None
    assert block["source"] == history_provider.SOURCE
    assert block["search_radius_m"] == DEFAULT_RADIUS_M
    assert block["distance_basis"] == "ANCHOR_VERTEX"
    assert block["coverage"] == {
        "start_date": "2002-08-11",
        "end_date": "2002-08-13",
        "event_count": 1,
        "usable_event_count": 1,
    }
    assert block["disclaimer"]
    assert block["nearest"]["fid"] == 1
    assert block["nearest"]["distance_m"] == 0
    assert block["nearest"]["report_number"] == "1"
    assert block["nearest"]["country"] == "India"
    assert block["nearest"]["cause"] == "Heavy rain"
    # Anchor-vertex coordinates of the recorded polygon travel with the record.
    assert block["nearest"]["latitude"] == 30.0
    assert block["nearest"]["longitude"] == 78.0
    history_provider._index = True
    history_provider._cache.clear()


def test_nearest_tiebreak_by_fid(tmp_path, monkeypatch):
    events = [
        make_event(fid=5, anchor_lat=30.0, anchor_lon=78.0),
        make_event(fid=3, anchor_lat=30.0, anchor_lon=78.0),
    ]
    idx = history_index.write_index(events, tmp_path, source="synthetic")
    monkeypatch.setenv("FLASHGUARD_HISTORY_INDEX_DIR", str(idx))
    history_provider._index = True
    history_provider._cache.clear()
    block = history_provider.historical_context(30.0, 78.0)
    assert block["nearest"]["fid"] == 3  # same distance, smaller fid wins
    history_provider._index = True
    history_provider._cache.clear()


def test_radius_boundary(tmp_path, monkeypatch):
    # ~0.44 deg of latitude ≈ 49 km (inside); 0.46 deg ≈ 51.2 km (outside).
    events = [
        make_event(fid=1, anchor_lat=30.44, anchor_lon=78.0),
        make_event(fid=2, anchor_lat=30.46, anchor_lon=78.0),
    ]
    idx = history_index.write_index(events, tmp_path, source="synthetic")
    monkeypatch.setenv("FLASHGUARD_HISTORY_INDEX_DIR", str(idx))
    history_provider._index = True
    history_provider._cache.clear()
    block = history_provider.historical_context(30.0, 78.0)
    assert block["nearest"]["fid"] == 1
    assert block["nearest"]["distance_m"] <= DEFAULT_RADIUS_M
    # fid 2 (~51.2 km) must not appear anywhere in the nearby lists.
    fids = [block["nearest"]["fid"]] + [e["fid"] for e in block["events_nearby"]]
    assert 2 not in fids
    history_provider._index = True
    history_provider._cache.clear()


def test_no_nearby_event_is_honest_but_still_available(tmp_path, monkeypatch):
    idx = history_index.write_index(
        [make_event(fid=1, anchor_lat=30.0, anchor_lon=78.0)], tmp_path, source="synthetic"
    )
    monkeypatch.setenv("FLASHGUARD_HISTORY_INDEX_DIR", str(idx))
    history_provider._index = True
    history_provider._cache.clear()
    block = history_provider.historical_context(-33.0, 151.0)  # Sydney-ish ocean
    assert block["status"] == "AVAILABLE"
    assert block["nearest"] is None
    assert block["events_nearby"] == []
    assert not block["polygon_contains_location"]
    history_provider._index = True
    history_provider._cache.clear()


def test_events_nearby_excludes_nearest(tmp_path, monkeypatch):
    events = [
        make_event(fid=1, anchor_lat=30.0, anchor_lon=78.0),
        make_event(fid=2, anchor_lat=30.05, anchor_lon=78.0),
        make_event(fid=3, anchor_lat=30.10, anchor_lon=78.0),
        make_event(fid=4, anchor_lat=30.15, anchor_lon=78.0),
    ]
    idx = history_index.write_index(events, tmp_path, source="synthetic")
    monkeypatch.setenv("FLASHGUARD_HISTORY_INDEX_DIR", str(idx))
    history_provider._index = True
    history_provider._cache.clear()
    block = history_provider.historical_context(30.0, 78.0)
    assert block["nearest"]["fid"] == 1
    assert [e["fid"] for e in block["events_nearby"]] == [2, 3, 4]
    assert len(block["events_nearby"]) == 3
    history_provider._index = True
    history_provider._cache.clear()


def test_polygon_containment_and_holes(tmp_path, monkeypatch):
    solid = [
        [[77.9, 30.0], [78.1, 30.0], [78.1, 30.2], [77.9, 30.2], [77.9, 30.0]]
    ]
    ring_with_hole = [
        [[78.4, 30.4], [78.6, 30.4], [78.6, 30.6], [78.4, 30.6], [78.4, 30.4]],
        [[78.47, 30.47], [78.53, 30.47], [78.53, 30.53], [78.47, 30.53], [78.47, 30.47]],
    ]
    events = [
        make_event(fid=1, anchor_lat=30.1, anchor_lon=78.0, rings=solid),
        make_event(fid=2, anchor_lat=30.5, anchor_lon=78.5, rings=ring_with_hole),
    ]
    idx = history_index.write_index(events, tmp_path, source="synthetic")
    index = history_index.HistoricalIndex.load(idx)
    assert index.contains_latitude_longitude(30.1, 78.0) is True  # inside solid
    assert index.contains_latitude_longitude(30.1, 78.2) is False  # outside every bbox
    assert index.contains_latitude_longitude(30.45, 78.45) is True  # outside the hole
    assert index.contains_latitude_longitude(30.5, 78.5) is False  # inside the hole
    assert history_index._point_in_rings(78.5, 30.5, ring_with_hole) is False
    assert history_index._point_in_rings(78.45, 30.45, ring_with_hole) is True


def test_missing_source_is_honest_unavailable(tmp_path, monkeypatch):
    monkeypatch.setenv("FLASHGUARD_HISTORY_INDEX_DIR", str(tmp_path / "nope"))
    history_provider._index = True
    history_provider._cache.clear()
    block = history_provider.historical_context(30.0, 78.0)
    assert block["status"] == "UNAVAILABLE"
    assert block["status_reason"] == "INDEX_UNAVAILABLE"
    assert block["nearest"] is None
    assert block["polygon_contains_location"] is None
    assert "missing or unreadable" in block["disclaimer"]
    assert "fabricated history" in block["disclaimer"]
    history_provider._index = True
    history_provider._cache.clear()


def test_corrupt_index_files_are_honest_unavailable(tmp_path, monkeypatch):
    (tmp_path / "meta.json").write_text("{corrupt json", encoding="utf-8")
    (tmp_path / "events.json").write_text("[]", encoding="utf-8")
    monkeypatch.setenv("FLASHGUARD_HISTORY_INDEX_DIR", str(tmp_path))
    history_provider._index = True
    history_provider._cache.clear()
    block = history_provider.historical_context(30.0, 78.0)
    assert block["status"] == "UNAVAILABLE"
    assert block["status_reason"] == "INDEX_UNAVAILABLE"
    history_provider._index = True
    history_provider._cache.clear()


def test_format_version_mismatch_is_honest_unavailable(tmp_path, monkeypatch):
    idx = history_index.write_index(
        [make_event(fid=1, anchor_lat=30.0, anchor_lon=78.0)], tmp_path, source="synthetic"
    )
    meta = json.loads((tmp_path / "meta.json").read_text(encoding="utf-8"))
    meta["format_version"] = 999
    (tmp_path / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
    monkeypatch.setenv("FLASHGUARD_HISTORY_INDEX_DIR", str(idx))
    history_provider._index = True
    history_provider._cache.clear()
    assert history_index.HistoricalIndex.load(idx) is None
    block = history_provider.historical_context(30.0, 78.0)
    assert block["status"] == "UNAVAILABLE"
    history_provider._index = True
    history_provider._cache.clear()


def test_repeated_queries_are_deterministic(tmp_path, monkeypatch):
    idx = history_index.write_index(
        [
            make_event(fid=8, anchor_lat=30.0, anchor_lon=78.0),
            make_event(fid=2, anchor_lat=30.2, anchor_lon=78.1),
        ],
        tmp_path,
        source="synthetic",
    )
    monkeypatch.setenv("FLASHGUARD_HISTORY_INDEX_DIR", str(idx))
    history_provider._index = True
    history_provider._cache.clear()
    first = history_provider.historical_context(30.1, 78.05)
    second = history_provider.historical_context(30.1, 78.05)
    assert first == second
    history_provider._index = True
    history_provider._cache.clear()


def test_index_metadata_reports_source_counts(tmp_path):
    events = [make_event(fid=1, anchor_lat=30.0, anchor_lon=78.0)]
    history_index.write_index(
        events,
        tmp_path,
        source="synthetic test index",
        event_count=5,
        skipped_event_count=1,
    )
    idx = history_index.HistoricalIndex.load(tmp_path)
    assert idx.meta["event_count"] == 5
    assert idx.meta["usable_event_count"] == 1
    assert idx.meta["skipped_event_count"] == 1
    assert idx.meta["distance_basis"] == "ANCHOR_VERTEX"
    assert idx.meta["default_search_radius_m"] == DEFAULT_RADIUS_M


def test_empty_index_loads_but_answers_nothing(tmp_path, monkeypatch):
    history_index.write_index([], tmp_path, source="synthetic empty")
    monkeypatch.setenv("FLASHGUARD_HISTORY_INDEX_DIR", str(tmp_path))
    history_provider._index = True
    history_provider._cache.clear()
    block = history_provider.historical_context(30.0, 78.0)
    assert block["status"] == "AVAILABLE"
    assert block["nearest"] is None
    history_provider._index = True
    history_provider._cache.clear()