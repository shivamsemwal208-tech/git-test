"""Build the FlashGuard flood-risk training dataset (Step 4).

Source of truth design
======================
Every row is (a) anchored on a real DFO Global Flood Records v0.9.0 event
(labels are DFO-reported flood events — nothing is fabricated) or (b) a
control sample: the same anchor point on a date that is at least 30 days away
from any recorded DFO flood event near that location. Weather features come
from the Open-Meteo ARCHIVE API (ERA5) using exactly the same accumulation
windows and units as live inference (``weather_service``), then flow through
``build_features`` + ``transform_vector`` from ``backend.app.risk_engine`` so
training features are definitionally identical to future live input.

Honesty rules
=============
* No values are ever imputed or fabricated; unavailable windows are ``None``
  (blank in the CSV) and their per-feature missing rate is reported.
* slope/aspect come from a batched 3x3 Open-Meteo elevation neighbourhood
  (same endpoint as live inference) with the least-squares plane fit reused
  from ``terrain_provider``. An anchor whose 3x3 grid cannot be fully retrieved
  is DROPPED and counted — never imputed, never approximated from another
  location. Both the positive and negative rows of that event are dropped so
  every surviving event keeps exactly one positive and one negative sample.
* ``river_distance_m`` has NO source connected in this release: it is a
  reported/optional feature left blank by design and excluded from the
  11-feature model contract (it never blocks predictions).
* A negative with no clean 30-day gap is KEPT but flagged
  (``negative_clean=0``) and counted in the report; it is never silently dropped.
* If the archive cannot serve the observed time slot, the row is dropped and
  counted as a fetch failure (never substituted from a nearby slot).

Usage
=====
    python ml/src/build_dataset.py                 # default run
    python -m ml.src.build_dataset --max-events 60 --seed 7 --workers 6
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
import sqlite3
import struct
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.data_sources import terrain_provider  # noqa: E402
from backend.app.risk_engine.features import (  # noqa: E402
    FEATURE_NAMES,
    build_features,
    transform_vector,
)
from backend.app.services import weather_service  # noqa: E402

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
ELEVATION_URL = "https://api.open-meteo.com/v1/elevation"
GPKG_FILENAME = "Global_Flood_Records.gpkg"
SOURCE_NOTE = "DFO Global Flood Records v0.9.0"
SOURCE_DOI = "10.5281/zenodo.19288171"
DOWNLOAD_URL = "https://zenodo.org/records/19288171/files/Global_Flood_Records.gpkg"

OBS_HOUR_UTC = 12
OBS_FORMAT = "%Y-%m-%dT%H:%M"
FETCH_PAD_DAYS_BEFORE = 8
FETCH_PAD_DAYS_AFTER = 1

# Batch size for the Open-Meteo elevation API (single request coords limit).
ELEVATION_CHUNK = 100

NEGATIVE_MIN_CLEAR_DAYS = 30
NEGATIVE_MIN_OFFSET_DAYS = 90
NEGATIVE_MAX_OFFSET_DAYS = 900
NEGATIVE_MAX_DRAWS = 25
PROXIMITY_DEGREES = 3.0

ARCHIVE_TIMEOUT_SECONDS = 60
ARCHIVE_RETRIES = 3
ELEVATION_CHUNK = 100

_MAX_DATE = date(2023, 12, 31)


def _f(value) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _fmt_dt(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_date(text: str) -> date | None:
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%d/%m/%Y"):
        try:
            return datetime.strptime(text.strip(), fmt).date()
        except ValueError:
            continue
    return None


# ─── GeoPackage / DFO source loading ────────────────────────────────────

def _parse_gpkg_geometry(blob: bytes) -> list[tuple[float, float]]:
    """Return lon/lat vertices from a GeoPackageBinary (WGS84, EPSG:4326)."""
    assert blob[:2] == b"GP"
    flags = blob[3]
    env_code = (flags >> 1) & 0b111
    env_doubles = {0: 0, 1: 4, 2: 6, 3: 6, 4: 8}[env_code]
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

    points: list[tuple[float, float]] = []
    if geom_type == 1:  # Point
        points = coords(1)
    elif geom_type == 2:  # LineString
        points = coords(u32())
    elif geom_type == 3:  # Polygon
        n_rings = u32()
        for _ in range(n_rings):
            points.extend(coords(u32()))
    elif geom_type == 5:  # MultiPoint
        n_points = u32()
        for _ in range(n_points):
            skip_geometry_header()
            points.extend(coords(1))
    elif geom_type == 6:  # MultiPolygon
        n_polygons = u32()
        for _ in range(n_polygons):
            skip_geometry_header()
            n_rings = u32()
            for _ in range(n_rings):
                points.extend(coords(u32()))
    if not points:
        raise ValueError(f"unsupported geometry type {geom_type}")
    return points


def load_events(gpkg_path: Path) -> list[dict]:
    """Load every DFO flood record with anchor point, bbox and attributes."""
    con = sqlite3.connect(str(gpkg_path))
    events: list[dict] = []
    cur = con.execute(
        "select fid, ReportNumber, Country, Area, BeginDate, EndDate, MainCause, "
        "Severity, FloodImpactIndex, geom from combined_floods"
    )
    for fid, report, country, area, begin, end, cause, severity, impact, blob in cur:
        try:
            coords = _parse_gpkg_geometry(blob)
        except (AssertionError, ValueError, struct.error):
            continue
        lons = [c[0] for c in coords]
        lats = [c[1] for c in coords]
        if not coords or min(lats) < -90 or max(lats) > 90 or min(lons) < -180 or max(lons) > 180:
            continue
        center_lon = sum(lons) / len(lons)
        center_lat = sum(lats) / len(lats)
        anchor = min(coords, key=lambda c: (c[0] - center_lon) ** 2 + (c[1] - center_lat) ** 2)
        events.append(
            {
                "fid": fid,
                "report_number": report,
                "country": (country or "").strip(),
                "area_km2": _f(area),
                "main_cause": (cause or "").strip(),
                "severity": _f(severity),
                "flood_impact_index": _f(impact),
                "begin_date": _parse_date(begin),
                "end_date": _parse_date(end) or _parse_date(begin),
                "lon_min": min(lons),
                "lon_max": max(lons),
                "lat_min": min(lats),
                "lat_max": max(lats),
                "center_lon": center_lon,
                "center_lat": center_lat,
                "anchor_lat": anchor[1],
                "anchor_lon": anchor[0],
            }
        )
    con.close()
    return events


# ─── Eligibility / sampling ─────────────────────────────────────────────

DAM_OR_ICE_TOKENS = (
    "ice", "dam", "levee", "tidal", "surge", "tsunami", "glacier", "snowmelt",
)


def _is_flash_flood_cause(cause: str) -> bool:
    """Rain-driven flash-flood causes only (heavy/torrential/monsoonal rain).

    Cyclone/storm/typhoon/hurricane events are excluded: they are typically
    large-area, multi-day riverine/coastal floods, not the short-burst
    orographic thunderstorms FlashGuard targets. ``Rain and snowmelt`` is kept
    (rain-driven); pure snowmelt/ice/dam events are dropped.
    """
    norm = cause.lower()
    if any(token in norm for token in DAM_OR_ICE_TOKENS):
        return False
    if "cyclone" in norm or "storm" in norm or "typhoon" in norm or "hurricane" in norm:
        return False
    return ("heavy rain" in norm or "torrential rain" in norm
            or "monsoon" in norm or "rain and snowmelt" in norm)


def eligible_events(events: list[dict]) -> tuple[list[dict], dict]:
    stats: dict[str, int] = {"total": len(events)}
    pool = [e for e in events if _is_flash_flood_cause(e["main_cause"])]
    stats["rain_cause"] = len(pool)
    pool = [e for e in pool if e["begin_date"] is not None and e["end_date"] is not None]
    stats["parseable_dates"] = len(pool)
    pool = [e for e in pool if e["begin_date"] >= date(1985, 6, 1) and e["end_date"] <= _MAX_DATE]
    stats["within_archive_window"] = len(pool)
    pool = [e for e in pool if e["area_km2"] and e["area_km2"] > 0]
    stats["positive_area"] = len(pool)
    return pool, stats


def _nearby(event: dict, lat: float, lon: float) -> bool:
    return (abs(event["center_lat"] - lat) <= PROXIMITY_DEGREES
            and abs(event["center_lon"] - lon) <= PROXIMITY_DEGREES)


def _date_is_clear(candidate: date, events: list[dict], lat: float, lon: float,
                   clear_days: int) -> bool:
    for other in events:
        if not _nearby(other, lat, lon):
            continue
        start = other["begin_date"]
        end = other["end_date"]
        low = start - timedelta(days=clear_days)
        high = end + timedelta(days=clear_days)
        if low <= candidate <= high:
            return False
    return True


def pick_negative_date(event: dict, all_events: list[dict], rng: random.Random
                       ) -> tuple[date, bool]:
    """A control date at the same anchor, >= 30 days from any nearby recorded flood."""
    start = event["begin_date"]
    end = event["end_date"]
    clean = False
    candidate = None
    for _ in range(NEGATIVE_MAX_DRAWS):
        offset = rng.randint(NEGATIVE_MIN_OFFSET_DAYS, NEGATIVE_MAX_OFFSET_DAYS)
        if rng.random() < 0.5:
            candidate = end - timedelta(days=offset)
        else:
            candidate = end + timedelta(days=offset)
        if candidate < date(1985, 6, 1) or candidate > _MAX_DATE:
            continue
        if _date_is_clear(candidate, all_events, event["anchor_lat"], event["anchor_lon"],
                          NEGATIVE_MIN_CLEAR_DAYS):
            clean = True
            break
    if candidate is None:
        candidate = min(end + timedelta(days=NEGATIVE_MIN_OFFSET_DAYS), _MAX_DATE)
    if not clean:
        candidate = min(candidate, _MAX_DATE)
    return candidate, clean


# ─── Remote fetch helpers ───────────────────────────────────────────────

def download_source(data_dir: Path) -> Path:
    data_dir.mkdir(parents=True, exist_ok=True)
    target = data_dir / GPKG_FILENAME
    if target.exists() and target.stat().st_size > 0:
        return target
    print(f"[download] {DOWNLOAD_URL}")
    with httpx.stream("GET", DOWNLOAD_URL, timeout=300, follow_redirects=True) as resp:
        resp.raise_for_status()
        with open(target, "wb") as handle:
            for chunk in resp.iter_bytes(1 << 16):
                handle.write(chunk)
    return target


def _fetch_json(url: str, params: dict, client: httpx.Client) -> dict | None:
    for attempt in range(ARCHIVE_RETRIES):
        try:
            resp = client.get(url, params=params, timeout=ARCHIVE_TIMEOUT_SECONDS)
            if resp.status_code == 200:
                return resp.json()
        except (httpx.HTTPError, ValueError):
            pass
        time.sleep(1.0 * (attempt + 1))
    return None


def fetch_archive(obs: datetime, lat: float, lon: float, client: httpx.Client) -> dict | None:
    start = obs.date() - timedelta(days=FETCH_PAD_DAYS_BEFORE)
    end = obs.date() + timedelta(days=FETCH_PAD_DAYS_AFTER)
    payload = _fetch_json(
        ARCHIVE_URL,
        {
            "latitude": lat,
            "longitude": lon,
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "hourly": "precipitation,soil_moisture_0_to_7cm",
            "timezone": "GMT",
        },
        client,
    )
    if not payload or "hourly" not in payload:
        return None
    return payload


def fetch_elevations(points: list[tuple[float, float]], client: httpx.Client
                     ) -> dict[tuple[float, float], float | None]:
    """Batch-elevation lookup; a missing value stays None (never invented)."""
    result: dict[tuple[float, float], float | None] = {}
    for i in range(0, len(points), ELEVATION_CHUNK):
        chunk = points[i:i + ELEVATION_CHUNK]
        payload = _fetch_json(
            ELEVATION_URL,
            {
                "latitude": ",".join(f"{lat:.6f}" for lat, _ in chunk),
                "longitude": ",".join(f"{lon:.6f}" for _, lon in chunk),
            },
            client,
        )
        if payload and payload.get("elevation"):
            for point, value in zip(chunk, payload["elevation"]):
                result[point] = _f(value)
        else:
            for point in chunk:
                result[point] = None
    return result


# ─── Row building ───────────────────────────────────────────────────────

def payload_to_components(payload: dict, obs: datetime, elevation: float | None,
                          terrain: dict | None) -> tuple[dict, int] | None:
    hourly = payload["hourly"]
    times = hourly.get("time") or []
    target = obs.strftime(OBS_FORMAT)
    try:
        now_index = times.index(target)
    except ValueError:
        return None
    precipitation = [_f(v) for v in hourly.get("precipitation") or []]
    soil_frac = hourly.get("soil_moisture_0_to_7cm") or []
    soil_at_obs = None if now_index >= len(soil_frac) else _f(soil_frac[now_index])
    soil = None if soil_at_obs is None else round(soil_at_obs * 100, 1)

    accum = weather_service.rainfall_accumulation(precipitation, now_index)
    extended = weather_service.extended_rainfall_accumulation(precipitation, now_index)
    terrain = terrain or {}
    components = {
        **accum,
        **extended,
        "soil_moisture_0_to_7cm": soil,
        "elevation": elevation,
        "slope_degrees": terrain.get("slope_degrees"),
        "aspect_degrees": terrain.get("aspect_degrees"),
    }
    return components, now_index


def job_result(job: dict, elev: float | None, terrain: dict | None,
               client: httpx.Client) -> dict:
    payload = fetch_archive(job["obs_datetime"], job["lat"], job["lon"], client)
    if payload is None:
        return {"status": "fetch_failed"}
    built = payload_to_components(payload, job["obs_datetime"], elev, terrain)
    if built is None:
        return {"status": "obs_slot_missing"}
    components, _ = built
    raw = build_features(components)
    transformed = transform_vector(raw)
    return {
        "status": "ok",
        "job": job,
        "raw": raw,
        "transformed": transformed,
    }


# ─── Outputs ────────────────────────────────────────────────────────────

RAW_COLUMNS = [
    "row_id", "label", "observed_at", "source", "dfo_report_number", "dfo_fid",
    "event_country", "event_main_cause", "event_severity", "event_impact_index",
    "event_start_date", "event_end_date", "anchor_lat", "anchor_lon",
    "negative_clean",
] + list(FEATURE_NAMES)

ML_COLUMNS = ["row_id", "label", "observed_at"] + list(FEATURE_NAMES)


def _csv_float(value) -> str:
    return "" if value is None else (f"{value:.6g}" if isinstance(value, float) else str(value))


def _write_csv(path: Path, columns: list[str], rows: list[list]) -> None:
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(columns)
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=ROOT / "data" / "raw" / "dfo",
                        help="Where the DFO gpkg lives / is downloaded.")
    parser.add_argument("--outdir", type=Path, default=ROOT / "data" / "processed",
                        help="Where the dataset + report are written.")
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--max-events", type=int, default=150)
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--no-download", action="store_true",
                        help="Fail instead of downloading the source gpkg.")
    args = parser.parse_args()

    args.outdir.mkdir(parents=True, exist_ok=True)

    gpkg = args.data_dir / GPKG_FILENAME
    if args.no_download and not gpkg.exists():
        sys.exit(f"Source gpkg not found at {gpkg} (--no-download).")
    gpkg = download_source(args.data_dir) if not args.no_download else gpkg
    sha256 = hashlib.sha256(gpkg.read_bytes()).hexdigest()

    print("[load] events from gpkg...")
    events = load_events(gpkg)
    pool, eligibility = eligible_events(events)
    eligibility["coordinate_parsed"] = len(events)
    print(f"[load] parsed {len(events)} events; eligible {len(pool)}")

    n_events = min(args.max_events, len(pool))
    rng = random.Random(args.seed)
    roster = pool[:]
    rng.shuffle(roster)
    sampled = roster[:n_events]

    jobs: list[dict] = []
    negatives_flagged = 0
    for event in sampled:
        begin = datetime.combine(event["begin_date"], datetime.min.time().replace(hour=OBS_HOUR_UTC),
                                 tzinfo=None)
        jobs.append({"kind": "positive", "event": event, "obs_datetime": begin,
                     "label": 1, "lat": event["anchor_lat"], "lon": event["anchor_lon"],
                     "negative_clean": None, "clean": True})
        neg_date, clean = pick_negative_date(event, pool, rng)
        if not clean:
            negatives_flagged += 1
        neg_dt = datetime.combine(neg_date, datetime.min.time().replace(hour=OBS_HOUR_UTC))
        jobs.append({"kind": "negative", "event": event, "obs_datetime": neg_dt,
                     "label": 0, "lat": event["anchor_lat"], "lon": event["anchor_lon"],
                     "negative_clean": 1 if clean else 0, "clean": clean})

    anchors = list({(round(j["lat"], 5), round(j["lon"], 5)) for j in jobs})
    print(f"[elevation] batch lookups for {len(anchors)} points")
    t0 = time.time()
    with httpx.Client() as client:
        elevations = fetch_elevations(anchors, client)
        print(f"[elevation] done in {time.time() - t0:.1f}s "
              f"(missing {sum(1 for v in elevations.values() if v is None)})")

        # Terrain (slope/aspect) is static per anchor and resolved against the
        # SAME batch Open-Meteo elevation endpoint used live: fetch one 3x3 grid
        # per anchor (~9 coords) in GRID_OFFSETS order and fit the plane
        # locally via terrain_provider.slope_aspect_from_grid. River/hydrology
        # has NO source in this release: the optional river_distance_m feature
        # stays blank by design and is excluded from the 11-feature model
        # contract. Anchors whose 3x3 grid cannot be fully retrieved drop BOTH
        # event rows — never imputed, never approximated from another location.
        anchor_points: dict[tuple[float, float], list[tuple[float, float]]] = {
            anchor: [
                (anchor[0] + dy, anchor[1] + dx)
                for dy, dx in terrain_provider.GRID_OFFSETS
            ]
            for anchor in anchors
        }
        all_points = [point for grid in anchor_points.values() for point in grid]
        print(
            f"[terrain] fetching {len(all_points)} grid points for "
            f"{len(anchors)} anchors (batched Open-Meteo elevation)..."
        )
        t0 = time.time()
        grid_elevations = fetch_elevations(all_points, client)
        anchor_terrain: dict[tuple[float, float], dict] = {}
        terrain_drops = Counter()
        for i, anchor in enumerate(anchors, start=1):
            lat, lon = anchor
            grid = [grid_elevations.get(point) for point in anchor_points[anchor]]
            try:
                computed = terrain_provider.slope_aspect_from_grid(
                    grid,
                    terrain_provider.NEIGHBORHOOD_SPACING_DEGREES,
                    lat,
                )
            except (terrain_provider.ProviderError, ValueError):
                computed = {"slope_degrees": None, "aspect_degrees": None}
            if (
                computed.get("slope_degrees") is None
                or computed.get("aspect_degrees") is None
            ):
                terrain_drops["anchors_terrain_fetch_failed"] += 1
                continue
            anchor_terrain[anchor] = {
                "slope_degrees": computed["slope_degrees"],
                "aspect_degrees": computed["aspect_degrees"],
            }
            if i % 25 == 0:
                print(f"[terrain] {i}/{len(anchors)} anchors done")
        print(
            f"[terrain] done in {time.time() - t0:.1f}s; "
            f"kept {len(anchor_terrain)}/{len(anchors)} anchors "
            f"({dict(terrain_drops)} dropped)"
        )

        kept_jobs = [
            j for j in jobs if (round(j["lat"], 5), round(j["lon"], 5)) in anchor_terrain
        ]
        if kept_jobs != jobs:
            print(f"[terrain] dropping {len(jobs) - len(kept_jobs)} rows "
                  f"({(len(jobs) - len(kept_jobs)) // 2} events) with incomplete terrain")

        print(f"[archive] fetching {len(kept_jobs)} rows with {args.workers} workers...")
        t0 = time.time()
        ok_rows = []
        failures = Counter()
        with ThreadPoolExecutor(max_workers=args.workers) as executor:
            futures = {
                executor.submit(
                    job_result,
                    j,
                    elevations.get((round(j["lat"], 5), round(j["lon"], 5))),
                    anchor_terrain[(round(j["lat"], 5), round(j["lon"], 5))],
                    client,
                ): j
                for j in kept_jobs
            }
            for i, future in enumerate(as_completed(futures), start=1):
                result = future.result()
                if result["status"] != "ok":
                    failures[result["status"]] += 1
                else:
                    ok_rows.append(result)
                if i % 50 == 0:
                    print(f"[archive] {i}/{len(kept_jobs)} done")
    print(f"[archive] done in {time.time() - t0:.1f}s; failed {sum(failures.values())}")

    ok_rows.sort(key=lambda r: (r["job"]["obs_datetime"], r["job"]["lat"]))
    raw_rows: list[list] = []
    ml_rows: list[list] = []
    for row_id, result in enumerate(ok_rows, start=1):
        job = result["job"]
        event = job["event"]
        raw = [row_id, job["label"], _fmt_dt(job["obs_datetime"]), SOURCE_NOTE,
               event["report_number"], event["fid"], event["country"],
               event["main_cause"], _csv_float(event["severity"]),
               _csv_float(event["flood_impact_index"]),
               event["begin_date"].isoformat(), event["end_date"].isoformat(),
               f"{job['lat']:.6f}", f"{job['lon']:.6f}",
               "" if job["negative_clean"] is None else job["negative_clean"]]
        raw.extend(_csv_float(result["raw"][name]) for name in FEATURE_NAMES)
        ml = [row_id, job["label"], _fmt_dt(job["obs_datetime"])]
        ml.extend(_csv_float(result["transformed"][name]) for name in FEATURE_NAMES)
        raw_rows.append(raw)
        ml_rows.append(ml)

    raw_csv = args.outdir / "flood_training.csv"
    ml_csv = args.outdir / "flood_training_ml.csv"
    _write_csv(raw_csv, RAW_COLUMNS, raw_rows)
    _write_csv(ml_csv, ML_COLUMNS, ml_rows)
    print(f"[write] {raw_csv} ({len(raw_rows)} rows)")
    print(f"[write] {ml_csv} ({len(ml_rows)} rows)")

    missing = {name: sum(1 for r in ok_rows if r["raw"][name] is None) for name in FEATURE_NAMES}
    report = {
        "build_version": "dfo_v0.9.0-build-3",
        "script": "ml/src/build_dataset.py",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "parameters": {
            "seed": args.seed,
            "max_events_requested": args.max_events,
            "events_selected": len(sampled),
            "workers": args.workers,
            "observation_hour_utc": OBS_HOUR_UTC,
            "archive_before_pad_days": FETCH_PAD_DAYS_BEFORE,
            "archive_after_pad_days": FETCH_PAD_DAYS_AFTER,
            "negative_min_clear_days": NEGATIVE_MIN_CLEAR_DAYS,
            "negative_min_offset_days": NEGATIVE_MIN_OFFSET_DAYS,
            "terrain_spacing_degrees": terrain_provider.NEIGHBORHOOD_SPACING_DEGREES,
        },
        "terrain": {
            "note": "slope/aspect computed per anchor from a 3x3 Open-Meteo "
                    "elevation neighbourhood (~111 m spacing, batched /100 "
                    "coords per request) via the least-squares plane fit shared "
                    "with live inference; aspect is the downhill bearing "
                    "clockwise from north (0.0 when flat). Anchors whose 3x3 "
                    "grid could not be fully retrieved were DROPPED "
                    "(event-pairwise) and counted — never imputed. The "
                    "optional river_distance_m feature has NO source in this "
                    "release: it is left blank by design and is excluded from "
                    "the 11-feature model contract.",
            "anchors_total": len(anchors),
            "anchors_used": len(anchor_terrain),
            "anchors_dropped": dict(terrain_drops),
            "rows_dropped_for_incomplete_terrain": len(jobs) - len(kept_jobs),
        },
        "source": {
            "note": SOURCE_NOTE,
            "doi": SOURCE_DOI,
            "record_id": "19288171",
            "concept_recid": "19288170",
            "download_url": DOWNLOAD_URL,
            "file": GPKG_FILENAME,
            "sha256": sha256,
        },
        "eligibility": eligibility,
        "classes": {
            "positive": sum(1 for r in ok_rows if r["job"]["label"] == 1),
            "negative": sum(1 for r in ok_rows if r["job"]["label"] == 0),
            "negative_flagged_not_clean": negatives_flagged,
        },
        "archive_failures": dict(failures),
        "missing_raw_counts": missing,
        "missing_raw_rate_pct": {
            name: round(100.0 * count / len(ok_rows), 1) if ok_rows else None
            for name, count in missing.items()
        },
        "feature_columns": list(FEATURE_NAMES),
    }
    countries = Counter(r["job"]["event"]["country"] for r in ok_rows)
    report["coverage"] = {
        "distinct_countries": len(countries),
        "top_countries": countries.most_common(10),
        "observed_at_min": min(_fmt_dt(r["job"]["obs_datetime"]) for r in ok_rows) if ok_rows else None,
        "observed_at_max": max(_fmt_dt(r["job"]["obs_datetime"]) for r in ok_rows) if ok_rows else None,
    }

    report_json = args.outdir / "build_report.json"
    report_json.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"[write] {report_json}")

    validate(raw_rows, ml_rows)
    print("[ok] dataset build complete")


def validate(raw_rows: list[list], ml_rows: list[list]) -> None:
    assert len(raw_rows) == len(ml_rows) > 0, "empty dataset"
    ids = [row[0] for row in raw_rows]
    assert len(set(ids)) == len(ids), "duplicate row ids"
    for row in raw_rows:
        label = row[1]
        assert label in (0, 1), label
    n_features = len(FEATURE_NAMES)
    assert all(len(row) == len(RAW_COLUMNS) for row in raw_rows), "raw column mismatch"
    assert all(len(row) == len(ML_COLUMNS) for row in ml_rows), "ml column mismatch"
    print(f"[validate] {len(raw_rows)} rows, {n_features} features ×2 csvs — OK")


if __name__ == "__main__":
    main()