from pydantic import BaseModel
from .common import DemoMetadata


class WeatherCurrentResponse(DemoMetadata):
    location_id: str
    temperature: int
    humidity: int
    current_rainfall: int
    rainfall_1h: int
    rainfall_3h: int
    rainfall_6h: int
    rainfall_24h: int
    precipitation_probability: int
    wind_speed: int
    wind_direction: str
    pressure: int


class WeatherForecastResponse(DemoMetadata):
    location_id: str
    forecast_rainfall: int
    precipitation_probability: int
    hourly_rainfall: list[int]
    entries: list[dict[str, str | int]]
