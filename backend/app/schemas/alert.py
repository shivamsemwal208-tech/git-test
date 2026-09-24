from typing import Literal
from pydantic import BaseModel
from .common import DemoMetadata


AlertSeverity = Literal["INFO", "WATCH", "WARNING", "HIGH", "CRITICAL"]


class Alert(BaseModel):
    id: str
    severity: AlertSeverity
    title: str
    time: str
    location: str
    reason: str
    recommended_action: str
    data_status: str = "DEMO"


class AlertsResponse(DemoMetadata):
    location_id: str
    alerts: list[Alert]
