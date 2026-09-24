"""Unit tests for ``backend.app.data_sources.river_index``.

Segment rows are ``(x0, y0, x1, y1)`` = ``(lon0, lat0, lon1, lat1)`` in decimal
degrees; queries are ``nearest_distance_m(latitude, longitude, radius_m)``.

These tests cover the GeoIndex / index-format behaviour with tiny synthetic
on-disk indexes only (no network, no external data, no dependence on the
global 44.5M-row production index). Everything is deterministic.
"""
import json

import pytest

from backend.app.data_sources import river_index as ri


# ─── Helpers / fixtures ──────────────────────────────────────────────────

def _build(tmp_path, segments, cell_size_deg=0.1, source="test source"):
    """Write a tiny index from a re-iterable list of (x0,y0,x1,y1) rows."""
    return ri.write_index(
        list(segments), tmp_path, cell_size_deg=cell_size_deg, source=source
    )


def _load(tmp_path):
    return ri.GeoIndex.load(tmp_path)


# ─── 1. Basic point-to-segment distance accuracy ────────────────────────

def test_point_to_segment_distance_accuracy(tmp_path):
    # Horizontal segment along lat 30.0 between lon 79.0 and 79.1.
    _build(tmp_path, [(79.0, 30.0, 79.1, 30.0)])
    idx = _load(tmp_path)
    assert idx is not None

    # Query 0.05 deg (≈5566 m) north of the segment mid-line.
    d = idx.nearest_distance_m(30.05, 79.03, radius_m=15000.0)
    assert d is not None
    assert d == pytest.approx(5566.0, rel=0.05)

    # A query right on top of the segment is ~0 (well within metres).
    d_on = idx.nearest_distance_m(30.0, 79.05, radius_m=1500.0)
    assert d_on is not None
    assert d_on < 5.0


# ─── 2. Nearest-segment selection ────────────────────────────────────────

def test_nearest_segment_is_selected(tmp_path):
    near = (79.0, 30.0, 79.04, 30.0)      # ~3.3 km from the query
    far = (78.5, 29.85, 78.54, 29.85)     # tens of km away
    _build(tmp_path, [near, far])
    idx = _load(tmp_path)

    d = idx.nearest_distance_m(30.03, 79.02, radius_m=15000.0)
    assert d is not None
    assert d == pytest.approx(3340.0, rel=0.05)  # ≈ 0.03 deg north
    assert d < 5000.0


def test_distant_segment_not_returned_for_small_radius(tmp_path):
    _build(tmp_path, [(75.0, 30.0, 75.1, 30.0)])  # ~4 deg away
    idx = _load(tmp_path)
    assert idx.nearest_distance_m(30.0, 79.0, radius_m=1000.0) is None


# ─── 3. Radius / bounds behaviour ────────────────────────────────────────

def test_radius_respects_bounds(tmp_path):
    _build(tmp_path, [(79.0, 30.0, 79.1, 30.0)])
    idx = _load(tmp_path)

    # On the segment within radius -> distance; far away -> None.
    assert idx.nearest_distance_m(30.0, 79.05, radius_m=1_000.0) is not None
    assert idx.nearest_distance_m(30.0, 79.5, radius_m=1_000.0) is None

    # Query far from the cell containing the segment -> None, not a far hit.
    assert idx.nearest_distance_m(30.0, 90.0, radius_m=15_000.0) is None


def test_pole_neighbourhood_does_not_crash(tmp_path):
    # Segment near the north pole; queries at/over the pole must not crash.
    _build(tmp_path, [(0.0, 89.9, 5.0, 89.95)])
    idx = _load(tmp_path)
    assert idx is not None
    d = idx.nearest_distance_m(90.0, 0.0, radius_m=20_000.0)
    assert d is None or d > 0.0


# ─── 4. Antimeridian / dateline handling ─────────────────────────────────

def test_antimeridian_positive_side_query_finds_east_segment(tmp_path):
    # Segment just west of +180 (stored in high-numbered cells).
    _build(tmp_path, [(179.94, 0.5, 179.96, 0.5)])
    idx = _load(tmp_path)
    d = idx.nearest_distance_m(0.5, 179.95, radius_m=15_000.0)
    assert d is not None
    assert d < 5_000.0


def test_antimeridian_west_query_finds_nearby_east_segment(tmp_path):
    # Query at lon -179.96, segment ~0.08 deg across the boundary (~8.9 km).
    # Must be measured on the short arc — not ~40,000 km of raw difference.
    _build(tmp_path, [(179.94, 0.5, 179.96, 0.5)])
    idx = _load(tmp_path)
    d = idx.nearest_distance_m(0.5, -179.96, radius_m=15_000.0)
    assert d is not None
    assert 7_000.0 < d < 11_000.0


