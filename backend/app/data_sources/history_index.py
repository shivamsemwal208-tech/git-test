"""Compact event index over real DFO flood records (historical context).

This module owns the on-disk format used to answer "which recorded flood
events are near these coordinates" from the Dartmouth Flood Observatory Global
Flood Records v0.9.0 dataset without touching the raw GeoPackage at query
time. It is the single owner of the format; ``ml/src/build_dfo_anchor_index.py``
is the producer and ``history_provider`` is the reader.

Format
======
An index is a directory containing:

* ``meta.json`` — provenance (source, built_at, counts, coverage, format
  version) so the provider can fail honestly and cheaply when the index is
  missing or from an incompatible version.
* ``events.json`` — the full, parsed event list. Each record carries the
  event's anchor point, bbox, date range, attributes and the original polygon
  rings (used for coarse point-in-polygon containment).

Distances are measured from a query point to each event's *anchor vertex* —
the polygon boundary vertex nearest the centroid of the polygon's vertices
(the same representative point the ML build step uses). This is deliberately
reported as ``distance_basis: "ANCHOR_VERTEX"`` and never presented as an
exact local-flooding distance: DFO records floods as regional polygons.

Why in-memory is fine
=====================
The source is ~5,500 events (a few MB). Unlike the ~40M-segment river grid,
the whole event catalogue fits in RAM comfortably, so the provider loads it
once and answers every query with a vectorised distance scan.
"""
from __future__ import annotations

import json
import time
from math import asin, cos, radians, sin, sqrt
from pathlib import Path

import numpy as np

META_FILENAME = "meta.json"
EVENTS_FILENAME = "events.json"
DISTANCE_BASIS = "ANCHOR_VERTEX"
DEFAULT_RADIUS_M = 50_000
MAX_NEARBY_EVENTS = 3

FORMAT_VERSION = 1
_EARTH_RADIUS_M = 6_371_008.8


class FormatError(Exception):
    """Raised when an index directory cannot be parsed at all."""


def _haversine_m(lat1: float, lon1: float, lat2: np.ndarray, lon2: np.ndarray) -> np.ndarray:
    """Vectorised great-circle distance (metres) from one point to many."""
    p1, l1 = radians(lat1), radians(lon1)
    p2 = np.radians(lat2)
    l2 = np.radians(lon2)
    dphi = p2 - p1
    dlam = l2 - l1
    a = np.sin(dphi / 2.0) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dlam / 2.0) ** 2
    return 2.0 * _EARTH_RADIUS_M * np.arcsin(np.sqrt(a))


def _point_in_rings(lon: float, lat: float, rings: list[list[list[float]]]) -> bool:
    """Even-odd point-in-polygon test across a MultiPolygon's rings.

    Ring order is preserved from the source geometry, so outer rings and holes
    compound correctly with the even-odd rule (a point inside a hole ends with
    an even crossing count and is reported outside). This is a *coarse*
    containment check: DFO polygons are broad regional outlines, not local
    flood footprints.
    """
    inside = False
    for ring in rings:
        n = len(ring)
        if n < 3:
            continue
        j = n - 1
        for i in range(n):
            xi, yi = ring[i]
            xj, yj = ring[j]
            if (yi > lat) != (yj > lat):
                x_cross = xj + (lat - yj) * (xi - xj) / (yi - yj)
                if x_cross > lon:
                    inside = not inside
            j = i
    return inside


