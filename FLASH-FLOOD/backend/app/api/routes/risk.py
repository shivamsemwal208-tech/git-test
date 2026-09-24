from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from backend.app.risk_engine import features, predictor
from backend.app.schemas.risk import RiskAssessmentRequest, RiskAssessmentResponse
from backend.app.services import weather_service
from backend.app.services.demo_service import (
    arbitrary_location_id,
    arbitrary_risk_assessment,
    find_location,
    risk_assessment,
)

router = APIRouter(prefix="/api/v1/risk", tags=["Risk"])

_ML_WEATHER_KEYS = (
    "temperature", "humidity", "current_rainfall",
    "rainfall_1h", "rainfall_3h", "rainfall_6h", "rainfall_24h",
    "rainfall_72h", "rainfall_7d", "antecedent_rainfall_7d",
    "precipitation_probability", "forecast_rainfall", "wind_speed",
    "wind_direction", "pressure", "soil_moisture", "soil_moisture_0_to_7cm",
    "hourly_rainfall",
)

_ML_ACTIONS = {
    "LOW": (
        "No elevated risk indicated by the baseline. Continue to monitor "
        "official weather and local authority updates."
    ),
    "MODERATE": (
        "Elevated risk indicated by the baseline. Avoid riverbanks where "
        "possible and monitor official weather updates; this is an estimate, "
        "not a guarantee."
    ),
    "HIGH": (
        "High risk indicated by the baseline. Avoid low-lying areas and river "
        "channels. Follow official local guidance; treat this estimate as "
        "advisory only."
    ),
    "CRITICAL": (
        "Critical risk indicated by the baseline. Avoid low-lying areas and "
        "river channels. Follow official emergency instructions immediately; "
        "this is an estimate, not a guarantee."
    ),
}


def _ml_factor_strings(result: dict) -> list[str]:
    """Human-readable factor lines for the compatibility 'factors' field."""
    lines = []
    for factor in result.get("contributing_factors", []):
        feature = factor.get("feature")
        value = factor.get("value")
        unit = factor.get("unit")
        importance = factor.get("importance")
        parts = []
        if feature is not None:
            parts.append(feature)
        if value is not None:
            parts.append(f"{value}{(' ' + str(unit)) if unit else ''}")
        if importance is not None:
            parts.append(f"importance {importance}")
        if parts:
            lines.append(" = ".join([parts[0], ", ".join(parts[1:])]))
    return lines


