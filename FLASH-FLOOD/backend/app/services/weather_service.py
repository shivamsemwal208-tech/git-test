"""Normalizes live Open-Meteo weather into the FlashGuard weather contract.

This service is the single weather implementation for the API. Routes should
call ``current_weather`` / ``forecast_weather`` only; provider failures are
turned into an honest UNAVAILABLE response (never fabricated values, never a
different location's weather).

The accumulation helpers in this module are the canonical feature definitions
reused by the ML workstream (``ml/src``) when building training features from
the Open-Meteo ARCHIVE/Historical API — same windows, same units (mm), same
null policy — so live inference and training share identical definitions.

Rainfall windows (documented in docs/api.md):
  * Open-Meteo ``precipitation`` (mm) is the sum during the hour *preceding*
    each timestamp, so the value at index ``t`` covers ``t-1h -> t``.
  * ``rainfall_N`` windows are summed over the N hourly values ending at the
    current observation hour. If fewer than N values are available, or any
    value in the window is missing, the field is ``null`` (never estimated).
  * ``rainfall_72h`` = 72 hourly values ending at the current hour.
  * ``rainfall_7d`` = 168 hourly values ending at the current hour.
  * ``antecedent_rainfall_7d`` = the 144 hourly values ending one hour before
    the last 24h window (hours [now-167, now-24]) — i.e. the six days that
    precede the most recent 24h burst; it never overlaps ``rainfall_24h``.
  * ``forecast_rainfall`` is the sum of the 24 hourly values following the
    current hour; null when the window is incomplete or contains nulls.

Soil moisture:
  * ``soil_moisture`` is ``soil_moisture_0_to_1cm`` (volumetric m³/m³, shown
    as a percentage).
  * ``soil_moisture_0_to_7cm`` is the 0-7 cm depth band — the same depth the
    Open-Meteo ARCHIVE API exposes for ML training. The two depth bands are
    distinct measurements and are never treated as interchangeable.
"""
import time
from datetime import datetime, timezone

from backend.app.data_sources.weather_provider import ProviderError, fetch_open_meteo

CACHE_TTL_SECONDS = 600
ACCUMULATION_WINDOWS = (1, 3, 6, 24)
SEVEN_DAY_WINDOW_HOURS = 168
ANTECEDENT_WINDOW_HOURS = 144  # 6 days ending 24h before now (pre-24h antecedent)
FORECAST_WINDOW_HOURS = 24
CHART_HOURS = 8

LIVE_DISCLAIMER = (
    "Live weather retrieved from Open-Meteo (api.open-meteo.com). "
    "Provided for situational awareness, not for official emergency decisions."
)
UNAVAILABLE_DISCLAIMER = (
    "Real-time weather is currently unavailable for this location. "
    "No simulated values have been substituted."
)

_cache: dict[tuple[float, float], tuple[float, dict]] = {}


def _cache_key(latitude: float, longitude: float) -> tuple[float, float]:
    return round(latitude, 3), round(longitude, 3)


def _obtain(latitude: float, longitude: float) -> dict:
    """Return the raw Open-Meteo payload, using the short TTL cache when fresh."""
    key = _cache_key(latitude, longitude)
    now = time.time()
    cached = _cache.get(key)
    if cached is not None and now - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]
    data = fetch_open_meteo(latitude, longitude)
    _cache[key] = (now, data)
    return data


def _float(value) -> float | None:
    return None if value is None else float(value)


def _round1(value) -> float | None:
    return None if value is None else round(float(value), 1)


