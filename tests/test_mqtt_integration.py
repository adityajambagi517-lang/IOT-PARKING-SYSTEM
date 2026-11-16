"""
Unit & regression tests for MQTT message parsing, device status handling, and sequence handling.
"""

from datetime import datetime, timedelta, timezone
import json
import pytest
from backend.app.models import DeviceStatus, SlotState, Event, ParkingSession
from backend.app.schemas import SlotPayload
from backend.app.mqtt_client import _upsert_device_status, _handle_slot_state, _on_message
from backend.app.config import settings


def test_upsert_device_status_online_and_offline(test_db):
    """Test device status upsert and update."""
    _upsert_device_status(test_db, "A", "online")
    dev = test_db.query(DeviceStatus).filter(DeviceStatus.lot_id == "A").first()
    assert dev is not None
    assert dev.status == "online"

    # Update to offline
    _upsert_device_status(test_db, "A", "offline")
    test_db.refresh(dev)
    assert dev.status == "offline"


def test_slot_payload_validation():
    """Verify valid slot state payload schema."""
    data = {
        "lot": "A",
        "slot": 1,
        "occupied": True,
        "distance_cm": 12.5,
        "ts": "2026-11-16T10:00:00Z",
        "seq": 42,
        "rssi": -65,
    }
    payload = SlotPayload(**data)
    assert payload.slot == 1
    assert payload.occupied is True
    assert payload.distance_cm == 12.5
    assert payload.seq == 42
    assert payload.rssi == -65


def test_slot_state_transition_and_session(test_db):
    """Test slot transition from free to occupied creates a session, and freeing closes it."""
    # 1. Slot starts free
    p1 = {
        "lot": "A",
        "slot": 2,
        "occupied": False,
        "distance_cm": 150.0,
        "ts": "2026-11-16T10:00:00Z",
        "seq": 1,
        "rssi": -60,
    }
    _handle_slot_state(test_db, p1, "parking/A/slot/2/state")
    slot = test_db.query(SlotState).filter(SlotState.lot_id == "A", SlotState.slot_id == 2).first()
    assert slot.occupied is False

    open_sess = test_db.query(ParkingSession).filter(ParkingSession.slot_id == 2, ParkingSession.end_ts.is_(None)).first()
    assert open_sess is None

    # 2. Vehicle arrives: Occupied
    p2 = {
        "lot": "A",
        "slot": 2,
        "occupied": True,
        "distance_cm": 15.0,
        "ts": "2026-11-16T10:05:00Z",
        "seq": 2,
        "rssi": -60,
    }
    _handle_slot_state(test_db, p2, "parking/A/slot/2/state")
    test_db.refresh(slot)
    assert slot.occupied is True

    open_sess = test_db.query(ParkingSession).filter(ParkingSession.slot_id == 2, ParkingSession.end_ts.is_(None)).first()
    assert open_sess is not None
    assert open_sess.start_ts is not None

    # 3. Vehicle leaves: Free
    p3 = {
        "lot": "A",
        "slot": 2,
        "occupied": False,
        "distance_cm": 160.0,
        "ts": "2026-11-16T10:35:00Z",
        "seq": 3,
        "rssi": -60,
    }
    _handle_slot_state(test_db, p3, "parking/A/slot/2/state")
    test_db.refresh(slot)
    assert slot.occupied is False

    test_db.refresh(open_sess)
    assert open_sess.end_ts is not None
    assert open_sess.duration_seconds is not None
    assert open_sess.duration_seconds > 0
