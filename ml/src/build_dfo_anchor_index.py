"""Build the FlashGuard DFO historical event index (Phase 3C).

What it produces
================
A compact event index over the real Dartmouth Flood Observatory (DFO) Global
Flood Records v0.9.0 catalogue — the same GeoPackage the ML training step uses
as its raw source. The index answers "which recorded flood events are near
these coordinates" for the historical-intelligence provider without touching
the GeoPackage at query time.

The source of truth is the real DFO catalogue: ``data/raw/dfo/Global_Flood_Records.gpkg``
(layer ``combined_floods``, 5,503 records, 1985-01-01 to 2024-01-06, WGS84,
CC0). Nothing here is fabricated, simulated or downsampled — every record is
indexed once, using the same anchor-vertex interpretation as the ML build step
(``ml/src/build_dataset.load_events``): the polygon boundary vertex nearest the
centroid of the polygon's vertices.

On-disk format
==============
See ``backend.app.data_sources.history_index`` (the single owner of the index
format). This script is the one and only producer; ``history_provider`` is the
reader.

Historical records are informational only — they are never used as ML features
and never change the feature vector or the model contract.

Usage
=====
    python ml/src/build_dfo_anchor_index.py                 # defaults
    python ml/src/build_dfo_anchor_index.py --out data/processed/dfo_event_index
"""

from __future__ import annotations

import argparse
import struct
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.data_sources import history_index  # noqa: E402

DEFAULT_GPKG = ROOT / "data" / "raw" / "dfo" / "Global_Flood_Records.gpkg"
DEFAULT_OUT = ROOT / "data" / "processed" / "dfo_event_index"
SOURCE = "DFO Global Flood Records v0.9.0 (CC0); source https://floodobservatory.colorado.edu/ (Zenodo 10.5281/zenodo.19288171)"

_ENV_DOUBLES = {0: 0, 1: 4, 2: 6, 3: 6, 4: 8}


def _parse_date(text) -> datetime | None:
    """Parse a DFO date field with the same formats as the ML build step."""
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%d/%m/%Y"):
        try:
            return datetime.strptime(str(text).strip(), fmt).date()
        except ValueError:
            continue
    return None


def _parse_gpkg_rings(blob: bytes) -> list[list[tuple[float, float]]]:
    """Return per-ring lon/lat vertex lists from a GeoPackageBinary (EPSG:4326).

    MultiPolygon rings are preserved in order (outer ring + holes per polygon),
    so coarse point-in-polygon containment uses the true geometry. Point,
    LineString and MultiPoint geometry degrade to single-ring records whose
    containment is degenerate (a one/two-vertex ring can never contain a point).
    """
    assert blob[:2] == b"GP"
    flags = blob[3]
    env_code = (flags >> 1) & 0b111
    env_doubles = _ENV_DOUBLES[env_code]
    wkb = blob[8 + 8 * env_doubles:]
    bo = "<" if wkb[0] == 1 else ">"
    (geom_type,) = struct.unpack(bo + "I", wkb[1:5])
    pos = 5

    def u32() -> int:
        nonlocal pos
        value = struct.unpack(bo + "I", wkb[pos:pos + 4])[0]
        pos += 4
        return value

    def coords(count: int) -> list[tuple[float, float]]:
        nonlocal pos
        out = []
        for _ in range(count):
            x, y = struct.unpack(bo + "2d", wkb[pos:pos + 16])
            pos += 16
            out.append((x, y))
        return out

    def skip_geometry_header() -> None:
        nonlocal pos
        pos += 5  # every sub-geometry carries its own endian+type header

    rings: list[list[tuple[float, float]]] = []
    if geom_type == 1:  # Point
        rings = [coords(1)]
    elif geom_type == 2:  # LineString
        rings = [coords(u32())]
    elif geom_type == 3:  # Polygon
        n_rings = u32()
        for _ in range(n_rings):
            rings.append(coords(u32()))
    elif geom_type == 5:  # MultiPoint
        n_points = u32()
        flat = []
        for _ in range(n_points):
            skip_geometry_header()
            flat.extend(coords(1))
        rings = [flat]
    elif geom_type == 6:  # MultiPolygon
        n_polygons = u32()
        for _ in range(n_polygons):
            skip_geometry_header()
            n_rings = u32()
            for _ in range(n_rings):
                rings.append(coords(u32()))
    if not rings:
        raise ValueError(f"unsupported geometry type {geom_type}")
    return rings


