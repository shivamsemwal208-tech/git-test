from pydantic import BaseModel, Field


class DemoMetadata(BaseModel):
    data_status: str = "DEMO"
    is_simulated: bool = True
    timestamp: str = "Simulation update · 09:30 IST"
    disclaimer: str = "Deterministic demo data only; not live, official, or ML-generated."


class ErrorDetail(BaseModel):
    detail: str
