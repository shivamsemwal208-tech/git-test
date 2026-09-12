from pydantic import BaseModel
from .common import DemoMetadata


class WeatherCurrentResponse(DemoMetadata):
    status: str
    source: str | None
    updated_at: str | None
    location_id: str
    location_name: str
    latitude: float | None
    longitude: float | None
    temperature: float | None
    humidity: float | None
    current_rainfall: float | None
    rainfall_1h: float | None
    rainfall_3h: float | None
    rainfall_6h: float | None
    rainfall_24h: float | None
    rainfall_72h: float | None
    rainfall_7d: float | None
    antecedent_rainfall_7d: float | None
    precipitation_probability: float | None
    forecast_rainfall: float | None
    wind_speed: float | None
    wind_direction: str | None
    pressure: float | None
    soil_moisture: float | None
    soil_moisture_0_to_7cm: float | None
    hourly_rainfall: list[float] | None
    scenario: str | None
    note: str | None


class WeatherForecastResponse(DemoMetadata):
    status: str
    source: str | None
    updated_at: str | None
    location_id: str
    location_name: str
    latitude: float | None
    longitude: float | None
    forecast_rainfall: float | None
    precipitation_probability: float | None
    hourly_rainfall: list[float] | None
    entries: list[dict[str, str | float | None]] | None
    scenario: str | None
    note: str | None