def write_index(
    events: list[dict],
    out_dir: str | Path,
    *,
    source: str,
    build_time_iso: str | None = None,
    event_count: int | None = None,
    skipped_event_count: int | None = None,
) -> Path:
    """Write a DFO event index from parsed event records.

    ``events`` items mirror the build step's records: ``fid, report_number,
    country, subdivision, area_km2, main_cause, severity, flood_impact_index,
    begin_date, end_date, lon_min/lon_max/lat_min/lat_max, anchor_lat,
    anchor_lon, rings`` (rings = list of closed rings; each ring a list of
    ``[lon, lat]`` pairs).

    ``event_count`` / ``skipped_event_count`` let the build step report the raw
    catalogue size (records read from the source GPKG, including any skipped)
    so the coverage is honest about the underlying dataset, not just the
    usable subset.

    Returns the index directory. Safe to re-run: the directory is created
    idempotently and existing files are overwritten.
    """
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out / EVENTS_FILENAME).write_text(
        json.dumps(events, ensure_ascii=True), encoding="utf-8"
    )

    usable = len(events)
    coverage_start = min((e["begin_date"] for e in events if e.get("begin_date")), default=None)
    coverage_end = max((e.get("end_date") or e["begin_date"] for e in events), default=None)
    meta = {
        "format_version": FORMAT_VERSION,
        "source": source,
        "built_at": build_time_iso or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "event_count": usable if event_count is None else event_count,
        "usable_event_count": usable,
        "skipped_event_count": skipped_event_count,
        "coverage": {
            "start_date": coverage_start,
            "end_date": coverage_end,
        },
        "distance_basis": DISTANCE_BASIS,
        "default_search_radius_m": DEFAULT_RADIUS_M,
    }
    (out / META_FILENAME).write_text(
        json.dumps(meta, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return out


class HistoricalIndex:
    """In-memory DFO event index for anchor-distance and containment queries."""

    def __init__(self, path: str | Path, meta: dict, events: list[dict]):
        self.path = Path(path)
        self.meta = meta
        self.events = events
        n = len(events)
        self._anchor_lat = np.array([e["anchor_lat"] for e in events], dtype=np.float64)
        self._anchor_lon = np.array([e["anchor_lon"] for e in events], dtype=np.float64)
        self._fids = np.array([e["fid"] for e in events], dtype=np.int64)
        self._min_lon = np.array([e["lon_min"] for e in events], dtype=np.float64)
        self._max_lon = np.array([e["lon_max"] for e in events], dtype=np.float64)
        self._min_lat = np.array([e["lat_min"] for e in events], dtype=np.float64)
        self._max_lat = np.array([e["lat_max"] for e in events], dtype=np.float64)

    @classmethod
    def load(cls, path: str | Path) -> "HistoricalIndex | None":
        root = Path(path)
        try:
            meta = json.loads((root / META_FILENAME).read_text(encoding="utf-8"))
            if meta.get("format_version") != FORMAT_VERSION:
                return None
            events = json.loads((root / EVENTS_FILENAME).read_text(encoding="utf-8"))
            if not isinstance(events, list):
                return None
        except (OSError, ValueError, KeyError, json.JSONDecodeError):
            return None
        return cls(root, meta, events)

    @property
    def n_events(self) -> int:
        return len(self.events)

    def nearest_events(self, latitude: float, longitude: float, radius_m: float) -> list[dict]:
        """Events within ``radius_m``, sorted by ``(distance_m, fid)``.

        Deterministic: equal distances tie-break on the DFO fid. Returns empty
        list when no recorded event anchor lies within the radius — never an
        invented value.
        """
        if self.n_events == 0:
            return []
        distances = _haversine_m(latitude, longitude, self._anchor_lat, self._anchor_lon)
        close = np.flatnonzero(distances <= radius_m)
        if close.size == 0:
            return []
        order = np.lexsort((self._fids[close], distances[close]))
        records = []
        for idx in close[order]:
            event = self.events[int(idx)]
            distance = float(distances[int(idx)])
            records.append(
                {
                    "fid": event["fid"],
                    "report_number": event["report_number"],
                    "distance_m": int(round(distance)),
                    "distance_basis": DISTANCE_BASIS,
                    # Anchor vertex of the recorded flood polygon — the same
                    # representative point used for the distance measurement.
                    # This is real geography from the DFO catalogue, never a
                    # fabricated coordinate.
                    "latitude": event["anchor_lat"],
                    "longitude": event["anchor_lon"],
                    "begin_date": event.get("begin_date"),
                    "end_date": event.get("end_date"),
                    "country": event.get("country", ""),
                    "cause": event.get("main_cause", ""),
                    "severity": event.get("severity"),
                    "flood_impact_index": event.get("flood_impact_index"),
                }
            )
        return records

    def contains_latitude_longitude(self, latitude: float, longitude: float) -> bool:
        """True when the point lies inside ANY recorded flood polygon.

        Bbox-prefiltered point-in-ring scan. Coarse by nature: DFO polygons
        are broad regional outlines, so containment here does not mean local
        flooding occurred at the exact coordinates.
        """
        candidates = np.flatnonzero(
            (self._min_lon <= longitude)
            & (longitude <= self._max_lon)
            & (self._min_lat <= latitude)
            & (latitude <= self._max_lat)
        )
        for idx in candidates:
            if _point_in_rings(longitude, latitude, self.events[int(idx)]["rings"]):
                return True
        return False