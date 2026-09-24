"""Build the FlashGuard river grid index from HydroRIVERS v1.0 (Step 2).

What it produces
================
A compact, memory-mapped grid index over the world's mapped river network
(HydroRIVERS v1.0, HydroSHEDS) used by the live river-distance provider. The
index answers "distance to the nearest mapped river" for ANY latitude/longitude
without loading the ~40M-segment catalogue into RAM.

The source of truth is real mapped river geometry: ``HydroRIVERS_v10.shp``
(PolyLine, WGS84, decimal degrees). Nothing here is fabricated, simulated or
downsampled — every reach segment in the dataset is indexed exactly once per
cell it overlaps.

On-disk format
==============
See ``backend.app.data_sources.river_index`` (the single owner of the index
format). This script is the one and only producer; the provider is the reader.

Two streaming passes are used because the machine has very little free RAM
(≈1 GB) yet the file is large:
    pass 1 (counts):  count how many segments touch each 0.1 deg cell
    pass 2 (write):   re-read the SHP, pack segment rows into per-cell
                      contiguous slices, materialise the offset table

Memory stays near-constant regardless of dataset size.

Usage
=====
    python ml/src/build_river_index.py                       # default: global
    python ml/src/build_river_index.py --cell-size-deg 0.1   # custom grid
    python ml/src/build_river_index.py --out data/processed/river_index
"""

from __future__ import annotations

import argparse
import struct
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.data_sources import river_index  # noqa: E402

DEFAULT_SHP = (
    ROOT
    / "data"
    / "raw"
    / "hydrorivers"
    / "HydroRIVERS_v10_shp"
    / "HydroRIVERS_v10.shp"
)
DEFAULT_OUT = ROOT / "data" / "processed" / "river_index"
SOURCE_NOTE = "HydroRIVERS v1.0 (HydroSHEDS), global river network, WGS84"

_STAT_INTERVAL = 2_000_000


def iter_segment_rows(shp_path: Path):
    """Yield ``(x0, y0, x1, y1)`` polylines in decimal degrees.

    Pure-Python SHP reader (no geopandas dependency): walks the 100-byte
    header, then each record, and yields one row per consecutive vertex pair
    within each part. Null shapes (type 0) and non-PolyLine shapes are
    skipped; anything unexpected raises so we never build a silently-wrong
    index from misparsed bytes.
    """
    with open(shp_path, "rb") as handle:
        header = handle.read(100)
        if len(header) != 100:
            raise ValueError(f"not an SHP file ({len(header)}-byte header)")
        shape_type_code, = struct.unpack("<i", header[32:36])
        if shape_type_code not in (3, 13):
            raise ValueError(f"unsupported SHP shape type {shape_type_code} (need PolyLine)")
        while True:
            record_header = handle.read(8)
            if not record_header:
                return
            if len(record_header) < 8:
                raise ValueError("truncated record header")
            content_length_words, = struct.unpack(">i", record_header[4:8])
            content = handle.read(content_length_words * 2)
            if len(content) != content_length_words * 2:
                raise ValueError("truncated record content")
            shape_type, = struct.unpack("<i", content[:4])
            if shape_type == 0:
                continue
            if shape_type not in (3, 13):
                raise ValueError(f"unexpected shape type {shape_type}")
            num_parts, num_points = struct.unpack("<2i", content[36:44])
            if num_parts < 1 or num_points < 1:
                continue
            headers_end = 44 + 4 * num_parts
            if len(content) < headers_end or len(content) < headers_end + 16 * num_points:
                raise ValueError("record content shorter than its parts/points")
            for part_index in range(num_parts):
                start = struct.unpack_from("<i", content, 44 + 4 * part_index)[0]
                end = (
                    num_points
                    if part_index == num_parts - 1
                    else struct.unpack_from("<i", content, 44 + 4 * (part_index + 1))[0]
                )
                for point_index in range(start, end - 1):
                    x0, y0 = struct.unpack_from("<2d", content, headers_end + 16 * point_index)
                    x1, y1 = struct.unpack_from(
                        "<2d", content, headers_end + 16 * (point_index + 1)
                    )
                    yield (x0, y0, x1, y1)


def build(shp_path: Path, out_dir: Path, cell_size_deg: float, progress: bool = True) -> dict:
    """Run the two streaming passes and return the built index metadata."""
    started = time.time()
    if not shp_path.is_file():
        raise FileNotFoundError(f"SHP not found: {shp_path}")

    seen = {"n": 0}

    def counter():
        if progress:
            n = 0
            for row in iter_segment_rows(shp_path):
                n += 1
                if n % _STAT_INTERVAL == 0:
                    print(
                        f"  [{time.strftime('%H:%M:%S')}] read {n/1e6:.0f}M segments",
                        flush=True,
                    )
                yield row
            seen["n"] = n
        else:
            n = 0
            for row in iter_segment_rows(shp_path):
                n += 1
                yield row
            seen["n"] = n

    result = river_index.write_index(
        counter,
        out_dir,
        cell_size_deg=cell_size_deg,
        source=SOURCE_NOTE,
    )
    elapsed = time.time() - started
    print(
        f"Built river index in {elapsed:.1f}s: {seen['n']:,} source segments "
        f"-> {result}"
    )
    return {"segments": seen["n"], "elapsed_s": elapsed, "out": str(result)}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--shp",
        default=str(DEFAULT_SHP),
        help="HydroRIVERS_v10.shp path (default: repo data/raw/hydrorivers).",
    )
    parser.add_argument(
        "--out",
        default=str(DEFAULT_OUT),
        help="Output index directory (default: data/processed/river_index).",
    )
    parser.add_argument(
        "--cell-size-deg",
        type=float,
        default=river_index.DEFAULT_CELL_SIZE_DEG,
        help="Grid cell size in degrees (default 0.1).",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress progress output.",
    )
    args = parser.parse_args(argv)
    build(
        Path(args.shp),
        Path(args.out),
        args.cell_size_deg,
        progress=not args.quiet,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())