def _ml_risk_assessment(
    latitude: float,
    longitude: float,
    scenario: str,
    *,
    location_id: str | None = None,
    location_name: str | None = None,
) -> dict:
    """Live ML risk assessment for the resolved coordinates.

    Builds the model input through the canonical feature engine
    (``features.live_components`` -> ``build_features``), predicts with the
    calibrated Random Forest baseline, and returns an honest result: either a
    real LIVE prediction or an explicit UNAVAILABLE result. Demo/scenario
    probability is never substituted.

    Used for predefined demo locations (resolved to the fixture coordinates,
    keeping the fixture id/name) and arbitrary coordinates alike, so both go
    through the exact same live pipeline whenever real data is available.
    """
    if location_id is None:
        location_id = arbitrary_location_id(latitude, longitude)
    location_label = (
        location_name.strip()
        if location_name and location_name.strip()
        else f"{latitude:g}, {longitude:g}"
    )
    current = weather_service.current_weather(
        latitude,
        longitude,
        location_id,
        location_label,
        scenario,
    )
    components = features.live_components(latitude, longitude)
    vector = features.build_features(components)
    result = predictor.predict(vector)

    elevation = components.get("elevation")
    slope = components.get("slope_degrees")
    aspect = components.get("aspect_degrees")
    river_distance = components.get("river_distance_m")
    terrain = {
        "elevation": None if elevation is None else int(round(elevation)),
        "slope": None if slope is None else round(float(slope), 1),
        "aspect": None if aspect is None else round(float(aspect), 1),
        "soil_moisture": current.get("soil_moisture"),
        "river_distance": (
            None if river_distance is None else int(round(river_distance))
        ),
        "drainage": "Unavailable",
        "historical": "Unavailable",
        "exposure": "Unavailable",
    }
    weather = {key: current.get(key) for key in _ML_WEATHER_KEYS}

    base = {
        "location_id": location_id,
        "scenario": scenario,
        "terrain": terrain,
        "weather": weather,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data_status": "LIVE",
        "is_simulated": False,
    }

    if result["status"] == "PREDICTION":
        level = result["risk_level"]
        return base | {
            "scenario_label": "Live ML Flood Risk Score",
            "probability": result["probability_pct"],
            "risk_level": level,
            "factors": _ml_factor_strings(result),
            "warning": f"{level} flood risk — ML baseline estimate (not official guidance).",
            "recommended_action": _ML_ACTIONS[level],
            "model_status": (
                f"Connected — {result['model']['version']} "
                f"({result['model_status']})"
            ),
            "prediction_status": result["status"],
            "reason": None,
            "missing_features": [],
            "model_version": result["model"]["version"],
            "contributing_factors": result["contributing_factors"],
            "explanation": result["explanation"],
            "disclaimer": result["disclaimer"],
        }

    detail = result.get("detail", "ML prediction unavailable.")
    version = result["model"].get("version")
    if result["model_status"] == "READY" and version:
        model_status = f"Connected — {version} ({result['model_status']})"
    else:
        model_status = "Model not loaded — ML prediction unavailable"
    return base | {
        "scenario_label": "Live ML Flood Risk Score unavailable",
        "probability": None,
        "risk_level": None,
        "factors": [],
        "warning": f"Flood risk unavailable — {detail}",
        "recommended_action": (
            "Rely on official warnings; this endpoint could not produce an ML "
            "prediction. Monitor live weather for the area."
        ),
        "model_status": model_status,
        "prediction_status": result["status"],
        "reason": result.get("reason"),
        "missing_features": result.get("missing_features", []),
        "model_version": version,
        "contributing_factors": [],
        "explanation": result.get("explanation", detail),
        "disclaimer": (
            "Live request produced no ML prediction; no demo/scenario "
            "probability was substituted."
        ),
    }


@router.post("/assess", response_model=RiskAssessmentResponse)
def assess_risk(request: RiskAssessmentRequest):
    """Risk assessment for any location id or coordinate pair.

    Default (``simulate=false``): the live ML pipeline is used for predefined
    demo locations (resolved to their own coordinates) AND arbitrary
    coordinates, returning either a real LIVE prediction or an honest
    UNAVAILABLE result. Deterministic demo/scenario data is produced ONLY for
    an explicit simulation/demo scenario (``simulate=true``).
    """
    location = find_location(request.location_id)

    if request.simulate:
        # Explicit simulation/demo scenario: deterministic fixture data.
        if location is not None:
            return risk_assessment(
                location_id=request.location_id,
                scenario=request.scenario,
            )
        if request.latitude is None or request.longitude is None:
            raise HTTPException(
                status_code=404,
                detail=f"Unknown demo location: {request.location_id}",
            )
        return arbitrary_risk_assessment(
            latitude=request.latitude,
            longitude=request.longitude,
            scenario=request.scenario,
        )

    if location is not None:
        return _ml_risk_assessment(
            latitude=location["latitude"],
            longitude=location["longitude"],
            scenario=request.scenario,
            location_id=location["id"],
            location_name=location["name"],
        )

    if request.latitude is None or request.longitude is None:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown demo location: {request.location_id}",
        )
    return _ml_risk_assessment(
        latitude=request.latitude,
        longitude=request.longitude,
        scenario=request.scenario,
        location_id=request.location_id,
        location_name=request.location_name,
    )