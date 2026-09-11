from fastapi import APIRouter, HTTPException

from backend.app.schemas.risk import RiskAssessmentRequest, RiskAssessmentResponse
from backend.app.services.demo_service import get_location, risk_assessment

router = APIRouter(prefix="/api/v1/risk", tags=["Risk"])


@router.post("/assess", response_model=RiskAssessmentResponse)
def assess_risk(request: RiskAssessmentRequest):
    location = get_location(request.location_id)

    if location is None:
        raise HTTPException(
            status_code=404,
            detail=f"Location '{request.location_id}' not found",
        )

    return risk_assessment(
        location_id=request.location_id,
        scenario=request.scenario,
    )