"""
Unit tests for analytics functions in backend/app/analytics.py.
All tests use the in-memory test_db fixture (no MQTT, no HTTP).
"""
import pytest
from datetime import datetime, timedelta

from backend.app.models import SlotState, Event, ParkingSession
from backend.app import analytics


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _add_slot_state(db, slot_id: int, occupied: bool):
    state = SlotState(
        lot_id="A",
        slot_id=slot_id,
        occupied=occupied,
        distance_cm=15.0 if occupied else 250.0,
        rssi=-60,
        ts=datetime.utcnow(),
        seq=slot_id,
    )
    db.add(state)
    db.commit()
    db.refresh(state)
    return state


def _add_event(db, slot_id: int, occupied: bool, ts: datetime, seq: int = 0):
    ev = Event(
        lot_id="A",
        slot_id=slot_id,
        occupied=occupied,
        distance_cm=15.0 if occupied else 250.0,
        rssi=-60,
        ts=ts,
        seq=seq,
    )
    db.add(ev)
    db.commit()
    return ev


def _add_session(db, slot_id: int, duration_seconds: float, start: datetime = None):
    start = start or datetime.utcnow()
    end = start + timedelta(seconds=duration_seconds)
    s = ParkingSession(
        lot_id="A",
        slot_id=slot_id,
        start_ts=start,
        end_ts=end,
        duration_seconds=duration_seconds,
    )
    db.add(s)
    db.commit()
    return s


# ---------------------------------------------------------------------------
# Occupancy tests
# ---------------------------------------------------------------------------

def test_get_current_occupancy_empty(test_db):
    """With no slot states in the DB, occupancy_pct must be 0."""
    result = analytics.get_current_occupancy(test_db)
    assert result["occupancy_pct"] == 0
    assert result["occupied"] == 0


def test_get_current_occupancy_half(test_db):
    """2 occupied out of 4 slots → occupancy_pct == 50.0."""
    for slot_id, occ in [(1, True), (2, True), (3, False), (4, False)]:
        _add_slot_state(test_db, slot_id, occ)

    result = analytics.get_current_occupancy(test_db)
    assert result["total_slots"] == 4
    assert result["occupied"] == 2
    assert result["occupancy_pct"] == pytest.approx(50.0)


# ---------------------------------------------------------------------------
# Hourly stats
# ---------------------------------------------------------------------------

def test_hourly_stats_shape(test_db, sample_events):
    """get_hourly_stats should return exactly 24 entries (one per hour 0-23)."""
    result = analytics.get_hourly_stats(test_db)
    assert len(result) == 24
    hours = [entry["hour"] for entry in result]
    assert hours == list(range(24))


# ---------------------------------------------------------------------------
# Session stats
# ---------------------------------------------------------------------------

def test_session_stats_duration(test_db):
    """Given known sessions, avg_duration_seconds must match the hand-calculated average."""
    durations = [300.0, 600.0, 900.0]  # avg = 600
    for i, d in enumerate(durations, start=1):
        _add_session(test_db, slot_id=i, duration_seconds=d)

    result = analytics.get_session_stats(test_db)
    assert result["avg_duration_seconds"] == pytest.approx(600.0, rel=1e-3)
    assert result["total_sessions"] == 3


# ---------------------------------------------------------------------------
# Slot utilization ranking
# ---------------------------------------------------------------------------

def test_slot_utilization_ranking(test_db):
    """Slots should be ranked by utilization (most-occupied first)."""
    base = datetime(2024, 6, 1, 0, 0, 0)
    # slot 1: 10 events (5 occupied), slot 2: 2 events (1 occupied)
    for i in range(10):
        _add_event(test_db, slot_id=1, occupied=(i % 2 == 0),
                   ts=base + timedelta(minutes=i * 10), seq=i)
    for i in range(2):
        _add_event(test_db, slot_id=2, occupied=(i % 2 == 0),
                   ts=base + timedelta(minutes=i * 60), seq=100 + i)

    ranking = analytics.get_slot_utilization_ranking(test_db)
    # slot 1 should appear before slot 2 (higher utilization)
    slot_ids = [r["slot_id"] for r in ranking]
    assert slot_ids.index(1) < slot_ids.index(2)


# ---------------------------------------------------------------------------
# Insights
# ---------------------------------------------------------------------------

def test_generate_insights_returns_list(test_db, sample_events, sample_sessions):
    """generate_insights() should return a list with at least one string."""
    insights = analytics.generate_insights(test_db)
    assert isinstance(insights, list)
    assert len(insights) >= 1
    assert all(isinstance(s, str) for s in insights)


# ---------------------------------------------------------------------------
# Anomaly detection
# ---------------------------------------------------------------------------

def test_anomaly_detection_long_session(test_db):
    """A session longer than 4 hours (14 400 s) must appear in the anomalies list."""
    long_dur = 4 * 3600 + 60  # 4h 1m
    _add_session(test_db, slot_id=1, duration_seconds=long_dur)

    anomalies = analytics.detect_anomalies(test_db)
    assert any(a["slot_id"] == 1 for a in anomalies), (
        "Session > 4 h on slot 1 not flagged as anomaly"
    )
