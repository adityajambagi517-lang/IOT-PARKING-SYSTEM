"""
Shared pytest fixtures for the Smart Parking test suite.
"""
import sys
import os
os.environ["TESTING"] = "1"
from datetime import datetime, timedelta, timezone
import pytest

# Ensure the project root is on sys.path so `backend` package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from backend.app.db import Base
from backend.app import models
from backend.app.models import SlotState, Event, ParkingSession


# ---------------------------------------------------------------------------
# Database fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="function")
def test_db():
    """In-memory SQLite session; all tables created fresh, torn down after."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture(scope="function")
def sample_events(test_db):
    """Insert 50 synthetic events across multiple slots spread over 24 hours."""
    db = test_db
    base_time = datetime(2024, 6, 1, 0, 0, 0)
    slots = [1, 2, 3, 4]
    events = []
    for i in range(50):
        slot_id = slots[i % len(slots)]
        # Alternate occupied/free; first event for each slot starts occupied
        occupied = (i // len(slots)) % 2 == 0
        ts = base_time + timedelta(minutes=i * 28)  # spread ~28 min apart → ~23h coverage
        event = Event(
            lot_id="A",
            slot_id=slot_id,
            occupied=occupied,
            distance_cm=15.0 if occupied else 250.0,
            rssi=-60,
            ts=ts,
            seq=i,
        )
        db.add(event)
        events.append(event)
    db.commit()
    return events


@pytest.fixture(scope="function")
def sample_sessions(test_db):
    """Insert 10 parking sessions with realistic (varied) durations."""
    db = test_db
    sessions = []
    base = datetime(2024, 6, 1, 8, 0, 0)
    durations = [300, 600, 1200, 1800, 3600, 7200, 900, 450, 14400, 120]  # seconds
    for i, dur in enumerate(durations):
        slot_id = (i % 4) + 1
        start = base + timedelta(hours=i)
        end = start + timedelta(seconds=dur)
        session = ParkingSession(
            lot_id="A",
            slot_id=slot_id,
            start_ts=start,
            end_ts=end,
            duration_seconds=float(dur),
        )
        db.add(session)
        sessions.append(session)
    db.commit()
    return sessions


# ---------------------------------------------------------------------------
# API client fixture
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def client():
    """TestClient wrapping the FastAPI app with a test in-memory database."""
    # Override DB before importing app so the app uses the test DB
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    from backend.app import main as app_module
    from backend.app.db import get_db

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app_module.app.dependency_overrides[get_db] = override_get_db

    with TestClient(app_module.app) as c:
        yield c

    app_module.app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


# ---------------------------------------------------------------------------
# MQTT payload fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mqtt_payload_valid():
    """A fully valid SlotPayload dict."""
    return {
        "lot": "A",
        "slot": 1,
        "occupied": True,
        "distance_cm": 12.5,
        "ts": "2024-06-01T10:00:00Z",
        "seq": 42,
        "rssi": -65,
    }


@pytest.fixture
def mqtt_payload_invalid_distance():
    """SlotPayload dict with distance_cm=999 (exceeds 400 cm limit)."""
    return {
        "lot": "A",
        "slot": 1,
        "occupied": True,
        "distance_cm": 999,
        "ts": "2024-06-01T10:00:00Z",
        "seq": 1,
        "rssi": -65,
    }
