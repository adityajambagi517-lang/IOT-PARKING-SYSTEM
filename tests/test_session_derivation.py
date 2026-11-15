"""
Unit tests for automatic parking session derivation from state transitions.
"""

from datetime import datetime, timedelta, timezone
import pytest
from sqlalchemy.orm import Session

from backend.app.models import ParkingSession
from backend.app.schemas import SlotPayload
from backend.app.mqtt_client import _handle_session


def _make_payload(slot: int = 1, occupied: bool = True, dt: datetime = None) -> SlotPayload:
    if dt is None:
        dt = datetime(2024, 6, 1, 10, 0, 0)
    return SlotPayload(
        lot="A",
        slot=slot,
        occupied=occupied,
        distance_cm=15.0 if occupied else 150.0,
        ts=dt.isoformat(),
        seq=1,
        rssi=-60,
    )


def test_session_opens_on_occupied(test_db: Session):
    """When slot transitions from free (previous_occupied=False) to occupied, open a session."""
    p = _make_payload(slot=1, occupied=True)
    _handle_session(test_db, p, previous_occupied=False)

    sessions = test_db.query(ParkingSession).filter(ParkingSession.slot_id == 1).all()
    assert len(sessions) == 1
    assert sessions[0].end_ts is None
    assert sessions[0].duration_seconds is None


def test_session_closes_on_free(test_db: Session):
    """When slot transitions from occupied to free, close the active session and compute duration."""
    start_time = datetime(2024, 6, 1, 10, 0, 0)
    end_time = datetime(2024, 6, 1, 10, 45, 0)

    # 1. Slot becomes occupied
    p1 = _make_payload(slot=1, occupied=True, dt=start_time)
    _handle_session(test_db, p1, previous_occupied=False)

    # 2. Slot becomes free after 45 minutes
    p2 = _make_payload(slot=1, occupied=False, dt=end_time)
    _handle_session(test_db, p2, previous_occupied=True)

    sessions = test_db.query(ParkingSession).filter(ParkingSession.slot_id == 1).all()
    assert len(sessions) == 1
    assert sessions[0].end_ts is not None
    assert sessions[0].duration_seconds == pytest.approx(45 * 60, abs=2.0)


def test_duplicate_state_no_new_session(test_db: Session):
    """Heartbeats or duplicate state messages (occupied->occupied) must not spawn extra sessions."""
    p1 = _make_payload(slot=1, occupied=True)
    _handle_session(test_db, p1, previous_occupied=False)

    # Duplicate message with previous_occupied=True
    p2 = _make_payload(slot=1, occupied=True)
    _handle_session(test_db, p2, previous_occupied=True)

    sessions = test_db.query(ParkingSession).filter(ParkingSession.slot_id == 1).all()
    assert len(sessions) == 1


def test_multiple_slots_independent(test_db: Session):
    """Sessions on different slots must be tracked independently."""
    t0 = datetime(2024, 6, 1, 9, 0, 0)
    t1 = datetime(2024, 6, 1, 9, 30, 0)

    # Slot 1 occupied
    _handle_session(test_db, _make_payload(slot=1, occupied=True, dt=t0), previous_occupied=False)
    # Slot 2 occupied
    _handle_session(test_db, _make_payload(slot=2, occupied=True, dt=t0), previous_occupied=False)
    # Slot 1 freed
    _handle_session(test_db, _make_payload(slot=1, occupied=False, dt=t1), previous_occupied=True)

    s1 = test_db.query(ParkingSession).filter(ParkingSession.slot_id == 1).first()
    s2 = test_db.query(ParkingSession).filter(ParkingSession.slot_id == 2).first()

    assert s1.end_ts is not None
    assert s1.duration_seconds == pytest.approx(1800, abs=2.0)
    assert s2.end_ts is None  # Slot 2 is still occupied

