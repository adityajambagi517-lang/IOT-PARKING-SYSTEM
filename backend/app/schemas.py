from pydantic import BaseModel, field_validator, model_validator
from typing import Optional, Any
from datetime import datetime


# ---------------------------------------------------------------------------
# Inbound (MQTT payload)
# ---------------------------------------------------------------------------

class SlotPayload(BaseModel):
    """Validated MQTT payload for parking/{lot}/slot/{slot}/state."""
    lot: str
    slot: int
    occupied: bool
    distance_cm: float
    ts: str
    seq: int
    rssi: int

    @field_validator("distance_cm")
    @classmethod
    def validate_distance(cls, v: float) -> float:
        if not (0 <= v <= 400):
            raise ValueError(f"distance_cm must be 0–400, got {v}")
        return v

    @field_validator("slot")
    @classmethod
    def validate_slot(cls, v: int) -> int:
        if not (1 <= v <= 8):
            raise ValueError(f"slot must be 1–8, got {v}")
        return v


# ---------------------------------------------------------------------------
# Outbound (REST responses)
# ---------------------------------------------------------------------------

class SlotStateResponse(BaseModel):
    id: int
    lot_id: str
    slot_id: int
    occupied: bool
    distance_cm: Optional[float] = None
    rssi: Optional[int] = None
    ts: Optional[datetime] = None
    seq: Optional[int] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class EventResponse(BaseModel):
    id: int
    lot_id: str
    slot_id: int
    occupied: bool
    distance_cm: Optional[float] = None
    rssi: Optional[int] = None
    ts: Optional[datetime] = None
    seq: Optional[int] = None
    received_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class SessionResponse(BaseModel):
    id: int
    lot_id: str
    slot_id: int
    start_ts: datetime
    end_ts: Optional[datetime] = None
    duration_seconds: Optional[float] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class HourlyStats(BaseModel):
    hour: int                   # 0-23
    avg_occupancy_pct: float
    sample_count: int


class DailyStats(BaseModel):
    day_of_week: int            # 0=Mon, 6=Sun
    day_name: str
    avg_occupancy_pct: float
    sample_count: int


class AnalyticsSummary(BaseModel):
    total_slots: int
    occupied: int
    free: int
    occupancy_pct: float
    slot_states: list[SlotStateResponse]
    avg_duration_seconds: Optional[float] = None
    total_sessions: int = 0
    anomalies: list[dict] = []
    insights: list[str] = []


class PredictRequest(BaseModel):
    hours: int = 24


class PredictResponse(BaseModel):
    ts: str
    predicted_occupancy_pct: float
    lower: float
    upper: float


class CmdRequest(BaseModel):
    slot: Optional[int] = None
    slot_id: Optional[int] = None
    command: Optional[str] = None
    cmd: Optional[str] = None
    duration_ms: Optional[int] = 300
    color: Optional[str] = None
    state: Optional[bool] = None
    params: dict[str, Any] = {}


class HealthResponse(BaseModel):
    status: str
    db_ok: bool
    mqtt_connected: bool
    esp32_connected: bool = False
    slot_count: int
    uptime_seconds: float
    last_seen: Optional[str] = None
    last_heartbeat: Optional[str] = None
    device_timeout_seconds: Optional[int] = 60
    version: str = "1.0.0"