def _as_float(value) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def load_index_records(gpkg_path: Path):
    """Read the DFO GeoPackage into index records.

    Returns ``(records, raw_count, skipped_count)``. Corrupt geometry or
    out-of-range coordinates are skipped (the same two records the ML build
    step drops), and the counts are reported honestly in the index metadata.
    """
    import sqlite3

    con = sqlite3.connect(str(gpkg_path))
    events: list[dict] = []
    raw_count = 0
    skipped = 0
    cur = con.execute(
        "select fid, ReportNumber, SubdivisionName, Country, Area, BeginDate, "
        "EndDate, MainCause, Severity, FloodImpactIndex, geom from combined_floods"
    )
    for fid, report, subdivision, country, area, begin, end, cause, severity, impact, blob in cur:
        raw_count += 1
        try:
            rings = _parse_gpkg_rings(blob)
        except (AssertionError, ValueError, struct.error, IndexError):
            skipped += 1
            continue
        vertices = [coord for ring in rings for coord in ring]
        if not vertices:
            skipped += 1
            continue
        lons = [coord[0] for coord in vertices]
        lats = [coord[1] for coord in vertices]
        if (
            min(lats) < -90
            or max(lats) > 90
            or min(lons) < -180
            or max(lons) > 180
        ):
            skipped += 1
            continue
        center_lon = sum(lons) / len(lons)
        center_lat = sum(lats) / len(lats)
        anchor = min(
            vertices,
            key=lambda coord: (coord[0] - center_lon) ** 2 + (coord[1] - center_lat) ** 2,
        )
        begin_date = _parse_date(begin)
        end_date = _parse_date(end) or begin_date
        events.append(
            {
                "fid": int(fid),
                "report_number": str(report),
                "country": (country or "").strip(),
                "subdivision": (subdivision or "").strip(),
                "area_km2": _as_float(area),
                "main_cause": (cause or "").strip(),
                "severity": _as_float(severity),
                "flood_impact_index": _as_float(impact),
                "begin_date": begin_date.isoformat() if begin_date else None,
                "end_date": end_date.isoformat() if end_date else None,
                "lon_min": min(lons),
                "lon_max": max(lons),
                "lat_min": min(lats),
                "lat_max": max(lats),
                "anchor_lat": anchor[1],
                "anchor_lon": anchor[0],
                "rings": [[list(coord) for coord in ring] for ring in rings],
            }
        )
    con.close()
    return events, raw_count, skipped


def build(gpkg_path: Path, out_dir: Path) -> dict:
    started = time.time()
    if not gpkg_path.is_file():
        raise FileNotFoundError(f"GeoPackage not found: {gpkg_path}")
    events, raw_count, skipped = load_index_records(gpkg_path)
    if not events:
        raise ValueError("no usable records produced; refusing to write an empty index")
    out = history_index.write_index(
        events,
        out_dir,
        source=SOURCE,
        event_count=raw_count,
        skipped_event_count=skipped,
    )
    elapsed = time.time() - started
    print(
        f"Built DFO event index in {elapsed:.1f}s: {raw_count:,} source records "
        f"({skipped} skipped) -> {len(events):,} usable -> {out}"
    )
    return {
        "source_count": raw_count,
        "skipped_count": skipped,
        "usable_count": len(events),
        "elapsed_s": elapsed,
        "out": str(out),
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--gpkg",
        default=str(DEFAULT_GPKG),
        help="DFO Global_Flood_Records.gpkg path (default: repo data/raw/dfo).",
    )
    parser.add_argument(
        "--out",
        default=str(DEFAULT_OUT),
        help="Output index directory (default: data/processed/dfo_event_index).",
    )
    args = parser.parse_args(argv)
    build(Path(args.gpkg), Path(args.out))
    return 0


if __name__ == "__main__":
    sys.exit(main())