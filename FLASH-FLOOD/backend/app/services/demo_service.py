"""Deterministic Phase 3 demo adapter. It makes no network calls and performs no ML."""
from fastapi import HTTPException


LOCATIONS = [
    {"id": "dehradun", "name": "Dehradun", "district": "Dehradun", "state": "Uttarakhand", "latitude": 30.3165, "longitude": 78.0322, "elevation": 640, "status": "DEMO"},
    {"id": "mussoorie", "name": "Mussoorie", "district": "Dehradun", "state": "Uttarakhand", "latitude": 30.4598, "longitude": 78.0644, "elevation": 2005, "status": "DEMO"},
    {"id": "rishikesh", "name": "Rishikesh", "district": "Dehradun", "state": "Uttarakhand", "latitude": 30.0869, "longitude": 78.2676, "elevation": 372, "status": "DEMO"},
    {"id": "joshimath", "name": "Joshimath", "district": "Chamoli", "state": "Uttarakhand", "latitude": 30.555, "longitude": 79.565, "elevation": 1890, "status": "DEMO"},
    {"id": "chamoli", "name": "Chamoli", "district": "Chamoli", "state": "Uttarakhand", "latitude": 30.404, "longitude": 79.324, "elevation": 1300, "status": "DEMO"},
    {"id": "srinagar", "name": "Srinagar", "district": "Pauri Garhwal", "state": "Uttarakhand", "latitude": 30.222, "longitude": 78.783, "elevation": 560, "status": "DEMO"},
    {"id": "rudraprayag", "name": "Rudraprayag", "district": "Rudraprayag", "state": "Uttarakhand", "latitude": 30.284, "longitude": 78.982, "elevation": 895, "status": "DEMO"},
    {"id": "uttarkashi", "name": "Uttarkashi", "district": "Uttarkashi", "state": "Uttarakhand", "latitude": 30.729, "longitude": 78.444, "elevation": 1158, "status": "DEMO"},
    {"id": "nainital", "name": "Nainital", "district": "Nainital", "state": "Uttarakhand", "latitude": 29.3919, "longitude": 79.4542, "elevation": 2084, "status": "DEMO"},
]

SCENARIOS = {
    "normal": {"label": "Normal", "probability": 18, "risk_level": "LOW", "factors": ["Light rainfall", "Stable soil condition"], "action": "Continue to monitor official weather and local authority updates.", "weather": [24, 68, 6, 6, 18, 25, 42, 12, 35, 8, "NW", 1011, [1, 2, 3, 6, 5, 4, 2, 1]]},
    "heavy_rain": {"label": "Heavy Rain", "probability": 51, "risk_level": "MODERATE", "factors": ["Sustained rainfall", "Heavy forecast rainfall", "Steep terrain"], "action": "Avoid riverbanks where possible and monitor official weather updates.", "weather": [21, 82, 38, 38, 94, 112, 146, 54, 72, 18, "SW", 1004, [12, 18, 28, 38, 31, 24, 18, 12]]},
    "extreme_rain": {"label": "Extreme Rain", "probability": 74, "risk_level": "HIGH", "factors": ["Extreme rainfall", "High soil moisture", "Close to river"], "action": "Avoid low-lying areas and river channels. Follow official local guidance.", "weather": [19, 90, 68, 68, 142, 205, 276, 96, 90, 27, "S", 997, [22, 34, 45, 68, 64, 58, 47, 32]]},
    "critical_flood": {"label": "Critical Flood", "probability": 87, "risk_level": "CRITICAL", "factors": ["Extreme rainfall", "Saturated soil", "Steep terrain", "Close to river"], "action": "Avoid low-lying areas and river channels. Follow official emergency instructions immediately.", "weather": [18, 96, 82, 82, 160, 248, 318, 118, 98, 34, "SSE", 991, [35, 48, 64, 82, 78, 73, 62, 48]]},
}