def test_antimeridian_crossing_segment_is_found(tmp_path):
    # A segment that straddles the dateline (spans -180..+180).
    _build(tmp_path, [(179.94, 0.5, -179.94, 0.5)])
    idx = _load(tmp_path)
    d = idx.nearest_distance_m(0.5, 179.9, radius_m=15_000.0)
    assert d is not None
    assert d < 15_000.0


# ─── 5. Missing / invalid index ──────────────────────────────────────────

def test_load_missing_directory_returns_none(tmp_path):
    assert ri.GeoIndex.load(tmp_path / "does-not-exist") is None


def test_load_corrupt_meta_returns_none(tmp_path):
    idx_dir = tmp_path / "idx"
    idx_dir.mkdir()
    (idx_dir / ri.META_FILENAME).write_text("{ not valid json", encoding="utf-8")
    assert ri.GeoIndex.load(idx_dir) is None


def test_load_incompatible_version_returns_none(tmp_path):
    _build(tmp_path, [(79.0, 30.0, 79.1, 30.0)])
    meta = json.loads((tmp_path / ri.META_FILENAME).read_text(encoding="utf-8"))
    meta["version"] = 999
    (tmp_path / ri.META_FILENAME).write_text(json.dumps(meta), encoding="utf-8")
    assert ri.GeoIndex.load(tmp_path) is None


def test_empty_index_does_not_crash(tmp_path):
    idx_dir = _build(tmp_path, [])
    idx = _load(tmp_path)
    assert idx is not None
    assert idx.n_segments_rows == 0
    assert idx.nearest_distance_m(30.0, 79.0, radius_m=15_000.0) is None


# ─── 6. Serialisation / loading round-trip ───────────────────────────────

def test_write_reload_roundtrip_metadata_and_rows(tmp_path):
    segments = [
        (79.0, 30.0, 79.1, 30.0),
        (78.0, 31.0, 78.1, 31.0),
        (77.0, 32.0, 77.0, 32.2),
        (76.9, 33.0, 76.9, 33.1),
        (76.8, 34.0, 76.8, 34.1),
    ]
    _build(tmp_path, segments, source="round-trip-test")
    idx = _load(tmp_path)
    assert idx is not None
    assert idx.cell_size_deg == 0.1
    assert idx.nrows == 1800
    assert idx.ncols == 3600
    assert idx.n_segments_rows > 0

    meta = json.loads((tmp_path / ri.META_FILENAME).read_text(encoding="utf-8"))
    assert meta["version"] == ri.FORMAT_VERSION
    assert meta["source"] == "round-trip-test"
    assert meta["cell_size_deg"] == 0.1
    assert "built_at" in meta
    assert meta["n_segments_rows"] == idx.n_segments_rows

    # Offsets table must be consistent with the flat segments buffer.
    assert len(idx.offsets) == idx.nrows * idx.ncols + 1
    assert int(idx.offsets[-1]) == idx.n_segments_rows
    diff = idx.offsets[1:] - idx.offsets[:-1]
    assert (diff >= 0).all()
    assert len(idx.segments) == 4 * idx.n_segments_rows


def test_write_with_callable_factory_is_two_pass_correct(tmp_path):
    segments = [(79.0, 30.0, 79.1, 30.0), (78.0, 31.0, 78.0, 31.1)]

    def factory():
        return iter(list(segments))  # fresh generator per pass

    ri.write_index(factory, tmp_path, source="factory")
    idx = _load(tmp_path)
    assert idx is not None
    assert idx.n_segments_rows > 0
    assert int(idx.offsets[-1]) == idx.n_segments_rows

    # Both segments contribute rows to exactly the cells they overlap.
    d = idx.nearest_distance_m(30.0, 79.0, radius_m=3_000.0)
    assert d is not None and d < 3.0
    d2 = idx.nearest_distance_m(31.0, 78.0, radius_m=3_000.0)
    assert d2 is not None and d2 < 3.0


def test_deterministic_index_reports_real_default_no_network(tmp_path):
    # No network, no external deps: building + querying uses only local files.
    _build(tmp_path, [(79.0, 30.0, 79.1, 30.0)])
    idx = _load(tmp_path)
    assert idx.nearest_distance_m(30.05, 79.03, radius_m=15_000.0) is not None