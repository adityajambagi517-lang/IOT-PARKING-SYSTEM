"""
Seed script: generates 30 days of realistic synthetic parking history.
Generates events, sessions, and initial slot states.
Run from project root:
    python backend/scripts/seed_data.py
"""

import os
import sys
import random
import math
from datetime import datetime, timedelta, timezone

# Add project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, PROJECT_ROOT)

from sqlalchemy import text
from backend.app.config import settings
from backend.app.db import engine, SessionLocal, Base, init_db
from backend.app.models import Event, ParkingSession, SlotState, DeviceStatus

LOT_ID = settings.lot_id
NUM_SLOTS = settings.num_slots
DAYS = 30
MEAN_DURATION_MIN = 45
STD_DURATION_MIN = 20
MIN_DURATION_MIN = 5
MAX_DURATION_MIN = 180

OCCUPIED_DISTANCE_CM = 14.0
FREE_DISTANCE_CM = 160.0

WEEKDAY_PEAKS = [
    (8, 10, 0.85),   # morning rush: 85% occupancy prob
    (12, 14, 0.65),  # lunch: 65%
    (17, 19, 0.90),  # evening rush: 90%
]

WEEKEND_PEAKS = [
    (13, 17, 0.55),  # afternoon shopping: 55%
]


def sample_duration_sec() -> float:
    mins = random.gauss(MEAN_DURATION_MIN, STD_DURATION_MIN)
    mins = max(MIN_DURATION_MIN, min(MAX_DURATION_MIN, mins))
    return mins * 60.0


def run_seed():
    init_db()
    db = SessionLocal()

    # Check if already seeded
    try:
        count = db.query(Event).filter(Event.lot_id == LOT_ID).count()
        if count >= 100:
            print(f"[SEED] Database already has {count} events. Skipping seed.")
            db.close()
            return
    except Exception as e:
        print(f"[SEED] Table check: {e}")

    print(f"[SEED] Generating {DAYS} days of realistic parking data for Lot {LOT_ID} ({NUM_SLOTS} slots)...")

    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    start_date = (now_utc - timedelta(days=DAYS)).replace(hour=0, minute=0, second=0, microsecond=0)

    total_events = 0
    total_sessions = 0
    seq_counter = 1

    # Record device status
    dev = db.query(DeviceStatus).filter(DeviceStatus.lot_id == LOT_ID).first()
    if not dev:
        dev = DeviceStatus(lot_id=LOT_ID, status="online", ts=now_utc)
        db.add(dev)
    else:
        dev.status = "online"
        dev.ts = now_utc
    db.commit()

    for day_idx in range(DAYS):
        day_date = start_date + timedelta(days=day_idx)
        is_weekend = day_date.weekday() >= 5
        peaks = WEEKEND_PEAKS if is_weekend else WEEKDAY_PEAKS

        for slot_id in range(1, NUM_SLOTS + 1):
            for start_h, end_h, peak_prob in peaks:
                # Decide if this slot receives an arrival during this peak
                if random.random() < peak_prob:
                    arrival_offset_sec = random.randint(0, (end_h - start_h) * 3600 - 600)
                    arrival_time = day_date.replace(hour=start_h, minute=0, second=0) + timedelta(seconds=arrival_offset_sec)
                    dur_sec = sample_duration_sec()
                    departure_time = arrival_time + timedelta(seconds=dur_sec)

                    if arrival_time > now_utc:
                        continue

                    # 1. Arrival Event
                    e_arr = Event(
                        lot_id=LOT_ID,
                        slot_id=slot_id,
                        occupied=True,
                        distance_cm=round(OCCUPIED_DISTANCE_CM + random.uniform(-3.0, 3.0), 1),
                        rssi=random.randint(-70, -50),
                        ts=arrival_time,
                        seq=seq_counter,
                        received_at=arrival_time,
                    )
                    db.add(e_arr)
                    seq_counter += 1
                    total_events += 1

                    # 2. Session
                    is_closed = departure_time <= now_utc
                    session = ParkingSession(
                        lot_id=LOT_ID,
                        slot_id=slot_id,
                        start_ts=arrival_time,
                        end_ts=departure_time if is_closed else None,
                        duration_seconds=dur_sec if is_closed else None,
                        created_at=arrival_time,
                    )
                    db.add(session)
                    total_sessions += 1

                    # 3. Departure Event (if finished before now)
                    if is_closed:
                        e_dep = Event(
                            lot_id=LOT_ID,
                            slot_id=slot_id,
                            occupied=False,
                            distance_cm=round(FREE_DISTANCE_CM + random.uniform(-10.0, 10.0), 1),
                            rssi=random.randint(-70, -50),
                            ts=departure_time,
                            seq=seq_counter,
                            received_at=departure_time,
                        )
                        db.add(e_dep)
                        seq_counter += 1
                        total_events += 1

        db.commit()

    # Populate final SlotState table based on current active sessions
    for slot_id in range(1, NUM_SLOTS + 1):
        open_sess = (
            db.query(ParkingSession)
            .filter(
                ParkingSession.lot_id == LOT_ID,
                ParkingSession.slot_id == slot_id,
                ParkingSession.end_ts.is_(None),
            )
            .first()
        )
        is_occ = open_sess is not None
        dist = OCCUPIED_DISTANCE_CM if is_occ else FREE_DISTANCE_CM

        slot_state = db.query(SlotState).filter(SlotState.lot_id == LOT_ID, SlotState.slot_id == slot_id).first()
        if not slot_state:
            slot_state = SlotState(
                lot_id=LOT_ID,
                slot_id=slot_id,
                occupied=is_occ,
                distance_cm=dist,
                rssi=-58,
                ts=now_utc,
                seq=seq_counter,
            )
            db.add(slot_state)
        else:
            slot_state.occupied = is_occ
            slot_state.distance_cm = dist
            slot_state.updated_at = now_utc

    db.commit()
    db.close()

    print(f"[SEED] Successfully seeded {total_events} events and {total_sessions} sessions across {DAYS} days.")


if __name__ == "__main__":
    run_seed()