def _compass(degrees: float | None) -> str | None:
    if degrees is None:
        return None
    directions = [
        "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
        "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
    ]
    index = int(((degrees % 360) + 11.25) // 22.5) % 16
    return directions[index]


def _locate_now(hourly: dict, current: dict) -> int:
    """Find the hourly index closest to the current observation time.

    Open-Meteo's ``current.time`` can be sub-hourly (e.g. ``T13:15``) while
    hourly times are always at hour boundaries (e.g. ``T13:00``). We match on
    the leading 13 characters (``YYYY-MM-DDThh``) to align to the correct slot.
    """
    times = hourly["time"]
    now_str = current.get("time")
    if isinstance(now_str, str) and len(now_str) >= 13:
        hour_prefix = now_str[:13]
        for i, t in enumerate(times):
            if isinstance(t, str) and t[:13] == hour_prefix:
                return i
    # Fallback: find the last time that is not in the future relative to now_str
    if isinstance(now_str, str):
        for i in range(len(times) - 1, -1, -1):
            if isinstance(times[i], str) and times[i] <= now_str:
                return i
    return len(times) - 1


def _window_sum(values: list[float | None], now_index: int, hours: int) -> float | None:
    if hours < 1:
        return None
    start = now_index - hours + 1
    if start < 0 or now_index >= len(values):
        return None
    window = values[start : now_index + 1]
    if any(value is None for value in window):
        return None
    return round(sum(float(value) for value in window), 1)


def rainfall_accumulation(
    precipitation: list[float | None], now_index: int
) -> dict[str, float | None]:
    """Sum hourly precipitation (preceding-hour totals) over 1h/3h/6h/24h windows."""
    return {
        f"rainfall_{hours}h": _window_sum(precipitation, now_index, hours)
        for hours in ACCUMULATION_WINDOWS
    }


def extended_rainfall_accumulation(
    precipitation: list[float | None], now_index: int
) -> dict[str, float | None]:
    """ML rainfall windows: 72h, 7-day, and the pre-24h antecedent (all mm).

    * ``rainfall_72h`` — 72 hourly values ending at the current hour.
    * ``rainfall_7d`` — 168 hourly values ending at the current hour.
    * ``antecedent_rainfall_7d`` — 144 hourly values from ``now-167`` to
      ``now-24`` (the six days before the last 24h window, non-overlapping
      with ``rainfall_24h``).

    Uses the same window semantics, units and null policy as
    ``rainfall_accumulation``. This is the canonical definition reused by the
    ML training pipeline, so training and live inference share it exactly.
    """
    return {
        "rainfall_72h": _window_sum(precipitation, now_index, 72),
        "rainfall_7d": _window_sum(
            precipitation, now_index, SEVEN_DAY_WINDOW_HOURS
        ),
        "antecedent_rainfall_7d": _window_sum(
            # Ends 24h before now so it never overlaps rainfall_24h.
            precipitation,
            now_index - FORECAST_WINDOW_HOURS,
            ANTECEDENT_WINDOW_HOURS,
        ),
    }


def forecast_rainfall_window(
    precipitation: list[float | None], now_index: int
) -> float | None:
    start = now_index + 1
    end = now_index + FORECAST_WINDOW_HOURS
    if start >= len(precipitation) or end >= len(precipitation):
        return None
    window = precipitation[start : end + 1]
    if len(window) < FORECAST_WINDOW_HOURS or any(value is None for value in window):
        return None
    return round(sum(float(value) for value in window), 1)


def _hourly_arrays(hourly: dict) -> dict[str, list[float | None]]:
    return {
        "precipitation": [_float(v) for v in hourly["precipitation"]],
        "temperature": [_float(v) for v in hourly["temperature_2m"]],
        "humidity": [_float(v) for v in hourly["relative_humidity_2m"]],
        "precipitation_probability": [_float(v) for v in hourly["precipitation_probability"]],
        "wind_speed": [_float(v) for v in hourly["wind_speed_10m"]],
        "wind_direction": [_float(v) for v in hourly["wind_direction_10m"]],
        "pressure": [_float(v) for v in hourly["surface_pressure"]],
        "soil_moisture": [_float(v) for v in hourly["soil_moisture_0_to_1cm"]],
        "soil_moisture_0_to_7cm": [_float(v) for v in hourly["soil_moisture_0_to_7cm"]],
    }


def _build_current(
    data: dict,
    latitude: float,
    longitude: float,
    location_id: str,
    location_name: str,
    scenario: str,
) -> dict:
    current = data["current"]
    hourly = data["hourly"]
    arrays = _hourly_arrays(hourly)
    now_index = _locate_now(hourly, current)

    def field(api_name: str, values: list[float | None]) -> float | None:
        value = current.get(api_name)
        if value is None:
            value = values[now_index] if now_index < len(values) else None
        return _float(value)

    temperature = _round1(field("temperature_2m", arrays["temperature"]))
    humidity = _round1(field("relative_humidity_2m", arrays["humidity"]))
    current_rainfall = _round1(field("precipitation", arrays["precipitation"]))
    precipitation_probability = _round1(
        field("precipitation_probability", arrays["precipitation_probability"])
    )
    wind_speed = _round1(field("wind_speed_10m", arrays["wind_speed"]))
    wind_direction = _compass(field("wind_direction_10m", arrays["wind_direction"]))
    pressure = _round1(field("surface_pressure", arrays["pressure"]))
    soil_moisture = field("soil_moisture_0_to_1cm", arrays["soil_moisture"])
    soil_moisture_7cm = field("soil_moisture_0_to_7cm", arrays["soil_moisture_0_to_7cm"])

    accumulation = rainfall_accumulation(arrays["precipitation"], now_index)
    extended = extended_rainfall_accumulation(arrays["precipitation"], now_index)
    forecast_sum = forecast_rainfall_window(arrays["precipitation"], now_index)

    chart = arrays["precipitation"][now_index + 1 : now_index + 1 + CHART_HOURS]
    if len(chart) < CHART_HOURS:
        chart = arrays["precipitation"][max(0, now_index - CHART_HOURS + 1) : now_index + 1]

    return {
        "status": "LIVE",
        "source": "Open-Meteo",
        "data_status": "LIVE",
        "is_simulated": False,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "updated_at": current.get("time"),
        "disclaimer": LIVE_DISCLAIMER,
        "location_id": location_id,
        "location_name": location_name,
        "latitude": latitude,
        "longitude": longitude,
        "scenario": scenario,
        "note": None,
        "temperature": temperature,
        "humidity": humidity,
        "current_rainfall": current_rainfall,
        "rainfall_1h": accumulation["rainfall_1h"],
        "rainfall_3h": accumulation["rainfall_3h"],
        "rainfall_6h": accumulation["rainfall_6h"],
        "rainfall_24h": accumulation["rainfall_24h"],
        "rainfall_72h": extended["rainfall_72h"],
        "rainfall_7d": extended["rainfall_7d"],
        "antecedent_rainfall_7d": extended["antecedent_rainfall_7d"],
        "precipitation_probability": precipitation_probability,
        "forecast_rainfall": forecast_sum,
        "wind_speed": wind_speed,
        "wind_direction": wind_direction,
        "pressure": pressure,
        "soil_moisture": None if soil_moisture is None else round(soil_moisture * 100, 1),
        "soil_moisture_0_to_7cm": (
            None if soil_moisture_7cm is None else round(soil_moisture_7cm * 100, 1)
        ),
        "hourly_rainfall": [_round1(v) for v in chart],
    }


def _build_forecast(
    data: dict,
    latitude: float,
    longitude: float,
    location_id: str,
    location_name: str,
    scenario: str,
) -> dict:
    current = data["current"]
    hourly = data["hourly"]
    arrays = _hourly_arrays(hourly)
    times = hourly["time"]
    now_index = _locate_now(hourly, current)

    start = now_index + 1
    end = min(start + FORECAST_WINDOW_HOURS, len(times))
    entries = [
        {
            "time": times[i],
            "temperature": _round1(arrays["temperature"][i]),
            "precipitation": _round1(arrays["precipitation"][i]),
            "precipitation_probability": _round1(arrays["precipitation_probability"][i]),
            "wind_speed": _round1(arrays["wind_speed"][i]),
        }
        for i in range(start, end)
    ]

    forecast_probs = arrays["precipitation_probability"][start:end]
    present_probs = [value for value in forecast_probs if value is not None]
    probability = max(present_probs) if present_probs else None
    forecast_sum = forecast_rainfall_window(arrays["precipitation"], now_index)

    return {
        "status": "LIVE",
        "source": "Open-Meteo",
        "data_status": "LIVE",
        "is_simulated": False,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "updated_at": current.get("time"),
        "disclaimer": LIVE_DISCLAIMER,
        "location_id": location_id,
        "location_name": location_name,
        "latitude": latitude,
        "longitude": longitude,
        "scenario": scenario,
        "note": None,
        "forecast_rainfall": forecast_sum,
        "precipitation_probability": _round1(probability),
        "hourly_rainfall": [_round1(v) for v in arrays["precipitation"][start:end]],
        "entries": entries,
    }


def _unavailable_base(
    location_id: str, location_name: str, scenario: str, note: str
) -> dict:
    return {
        "status": "UNAVAILABLE",
        "source": None,
        "data_status": "UNAVAILABLE",
        "is_simulated": False,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "updated_at": None,
        "disclaimer": UNAVAILABLE_DISCLAIMER,
        "location_id": location_id,
        "location_name": location_name,
        "latitude": None,
        "longitude": None,
        "scenario": scenario,
        "note": note,
    }


def unavailable_current(location_id: str, location_name: str, scenario: str, note: str) -> dict:
    base = _unavailable_base(location_id, location_name, scenario, note)
    base.update(
        {
            "temperature": None,
            "humidity": None,
            "current_rainfall": None,
            "rainfall_1h": None,
            "rainfall_3h": None,
            "rainfall_6h": None,
            "rainfall_24h": None,
            "rainfall_72h": None,
            "rainfall_7d": None,
            "antecedent_rainfall_7d": None,
            "precipitation_probability": None,
            "forecast_rainfall": None,
            "wind_speed": None,
            "wind_direction": None,
            "pressure": None,
            "soil_moisture": None,
            "soil_moisture_0_to_7cm": None,
            "hourly_rainfall": None,
        }
    )
    return base


def unavailable_forecast(location_id: str, location_name: str, scenario: str, note: str) -> dict:
    base = _unavailable_base(location_id, location_name, scenario, note)
    base.update(
        {
            "forecast_rainfall": None,
            "precipitation_probability": None,
            "hourly_rainfall": None,
            "entries": None,
        }
    )
    return base


def _as_unavailable(
    factory,
    location_id: str,
    location_name: str,
    scenario: str,
    error: Exception,
) -> dict:
    reason = (
        str(error)
        if isinstance(error, ProviderError)
        else f"Weather data could not be processed: {type(error).__name__}"
    )
    return factory(location_id, location_name, scenario, f"Provider unavailable: {reason}")


def current_weather(
    latitude: float,
    longitude: float,
    location_id: str,
    location_name: str,
    scenario: str,
) -> dict:
    try:
        data = _obtain(latitude, longitude)
        return _build_current(data, latitude, longitude, location_id, location_name, scenario)
    except (ProviderError, ValueError, TypeError, IndexError, KeyError) as exc:
        return _as_unavailable(unavailable_current, location_id, location_name, scenario, exc)


def forecast_weather(
    latitude: float,
    longitude: float,
    location_id: str,
    location_name: str,
    scenario: str,
) -> dict:
    try:
        data = _obtain(latitude, longitude)
        return _build_forecast(data, latitude, longitude, location_id, location_name, scenario)
    except (ProviderError, ValueError, TypeError, IndexError, KeyError) as exc:
        return _as_unavailable(unavailable_forecast, location_id, location_name, scenario, exc)