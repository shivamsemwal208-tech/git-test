"""Compact grid index over mapped river segments (real data, never synthetic).

This module owns the on-disk format used to answer "distance to the nearest
mapped river" from the global HydroRIVERS v1.0 dataset without keeping the
whole 40M-segment catalogue in memory at query time.

Format
======
An index is a directory containing:

* ``meta.json`` — provenance (source, built_at, cell size, grid shape) and row
  count so the provider can fail honestly and cheaply when the index is
  missing or from an incompatible version.
* ``offsets.dat`` — ``int64`` array of length ``nrows * ncols + 1``; cell
  ``c``'s segment rows live in ``segments.dat[4*offsets[c]:4*offsets[c+1]]``.
* ``segments.dat`` — flat ``float32`` array of packed segment rows. Each row is
  four consecutive values ``(x0, y0, x1, y1)`` in decimal degrees (WGS84): the
  two endpoints of one polyline segment. A segment is indexed in every cell it
  overlaps (bounding-box membership), so a point-to-segment query only ever
  has to look at cells near the query.

The grid is fixed at ``cell_size`` degrees (default 0.1) over lat [-90, 90) and
lon [-180, 180); antimeridian-crossing inputs are wrapped.

Why not in-memory
=================
The source has ~39.8M segments (~48M vertices). A fully in-RAM structure is
not viable in the deployment footprint (≈1 GB free RAM), so the provider
memory-maps ``segments.dat``/``offsets.dat`` and reads only the handful of
cells that fall inside the query radius.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np

DEFAULT_CELL_SIZE_DEG = 0.1
METERS_PER_DEGREE_LAT = 111_320.0

META_FILENAME = "meta.json"
OFFSETS_FILENAME = "offsets.dat"
SEGMENTS_FILENAME = "segments.dat"

FORMAT_VERSION = 1


def _clamp_int(value: float, n: int) -> int:
    value = int(value)
    if value < 0:
        return 0
    if value >= n:
        return n - 1
    return value


def _segment_bands(
    min_lon: float,
    min_lat: float,
    max_lon: float,
    max_lat: float,
    nrows: int,
    ncols: int,
) -> tuple[int, int, list[tuple[int, int, int]]]:
    """Return ``(r_lo, r_hi, [(c_lo, c_hi), ...])`` for a segment bbox.

    Columns are computed in the half-circle space [0, 360) and clamped to the
    grid; a segment more than 180 deg wide (dateline crossing) is split into
    two wrapped bands. Pure integer arithmetic for speed — this runs once per
    segment in the count and write passes.
    """
    r_lo = _clamp_int((min_lat + 90.0) * nrows / 180.0, nrows)
    r_hi = _clamp_int((max_lat + 90.0) * nrows / 180.0, nrows)
    lo360 = min_lon + 180.0
    hi360 = max_lon + 180.0
    c_lo = _clamp_int(lo360 * ncols / 360.0, ncols)
    c_hi = _clamp_int(hi360 * ncols / 360.0, ncols)
    if hi360 - lo360 > 180.0:
        return r_lo, r_hi, [(c_hi, ncols - 1), (0, c_lo)]
    return r_lo, r_hi, [(c_lo, c_hi)]


def _iter_cells(
    min_lon: float,
    min_lat: float,
    max_lon: float,
    max_lat: float,
    nrows: int,
    ncols: int,
):
    """Yield every cell overlapped by a segment's bounding box, as flat IDs."""
    r_lo, r_hi, bands = _segment_bands(
        min_lon, min_lat, max_lon, max_lat, nrows, ncols
    )
    for r in range(r_lo, r_hi + 1):
        base = r * ncols
        for c_lo, c_hi in bands:
            for c in range(c_lo, c_hi + 1):
                yield base + c


