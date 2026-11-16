#!/usr/bin/env python3
"""
Interactive Demonstration CLI for Evaluators & Mini-Project Presentation.

Allows real-time manual control of parking slots during a live demonstration:
- park <slot_id>      -> Mark slot as OCCUPIED (turns Red on dashboard)
- leave <slot_id>     -> Mark slot as FREE (turns Green on dashboard, computes session duration)
- distance <slot> <cm>-> Send custom distance measurement
- flap <slot_id>      -> Trigger sensor flapping anomaly (>5 state changes in 10 seconds)
- status              -> Display live status table of all 4 slots
- exit / quit         -> Terminate CLI
"""

import sys
import os
import time
import json
import urllib.request
from datetime import datetime, timezone

# Ensure project root is on path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, PROJECT_ROOT)

from backend.app.config import settings
from backend.app.db import SessionLocal
from backend.app.models import SlotState, Event, ParkingSession
from backend.app.schemas import SlotPayload
from backend.app.mqtt_client import _handle_slot_state

API_URL = "http://localhost:8000"


def send_state_update(slot_id: int, occupied: bool, distance_cm: float):
    now_iso = datetime.now(timezone.utc).isoformat()
    raw = {
        "lot": settings.lot_id,
        "slot": slot_id,
        "occupied": occupied,
        "distance_cm": distance_cm,
        "ts": now_iso,
        "seq": int(time.time()),
        "rssi": -58,
    }
    topic = f"parking/{settings.lot_id}/slot/{slot_id}/state"

    db = SessionLocal()
    try:
        _handle_slot_state(db, raw, topic)
        status_label = "OCCUPIED" if occupied else "FREE"
        print(f"[*] Slot {slot_id} updated -> {status_label} ({distance_cm} cm)")
    except Exception as exc:
        print(f"[-] Error updating slot {slot_id}: {exc}")
    finally:
        db.close()


def print_status():
    db = SessionLocal()
    try:
        slots = db.query(SlotState).filter(SlotState.lot_id == settings.lot_id).order_by(SlotState.slot_id).all()
        print("\n=== Current Parking Lot Status (Lot A) ===")
        print(f"{'Slot':<8} | {'Status':<12} | {'Distance':<12} | {'Last Updated'}")
        print("-" * 55)
        for s in slots:
            status = "OCCUPIED" if s.occupied else "FREE"
            dist = f"{s.distance_cm} cm" if s.distance_cm is not None else "—"
            ts_str = s.updated_at.strftime("%H:%M:%S") if s.updated_at else "—"
            print(f"Slot {s.slot_id:<3} | {status:<12} | {dist:<12} | {ts_str}")
        print("-" * 55 + "\n")
    finally:
        db.close()


def trigger_flapping(slot_id: int):
    print(f"[*] Simulating rapid sensor flapping on Slot {slot_id} (6 toggles)...")
    for i in range(6):
        is_occ = (i % 2 == 0)
        dist = 14.0 if is_occ else 160.0
        send_state_update(slot_id, is_occ, dist)
        time.sleep(0.3)
    print(f"[+] Flapping sequence complete. Refresh dashboard to see the Anomaly alert card!")


def print_help():
    print("""
Available Commands for Live Demo:
  park <1-4>            -> Simulate vehicle parking in slot
  leave <1-4>           -> Simulate vehicle departing slot
  distance <1-4> <cm>   -> Set arbitrary ultrasonic distance reading
  flap <1-4>            -> Trigger rapid flapping anomaly alert
  status                -> View real-time status of all slots
  help                  -> Show this command list
  exit / quit           -> Quit interactive session
    """)


def main():
    print("=" * 60)
    print("  Smart Parking Interactive Demonstration Tool")
    print(f"  Connected to Local System | Dashboard: {API_URL}")
    print("=" * 60)
    print_help()
    print_status()

    while True:
        try:
            line = input("SmartPark-Demo> ").strip()
            if not line:
                continue

            parts = line.split()
            cmd = parts[0].lower()

            if cmd in ("exit", "quit", "q"):
                print("Exiting interactive demo.")
                break

            elif cmd == "help":
                print_help()

            elif cmd == "status":
                print_status()

            elif cmd == "park":
                if len(parts) < 2 or not parts[1].isdigit():
                    print("Usage: park <slot_number_1-4>")
                    continue
                s_id = int(parts[1])
                send_state_update(s_id, occupied=True, distance_cm=13.5)

            elif cmd == "leave":
                if len(parts) < 2 or not parts[1].isdigit():
                    print("Usage: leave <slot_number_1-4>")
                    continue
                s_id = int(parts[1])
                send_state_update(s_id, occupied=False, distance_cm=165.0)

            elif cmd == "distance":
                if len(parts) < 3 or not parts[1].isdigit():
                    print("Usage: distance <slot_number_1-4> <distance_in_cm>")
                    continue
                s_id = int(parts[1])
                dist = float(parts[2])
                occupied = dist < settings.occupied_threshold if hasattr(settings, 'occupied_threshold') else dist < 20.0
                send_state_update(s_id, occupied=occupied, distance_cm=dist)

            elif cmd == "flap":
                if len(parts) < 2 or not parts[1].isdigit():
                    print("Usage: flap <slot_number_1-4>")
                    continue
                s_id = int(parts[1])
                trigger_flapping(s_id)

            else:
                print(f"Unknown command: '{cmd}'. Type 'help' for available commands.")

        except (KeyboardInterrupt, EOFError):
            print("\nExiting interactive demo.")
            break


if __name__ == "__main__":
    main()