def metadata() -> dict:
    return {"data_status": "DEMO", "is_simulated": True, "timestamp": "Simulation update · 09:30 IST", "disclaimer": "Deterministic demo data only; not live, official, or ML-generated."}


def arbitrary_metadata() -> dict:
    return {
        "data_status": "DEMO_UNAVAILABLE",
        "is_simulated": True,
        "timestamp": "No real-time data",
        "disclaimer": "No real environmental data available for arbitrary coordinates. Demo scenario values only.",
    }


def find_location(location_id: str) -> dict | None:
    return next((loc for loc in LOCATIONS if loc["id"] == location_id), None)


def is_predefined_location(location_id: str) -> bool:
    return find_location(location_id) is not None


def get_location(location_id: str) -> dict:
    location = find_location(location_id)
    if location is None:
        raise HTTPException(status_code=404, detail=f"Unknown demo location: {location_id}")
    return location


def normalize_scenario(scenario: str) -> str:
    return scenario.replace("-", "_")


def get_scenario(scenario: str) -> dict:
    key = normalize_scenario(scenario)
    if key not in SCENARIOS:
        raise HTTPException(status_code=422, detail=f"Unsupported demo scenario: {scenario}")
    return SCENARIOS[key]


def weather_fields(scenario: str) -> dict:
    values = get_scenario(scenario)["weather"]
    keys = ["temperature", "humidity", "current_rainfall", "rainfall_1h", "rainfall_3h", "rainfall_6h", "rainfall_24h", "forecast_rainfall", "precipitation_probability", "wind_speed", "wind_direction", "pressure", "hourly_rainfall"]
    return dict(zip(keys, values, strict=True))


def risk_assessment(location_id: str, scenario: str) -> dict:
    location = get_location(location_id)
    key = normalize_scenario(scenario)
    fixture = get_scenario(key)
    weather = weather_fields(key)
    slope = 18 if location_id == "rishikesh" else 29 if location_id == "nainital" else 34
    terrain = {"elevation": location["elevation"], "slope": slope, "aspect": "South-east", "soil_moisture": min(96, weather["humidity"] - 5), "river_distance": 280 if location_id == "rishikesh" else 400, "drainage": "Stable" if key == "normal" else "Rapid runoff watch", "historical": "Seasonal exposure" if location_id == "dehradun" else "Historical context pending", "exposure": "Elevated" if fixture["risk_level"] == "CRITICAL" else "Monitoring"}
    return metadata() | {"location_id": location_id, "scenario": key, "scenario_label": fixture["label"], "probability": fixture["probability"], "risk_level": fixture["risk_level"], "factors": fixture["factors"], "warning": f"{fixture['risk_level']} flood risk — simulation", "recommended_action": fixture["action"], "terrain": terrain, "weather": weather, "model_status": "Not connected — demo scenario logic only"}


def arbitrary_location_id(latitude: float, longitude: float) -> str:
    return f"arbitrary-{latitude}-{longitude}"


def arbitrary_risk_assessment(latitude: float, longitude: float, scenario: str) -> dict:
    key = normalize_scenario(scenario)
    fixture = get_scenario(key)
    weather = weather_fields(key)
    terrain = {
        "elevation": None,
        "slope": None,
        "aspect": "Unavailable",
        "soil_moisture": None,
        "river_distance": None,
        "drainage": "Unavailable",
        "historical": "Unavailable",
        "exposure": "Unavailable",
    }
    return arbitrary_metadata() | {
        "location_id": arbitrary_location_id(latitude, longitude),
        "scenario": key,
        "scenario_label": fixture["label"],
        "probability": fixture["probability"],
        "risk_level": fixture["risk_level"],
        "factors": fixture["factors"],
        "warning": f"{fixture['risk_level']} flood risk — simulation for coordinates {latitude}, {longitude}",
        "recommended_action": fixture["action"],
        "terrain": terrain,
        "weather": weather,
        "model_status": "Not connected — demo scenario logic only",
    }