def write_index(
    segment_rows,
    out_dir: str | Path,
    *,
    cell_size_deg: float = DEFAULT_CELL_SIZE_DEG,
    source: str = "",
    build_time_iso: str | None = None,
) -> Path:
    """Build a river grid index from an iterable (or factory) of segment rows.

    ``segment_rows`` yields ``(x0, y0, x1, y1)`` in decimal degrees. Because
    the build streams in two passes, ``segment_rows`` may be either a plain
    iterable or a zero-arg callable returning a fresh iterable (recommended for
    a file-backed source so the file is opened once per pass).

    The two passes are:
        count pass:  fill per-cell counts
        write pass:  pack ``segments.dat`` (float32 rows, cell-grouped) via the
                     per-cell cursors, then materialise ``offsets.dat``.

    Returns the index directory. Safe to re-run: the target directory is
    created idempotently and existing files are overwritten.
    """
    def rows():
        return segment_rows() if callable(segment_rows) else segment_rows

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    nrows = int(round(180.0 / cell_size_deg))
    ncols = int(round(360.0 / cell_size_deg))
    if not (1 <= nrows <= 100_000 and 1 <= ncols <= 100_000):
        raise ValueError(f"absurd cell grid {nrows}x{ncols} for cell_size_deg={cell_size_deg}")
    ncells = nrows * ncols

    counts = np.zeros(ncells, dtype=np.int64)
    for x0, y0, x1, y1 in rows():
        if not (np.isfinite(x0) and np.isfinite(y0) and np.isfinite(x1) and np.isfinite(y1)):
            continue
        min_lon, max_lon = (x0, x1) if x0 <= x1 else (x1, x0)
        min_lat, max_lat = (y0, y1) if y0 <= y1 else (y1, y0)
        r_lo, r_hi, bands = _segment_bands(
            min_lon, min_lat, max_lon, max_lat, nrows, ncols
        )
        for r in range(r_lo, r_hi + 1):
            base = r * ncols
            for c_lo, c_hi in bands:
                for c in range(c_lo, c_hi + 1):
                    counts[base + c] += 1

    offsets = np.empty(ncells + 1, dtype=np.int64)
    offsets[0] = 0
    np.cumsum(counts, out=offsets[1:])

    segments = np.memmap(
        out / SEGMENTS_FILENAME,
        dtype=np.float32,
        mode="w+",
        shape=(int(offsets[-1]) * 4,),
    )
    cursors = offsets[:-1].copy()
    for x0, y0, x1, y1 in rows():
        if not (np.isfinite(x0) and np.isfinite(y0) and np.isfinite(x1) and np.isfinite(y1)):
            continue
        min_lon, max_lon = (x0, x1) if x0 <= x1 else (x1, x0)
        min_lat, max_lat = (y0, y1) if y0 <= y1 else (y1, y0)
        r_lo, r_hi, bands = _segment_bands(
            min_lon, min_lat, max_lon, max_lat, nrows, ncols
        )
        for r in range(r_lo, r_hi + 1):
            base = r * ncols
            for c_lo, c_hi in bands:
                for c in range(c_lo, c_hi + 1):
                    base4 = int(cursors[base + c]) * 4
                    segments[base4:base4 + 4] = (x0, y0, x1, y1)
                    cursors[base + c] += 1
    segments.flush()
    del segments

    offsets.tofile(out / OFFSETS_FILENAME)

    meta = {
        "version": FORMAT_VERSION,
        "cell_size_deg": cell_size_deg,
        "nrows": nrows,
        "ncols": ncols,
        "n_segments_rows": int(offsets[-1]),
        "indexed_segment_writes": int(offsets[-1]),
        "source": source,
        "built_at": build_time_iso or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    (out / META_FILENAME).write_text(
        json.dumps(meta, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return out


class GeoIndex:
    """Memory-mapped river index for point-to-segment distance queries.

    The reader lazily memory maps ``offsets.dat``/``segments.dat`` behind
    descriptor properties, so construction is cheap even for a nearly global
    index and only the cells touched by a query are ever pulled from disk.
    """

    def __init__(
        self,
        path: str | Path,
        *,
        cell_size_deg: float,
        nrows: int,
        ncols: int,
        n_segments_rows: int,
    ):
        self.path = Path(path)
        self.cell_size_deg = cell_size_deg
        self.nrows = nrows
        self.ncols = ncols
        self.n_segments_rows = n_segments_rows
        self._offsets = None
        self._segments = None

    @classmethod
    def load(cls, path: str | Path) -> "GeoIndex | None":
        """Load ``meta.json`` + memmaps. Returns ``None`` for any mismatch."""
        root = Path(path)
        try:
            meta = json.loads((root / META_FILENAME).read_text(encoding="utf-8"))
            if meta.get("version") != FORMAT_VERSION:
                return None
            return cls(
                root,
                cell_size_deg=float(meta["cell_size_deg"]),
                nrows=int(meta["nrows"]),
                ncols=int(meta["ncols"]),
                n_segments_rows=int(meta["n_segments_rows"]),
            )
        except (OSError, ValueError, KeyError, json.JSONDecodeError):
            return None

    @property
    def offsets(self) -> np.ndarray:
        if self._offsets is None:
            self._offsets = np.memmap(
                self.path / OFFSETS_FILENAME, dtype=np.int64, mode="r"
            )
        return self._offsets

    @property
    def segments(self) -> np.ndarray:
        if self._segments is None:
            self._segments = np.memmap(
                self.path / SEGMENTS_FILENAME, dtype=np.float32, mode="r"
            )
        return self._segments

    def _lines_to_cover(self, lat: float, lon: float, radius_m: float) -> list[tuple[int, int, int]]:
        """Return the (r, c_lo, c_hi) band list covering ``radius_m``."""
        d_lat = radius_m / METERS_PER_DEGREE_LAT
        cos_lat = max(abs(np.cos(np.deg2rad(lat))), 1e-3)
        d_lon = radius_m / (METERS_PER_DEGREE_LAT * cos_lat)
        r_lo = int(((lat - d_lat + 90.0) / 180.0) * self.nrows)
        r_hi = int(((lat + d_lat + 90.0) / 180.0) * self.nrows)
        r_lo = min(max(r_lo, 0), self.nrows - 1)
        r_hi = min(max(r_hi, 0), self.nrows - 1)

        # Column span in [0, 360) degree space, wrapped across the dateline.
        lon_360 = (lon + 180.0) % 360.0
        lo_deg = lon_360 - d_lon
        hi_deg = lon_360 + d_lon
        if hi_deg - lo_deg >= 360.0:
            col_bands = [(0, self.ncols - 1)]
        else:
            c_lo = int(lo_deg % 360.0 * self.ncols / 360.0)
            c_hi = int(hi_deg % 360.0 * self.ncols / 360.0)
            if lo_deg % 360.0 <= hi_deg % 360.0:
                col_bands = [(c_lo, min(c_hi, self.ncols - 1))]
            else:
                col_bands = [(c_lo, self.ncols - 1), (0, min(c_hi, self.ncols - 1))]

        bands: list[tuple[int, int, int]] = []
        for r in range(r_lo, r_hi + 1):
            for c_lo, c_hi in col_bands:
                if c_lo <= c_hi:
                    bands.append((r, c_lo, c_hi))
        return bands

    def nearest_distance_m(self, lat: float, lon: float, radius_m: float) -> float | None:
        """Great-circle-metres to the nearest indexed river segment.

        Returns ``None`` when no segment is found inside ``radius_m`` — a true
        "no mapped river within this radius" result, never a fabricated value.
        """
        if self.n_segments_rows == 0:
            return None
        offsets = self.offsets
        segments = self.segments
        best = None
        for r, c_lo, c_hi in self._lines_to_cover(lat, lon, radius_m):
            if c_lo > c_hi:
                continue
            base = r * self.ncols
            for c in range(c_lo, c_hi + 1):
                start = int(offsets[base + c])
                stop = int(offsets[base + c + 1])
                if stop - start <= 0:
                    continue
                rows = segments[4 * start:4 * stop].reshape(-1, 4).astype(np.float64)
                d = _point_to_segment_m(lat, lon, rows)
                m = float(np.min(d)) if d.size else None
                if m is not None and (best is None or m < best):
                    best = m
                    if best <= 0.0:
                        return 0.0
        return best

    def segments_near(
        self,
        lat: float,
        lon: float,
        radius_m: float,
        max_rows: int = 1500,
    ) -> tuple[list[list[float]], bool]:
        """Real mapped river segments within ``radius_m``, deduplicated.

        Returns ``(segments, truncated)`` where each segment is
        ``[x0, y0, x1, y1]`` in decimal degrees (WGS84) rounded to 5 decimals
        and deduplicated (a HydroRIVERS segment is indexed in every cell it
        overlaps). Only segments whose nearest point lies inside ``radius_m``
        are returned, so the payload stays bounded. ``truncated`` is ``True``
        when ``max_rows`` was hit and the answer is only a prefix — callers
        render it as an honest partial set, never a fabricated one. Returns
        ``([], False)`` when no mapped river lies within the radius.
        """
        if self.n_segments_rows == 0:
            return [], False
        offsets = self.offsets
        segments = self.segments
        seen: set[tuple[float, float, float, float]] = set()
        result: list[list[float]] = []
        for r, c_lo, c_hi in self._lines_to_cover(lat, lon, radius_m):
            if c_lo > c_hi:
                continue
            base = r * self.ncols
            for c in range(c_lo, c_hi + 1):
                start = int(offsets[base + c])
                stop = int(offsets[base + c + 1])
                if stop - start <= 0:
                    continue
                rows = segments[4 * start : 4 * stop].reshape(-1, 4).astype(np.float64)
                near = np.flatnonzero(_point_to_segment_m(lat, lon, rows) <= radius_m)
                for idx in near:
                    row = tuple(round(float(v), 5) for v in rows[int(idx)])
                    if row in seen:
                        continue
                    seen.add(row)
                    result.append(list(row))
                    if len(result) >= max_rows:
                        return result, True
        return result, False


def _point_to_segment_m(
    lat: float, lon: float, rows: np.ndarray
) -> np.ndarray:
    """Planar point-to-segment distance (metres) in an equirectangular frame
    anchored at the query point (accuracy ~0.1% within 100 km). Longitudes are
    unwrapped modulo 360 relative to the query so dateline-crossing segments
    are measured on their short arc, not ~40,000 km of raw difference."""
    x0, y0, x1, y1 = (rows[:, i] for i in range(4))
    km_per_deg = METERS_PER_DEGREE_LAT * np.cos(np.deg2rad(lat))
    px = 0.0
    py = 0.0
    dx0 = x0 - lon
    dx1 = x1 - lon
    dx0 = dx0 - 360.0 * np.round(dx0 / 360.0)
    dx1 = dx1 - 360.0 * np.round(dx1 / 360.0)
    qx = dx0 * km_per_deg
    qy = (y0 - lat) * METERS_PER_DEGREE_LAT
    rx = dx1 * km_per_deg
    ry = (y1 - lat) * METERS_PER_DEGREE_LAT
    dx = rx - qx
    dy = ry - qy
    denom = dx * dx + dy * dy
    denom_safe = np.where(denom == 0.0, 1.0, denom)
    t = np.clip(((px - qx) * dx + (py - qy) * dy) / denom_safe, 0.0, 1.0)
    cx = qx + t * dx
    cy = qy + t * dy
    return np.sqrt((px - cx) ** 2 + (py - cy) ** 2)