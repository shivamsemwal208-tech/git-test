"""Historical flood intelligence provider — real DFO Global Flood Records data.

``historical_context`` answers, for ANY coordinates, "what recorded flood
events are near here" using a local index built from the real Dartmouth Flood
Observatory Global Flood Records v0.9.0 (CC0) catalogue covering 1985-01-01 to
2024-01-06. There is no fabricated, simulated or hardcoded history anywhere in
this module.

How it works
============
An offline build script (``ml/src/build_dfo_anchor_index.py``) converts the
raw ``Global_Flood_Records.gpkg`` into ``data/processed/dfo_event_index`` (see
``history_index`` for the format). This provider loads that index lazily once
and answers each query with a vectorised distance scan over the event anchors.

Distance semantics
==================
The distance reported for an event is the great-circle metres from the query
point to the event's *anchor vertex* — the polygon boundary vertex nearest the
centroid of the polygon's vertices (``distance_basis: "ANCHOR_VERTEX"``). It is
NOT a boundary distance and NOT evidence of local flooding: DFO records floods
as regional polygons. ``polygon_contains_location`` is a separate coarse
point-in-polygon check over the recorded polygons and is clearly labelled as
such (country-scale polygons can contain a point without that point having
flooded).

Honest-unavailable semantics
============================
When the local index is missing or unreadable (e.g. a fresh checkout that has
not run the build step), the module returns ``status: "UNAVAILABLE"`` with
``status_reason: "INDEX_UNAVAILABLE"`` — it never fabricates a nearby event
and never queries a network. Absence of a nearby recorded event never means
"no flood ever occurred here"; the response disclaimer says so explicitly.
"""
import os
import time
from pathlib import Path

from backend.app.data_sources import history_index

DEFAULT_RADIUS_M = history_index.DEFAULT_RADIUS_M
CACHE_TTL_SECONDS = 600

SOURCE = "DFO Global Flood Records v0.9.0 (CC0)"
DISCLAIMER = (
    "Recorded flood events are catalogue entries from the Dartmouth Flood "
    "Observatory, which documents floods as regional polygons. Distance is "
    "measured to each event's anchor vertex and does not imply local flooding "
    "at these coordinates. Absence of a nearby record does not prove that "
    "flooding never occurred."
)
_UNAVAILABLE_DISCLAIMER = (
    "The local DFO event index is missing or unreadable, so historical flood "
    "intelligence is unavailable. No demo or fabricated history was produced."
)

_INDEX_DIR_ENV = "FLASHGUARD_HISTORY_INDEX_DIR"
_DEFAULT_INDEX_DIR = (
    Path(__file__).resolve().parents[3] / "data" / "processed" / "dfo_event_index"
)

_cache: dict[tuple[float, float], tuple[float, dict]] = {}
_index: history_index.HistoricalIndex | None | bool = True  # True = not tried yet


class ProviderError(Exception):
    """Raised for unexpected failures; a plain unavailable state stays a value."""


def index_dir() -> Path:
    """Index directory, overridable via ``FLASHGUARD_HISTORY_INDEX_DIR``."""
    override = os.environ.get(_INDEX_DIR_ENV)
    return Path(override) if override else _DEFAULT_INDEX_DIR


def _load_index() -> history_index.HistoricalIndex | None:
    """Lazily load and memoise the HistoricalIndex (``None`` when unavailable)."""
    global _index
    if _index is True:
        _index = history_index.HistoricalIndex.load(index_dir())
    return _index if isinstance(_index, history_index.HistoricalIndex) else None


def _coverage(idx: history_index.HistoricalIndex) -> dict | None:
    coverage = idx.meta.get("coverage") or {}
    start = coverage.get("start_date")
    end = coverage.get("end_date")
    if not start or not end:
        return None
    return {
        "start_date": start,
        "end_date": end,
        "event_count": idx.meta.get("event_count"),
        "usable_event_count": idx.meta.get("usable_event_count"),
    }


def _unavailable_block(status_reason: str) -> dict:
    return {
        "status": "UNAVAILABLE",
        "status_reason": status_reason,
        "source": None,
        "coverage": None,
        "search_radius_m": DEFAULT_RADIUS_M,
        "distance_basis": history_index.DISTANCE_BASIS,
        "nearest": None,
        "polygon_contains_location": None,
        "events_nearby": [],
        "disclaimer": _UNAVAILABLE_DISCLAIMER,
    }


def historical_context(
    latitude: float,
    longitude: float,
    radius_m: float = DEFAULT_RADIUS_M,
) -> dict:
    """Return the historical flood intelligence block for a coordinate pair.

    The block is purely informational — it is never used as an ML feature and
    never blocks a risk prediction. ``nearest``/``events_nearby`` are ordered
    deterministically by ``(distance_m, fid)``. ``polygon_contains_location``
    is a coarse polygon-containment flag (see module docstring). Cached with a
    short TTL keyed on the rounded coordinates.
    """
    key = (round(latitude, 5), round(longitude, 5))
    now = time.time()
    cached = _cache.get(key)
    if cached is not None and now - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    idx = _load_index()
    if idx is None:
        block = _unavailable_block("INDEX_UNAVAILABLE")
        _cache[key] = (now, block)
        return block

    all_nearby = idx.nearest_events(latitude, longitude, radius_m)
    nearest = all_nearby[0] if all_nearby else None
    # events_nearby lists the closest events AFTER the nearest one (capped).
    events_nearby = all_nearby[1 : history_index.MAX_NEARBY_EVENTS + 1]

    block = {
        "status": "AVAILABLE",
        "status_reason": None,
        "source": SOURCE,
        "coverage": _coverage(idx),
        "search_radius_m": int(radius_m),
        "distance_basis": history_index.DISTANCE_BASIS,
        "nearest": nearest,
        "polygon_contains_location": idx.contains_latitude_longitude(latitude, longitude),
        "events_nearby": events_nearby,
        "disclaimer": DISCLAIMER,
    }
    _cache[key] = (now, block)
    return block