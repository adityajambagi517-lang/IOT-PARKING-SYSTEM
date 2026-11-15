"""
Unit tests for MQTT payload validation (SlotPayload schema).
"""
import pytest
from pydantic import ValidationError

from backend.app.schemas import SlotPayload


VALID_PAYLOAD = {
    "lot": "A",
    "slot": 1,
    "occupied": True,
    "distance_cm": 12.5,
    "ts": "2024-06-01T10:00:00Z",
    "seq": 42,
    "rssi": -65,
}


def _make(**overrides):
    data = dict(VALID_PAYLOAD)
    data.update(overrides)
    return data


# ---------------------------------------------------------------------------
# Happy-path tests
# ---------------------------------------------------------------------------

def test_valid_payload():
    """A fully valid dict should construct SlotPayload without error."""
    p = SlotPayload(**VALID_PAYLOAD)
    assert p.slot == 1
    assert p.occupied is True
    assert p.distance_cm == 12.5


def test_slot_boundary_values():
    """slot=1 and slot=8 are the allowed extremes; slot=9 must fail."""
    p1 = SlotPayload(**_make(slot=1))
    p8 = SlotPayload(**_make(slot=8))
    assert p1.slot == 1
    assert p8.slot == 8

    with pytest.raises(ValidationError):
        SlotPayload(**_make(slot=9))


def test_timestamp_format():
    """Valid ISO 8601 timestamps (with and without Z) should be accepted."""
    p_z = SlotPayload(**_make(ts="2024-06-01T10:00:00Z"))
    assert p_z.ts == "2024-06-01T10:00:00Z"

    p_offset = SlotPayload(**_make(ts="2024-06-01T10:00:00+05:30"))
    assert "+05:30" in p_offset.ts


# ---------------------------------------------------------------------------
# Validation-failure tests
# ---------------------------------------------------------------------------

def test_invalid_distance_too_high():
    """distance_cm=999 exceeds the 0–400 cm constraint → ValidationError."""
    with pytest.raises(ValidationError) as exc_info:
        SlotPayload(**_make(distance_cm=999))
    assert "distance_cm" in str(exc_info.value).lower() or "400" in str(exc_info.value)


def test_invalid_slot_zero():
    """slot=0 is below the minimum of 1 → ValidationError."""
    with pytest.raises(ValidationError):
        SlotPayload(**_make(slot=0))


def test_missing_required_field():
    """Omitting the 'occupied' field → ValidationError."""
    data = dict(VALID_PAYLOAD)
    del data["occupied"]
    with pytest.raises(ValidationError) as exc_info:
        SlotPayload(**data)
    assert "occupied" in str(exc_info.value)


def test_negative_distance():
    """distance_cm=-1 is below the minimum of 0 → ValidationError."""
    with pytest.raises(ValidationError):
        SlotPayload(**_make(distance_cm=-1))