def safe_places(location_id: str) -> list[dict]:
    location = get_location(location_id)
    return [
        {"id": f"{location_id}-relief", "name": f"{location['name']} Community Relief Centre", "category": "Relief centre", "distance_km": 2.1, "elevation_m": location["elevation"] + 350, "status": "Available", "accessibility": "Illustrative access status", "latitude": location["latitude"] + .018, "longitude": location["longitude"] + .014, "data_status": "DEMO"},
        {"id": f"{location_id}-school", "name": f"{location['name']} Assembly School", "category": "Designated shelter", "distance_km": 3.4, "elevation_m": location["elevation"] + 190, "status": "Monitor access", "accessibility": "Verify with authorities", "latitude": location["latitude"] - .012, "longitude": location["longitude"] + .021, "data_status": "DEMO"},
        {"id": f"{location_id}-hall", "name": f"{location['name']} Community Hall", "category": "Emergency assembly point", "distance_km": 4.2, "elevation_m": location["elevation"] + 270, "status": "Available", "accessibility": "Illustrative access status", "latitude": location["latitude"] + .027, "longitude": location["longitude"] - .017, "data_status": "DEMO"},
    ]


def seismic(location_id: str) -> dict:
    location = get_location(location_id)
    return metadata() | {"location_id": location_id, "event_id": "seismic-demo-1", "magnitude": 4.8, "depth_km": 12, "distance_km": 48, "event_time": "Simulation record · 08:45 IST", "latitude": location["latitude"] + .23, "longitude": location["longitude"] + .18, "seismic_status": "MONITORING", "note": "Illustrative event for secondary-hazard awareness.", "earthquake_prediction_provided": False, "secondary_hazards": [{"name": "Landslide", "status": "ELEVATED"}, {"name": "Rockfall", "status": "MONITORING"}, {"name": "River blockage", "status": "MONITORING"}, {"name": "Infrastructure disruption", "status": "DATA UNAVAILABLE"}, {"name": "Road blockage", "status": "DEMO ALERT"}]}


def alerts(location_id: str, scenario: str = "critical_flood") -> list[dict]:
    location = get_location(location_id)
    key = normalize_scenario(scenario)
    fixture = get_scenario(key)
    severity = {"LOW": "INFO", "MODERATE": "WATCH", "HIGH": "HIGH", "CRITICAL": "CRITICAL"}[fixture["risk_level"]]
    return [{"id": "risk", "severity": severity, "title": f"Flood risk {'status' if fixture['risk_level'] == 'LOW' else 'increased'}", "time": "Simulation update · 09:30 IST", "location": location["name"], "reason": " + ".join(fixture["factors"]), "recommended_action": fixture["action"], "data_status": "DEMO"}, {"id": "terrain", "severity": "WATCH", "title": "Terrain and runoff watch", "time": "Simulation update · 09:30 IST", "location": location["name"], "reason": "Terrain indicators are illustrative demo values.", "recommended_action": "Review the terrain and map panels for context.", "data_status": "DEMO"}]


def evacuation(location_id: str, destination_id: str, scenario: str) -> dict:
    location = get_location(location_id)
    places = safe_places(location_id)
    destination = next((place for place in places if place["id"] == destination_id), None)
    if destination is None:
        raise HTTPException(status_code=404, detail=f"Unknown demo destination: {destination_id}")
    get_scenario(scenario)
    return metadata() | {"route_id": "demo-route", "destination_id": destination_id, "route_status": "Illustrative route", "distance_km": destination["distance_km"], "destination_elevation_m": destination["elevation_m"], "hazard_warning": "Suggested lower-risk route based on available demo data; not guaranteed safe.", "recommendation": "Higher elevation and demonstration hazard avoidance.", "coordinates": [[location["latitude"], location["longitude"]], [location["latitude"] + .006, location["longitude"] + .005], [destination["latitude"], destination["longitude"]]], "illustrative": True}
