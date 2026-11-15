"""
[SIMULATOR] Smart Parking IoT Simulator
Mimics ESP32 + HC-SR04 sensor behavior over MQTT.
"""

import argparse
import json
import logging
import math
import random
import signal
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Dict, List, Optional

import paho.mqtt.client as mqtt

# ---------------------------------------------------------------------------
# Logging setup
# ---------------------------------------------------------------------------
LOG_FORMAT = "[SIMULATOR] %(asctime)s %(levelname)-8s %(message)s"
logging.basicConfig(format=LOG_FORMAT, datefmt="%Y-%m-%dT%H:%M:%S")
logger = logging.getLogger("simulator")


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
OCCUPIED_THRESHOLD_CM = 20.0
FREE_DISTANCE_CM = 150.0  # typical free-space reading
OCCUPIED_DISTANCE_CM = 12.0  # typical occupied reading
DEBOUNCE_REQUIRED = 3
HEARTBEAT_INTERVAL_S = 30.0
DEVICE_OFFLINE_DURATION_S = 30.0
RSSI_BASE = -55
RSSI_JITTER = 10


# ---------------------------------------------------------------------------
# Time-of-day arrival rate model
# ---------------------------------------------------------------------------
class PeakPeriod(Enum):
    NIGHT = "night"
    MORNING_PEAK = "morning_peak"
    MIDDAY = "midday"
    LUNCH_PEAK = "lunch_peak"
    AFTERNOON = "afternoon"
    EVENING_PEAK = "evening_peak"
    LATE_EVENING = "late_evening"


def get_arrival_rate(hour: float, is_weekend: bool) -> float:
    """Return probability [0,1] that a free slot becomes occupied in next minute."""
    # Base schedule (weekday)
    if 0 <= hour < 6:
        base = 0.005
    elif 6 <= hour < 8:
        base = 0.03
    elif 8 <= hour < 10:
        base = 0.12   # morning peak
    elif 10 <= hour < 12:
        base = 0.06
    elif 12 <= hour < 13:
        base = 0.09   # lunch peak
    elif 13 <= hour < 17:
        base = 0.05
    elif 17 <= hour < 19:
        base = 0.13   # evening peak
    elif 19 <= hour < 22:
        base = 0.04
    else:
        base = 0.01

    if is_weekend:
        base *= 0.5
        # small afternoon weekend bump
        if 14 <= hour < 16:
            base += 0.04

    return min(base, 1.0)


def sample_parking_duration_s(speed: float) -> float:
    """Return parking duration in real seconds (scaled by speed)."""
    duration_min = random.gauss(45, 20)
    duration_min = max(5.0, min(180.0, duration_min))
    return (duration_min * 60.0) / speed


# ---------------------------------------------------------------------------
# Slot state machine
# ---------------------------------------------------------------------------
@dataclass
class SlotState:
    slot_id: int
    occupied: bool = False
    distance_cm: float = FREE_DISTANCE_CM
    seq: int = 0
    # debounce
    pending_state: Optional[bool] = None
    debounce_count: int = 0
    # timing
    depart_at: float = 0.0   # epoch when car should leave (if occupied)
    # heartbeat
    last_published_at: float = 0.0


# ---------------------------------------------------------------------------
# Fault injection
# ---------------------------------------------------------------------------
class FaultType(Enum):
    PACKET_DROP = "packet_drop"
    DUPLICATE = "duplicate"
    SENSOR_NOISE = "sensor_noise"
    DEVICE_OFFLINE = "device_offline"


def choose_fault(fault_rate: float) -> Optional[FaultType]:
    if random.random() > fault_rate:
        return None
    return random.choice(list(FaultType))


# ---------------------------------------------------------------------------
# Simulator
# ---------------------------------------------------------------------------
class ParkingSimulator:
    def __init__(self, args: argparse.Namespace):
        self.broker = args.broker
        self.port = args.port
        self.lot = args.lot
        self.num_slots = args.slots
        self.speed = args.speed
        self.inject_faults = args.inject_faults
        self.fault_rate = args.fault_rate

        self.slots: Dict[int, SlotState] = {
            i: SlotState(slot_id=i) for i in range(1, self.num_slots + 1)
        }

        self.client: mqtt.Client = self._build_client()
        self.running = False
        self._offline_until: float = 0.0  # epoch; >0 means intentionally offline

        # Register signal handlers
        signal.signal(signal.SIGINT, self._handle_shutdown)
        signal.signal(signal.SIGTERM, self._handle_shutdown)

    # ------------------------------------------------------------------
    # MQTT helpers
    # ------------------------------------------------------------------
    def _build_client(self) -> mqtt.Client:
        client = mqtt.Client(client_id=f"simulator-lot-{self.lot}")
        lwt_topic = f"parking/{self.lot}/device/status"
        client.will_set(lwt_topic, payload="offline", qos=1, retain=True)
        client.on_connect = self._on_connect
        client.on_disconnect = self._on_disconnect
        return client

    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            logger.info("[SIMULATOR] Connected to MQTT broker %s:%d", self.broker, self.port)
            client.publish(
                f"parking/{self.lot}/device/status",
                payload="online",
                qos=1,
                retain=True,
            )
        else:
            logger.error("[SIMULATOR] Connection failed, rc=%d", rc)

    def _on_disconnect(self, client, userdata, rc):
        if rc != 0:
            logger.warning("[SIMULATOR] Unexpected disconnect rc=%d, will reconnect", rc)

    def _connect(self):
        self.client.connect(self.broker, self.port, keepalive=60)
        self.client.loop_start()

    def _disconnect_clean(self):
        self.client.publish(
            f"parking/{self.lot}/device/status",
            payload="offline",
            qos=1,
            retain=True,
        )
        time.sleep(0.2)
        self.client.loop_stop()
        self.client.disconnect()

    # ------------------------------------------------------------------
    # Payload builder
    # ------------------------------------------------------------------
    def _build_payload(self, slot: SlotState, noise: float = 0.0) -> dict:
        slot.seq += 1
        rssi = RSSI_BASE + random.randint(-RSSI_JITTER, RSSI_JITTER)
        distance = slot.distance_cm + noise
        distance = max(2.0, distance)
        return {
            "lot": self.lot,
            "slot": slot.slot_id,
            "occupied": slot.occupied,
            "distance_cm": round(distance, 1),
            "ts": datetime.now(timezone.utc).isoformat(),
            "seq": slot.seq,
            "rssi": rssi,
        }

    def _publish_slot(self, slot: SlotState, noise: float = 0.0, duplicate: bool = False):
        topic = f"parking/{self.lot}/slot/{slot.slot_id}/state"
        payload = self._build_payload(slot, noise)
        payload_str = json.dumps(payload)
        self.client.publish(topic, payload=payload_str, qos=1, retain=True)
        logger.debug(
            "[SIMULATOR] Published slot=%d occupied=%s dist=%.1fcm seq=%d",
            slot.slot_id, slot.occupied, payload["distance_cm"], slot.seq,
        )
        if duplicate:
            logger.warning("[SIMULATOR] FAULT duplicate publish slot=%d", slot.slot_id)
            self.client.publish(topic, payload=payload_str, qos=1, retain=True)

    # ------------------------------------------------------------------
    # Simulation tick
    # ------------------------------------------------------------------
    def _tick_slot(self, slot: SlotState, now: float, dt_now: datetime):
        """Update one slot's state machine for the current moment."""
        hour = dt_now.hour + dt_now.minute / 60.0
        is_weekend = dt_now.weekday() >= 5

        if slot.occupied:
            # Check if car should leave
            if now >= slot.depart_at:
                slot.occupied = False
                slot.distance_cm = FREE_DISTANCE_CM + random.uniform(-5, 5)
                logger.info("[SIMULATOR] Slot %d departed (free)", slot.slot_id)
        else:
            # Stochastic arrival: check per-tick
            arrival_rate_per_min = get_arrival_rate(hour, is_weekend)
            # Convert to per-tick probability (tick ~ 1 real second → speed seconds simulated)
            tick_prob = 1.0 - math.exp(-arrival_rate_per_min * self.speed / 60.0)
            if random.random() < tick_prob:
                slot.occupied = True
                slot.distance_cm = OCCUPIED_DISTANCE_CM + random.uniform(-3, 3)
                slot.depart_at = now + sample_parking_duration_s(self.speed)
                logger.info("[SIMULATOR] Slot %d arrival (occupied)", slot.slot_id)

    def _should_publish_heartbeat(self, slot: SlotState, now: float) -> bool:
        return (now - slot.last_published_at) >= (HEARTBEAT_INTERVAL_S / self.speed)

    def _handle_fault_and_publish(self, slot: SlotState):
        """Apply fault injection and publish."""
        noise = 0.0
        duplicate = False

        if self.inject_faults:
            fault = choose_fault(self.fault_rate)
            if fault == FaultType.PACKET_DROP:
                logger.warning("[SIMULATOR] FAULT packet_drop slot=%d", slot.slot_id)
                return  # skip publish
            elif fault == FaultType.DUPLICATE:
                duplicate = True
            elif fault == FaultType.SENSOR_NOISE:
                noise = random.uniform(-5, 5)
                logger.debug("[SIMULATOR] FAULT sensor_noise noise=%.1f slot=%d", noise, slot.slot_id)
            elif fault == FaultType.DEVICE_OFFLINE:
                if self._offline_until <= time.time():
                    logger.warning("[SIMULATOR] FAULT device_offline for %.0fs", DEVICE_OFFLINE_DURATION_S)
                    self.client.publish(
                        f"parking/{self.lot}/device/status",
                        payload="offline",
                        qos=1,
                        retain=True,
                    )
                    self._offline_until = time.time() + DEVICE_OFFLINE_DURATION_S / self.speed
                    return

        if self._offline_until > time.time():
            return  # still in offline window

        self._publish_slot(slot, noise=noise, duplicate=duplicate)
        slot.last_published_at = time.time()

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------
    def run(self):
        logger.info("[SIMULATOR] Starting – lot=%s slots=%d speed=%.1fx faults=%s",
                    self.lot, self.num_slots, self.speed, self.inject_faults)
        self._connect()
        self.running = True

        # Initial publish for all slots
        time.sleep(1.0)
        for slot in self.slots.values():
            self._handle_fault_and_publish(slot)

        last_heartbeat = time.time()
        tick_interval = 1.0  # real seconds per tick

        while self.running:
            now_real = time.time()
            # Simulated wall-clock: advance by speed factor from an anchor
            dt_now = datetime.now()  # use local time for realism

            # Reconnect after offline window
            if self._offline_until > 0 and now_real >= self._offline_until:
                logger.info("[SIMULATOR] Reconnecting after device_offline fault")
                self._offline_until = 0.0
                self.client.publish(
                    f"parking/{self.lot}/device/status",
                    payload="online",
                    qos=1,
                    retain=True,
                )

            for slot in self.slots.values():
                prev_occupied = slot.occupied
                self._tick_slot(slot, now_real, dt_now)

                state_changed = slot.occupied != prev_occupied
                heartbeat_due = self._should_publish_heartbeat(slot, now_real)

                if state_changed or heartbeat_due:
                    self._handle_fault_and_publish(slot)

            time.sleep(tick_interval)

        logger.info("[SIMULATOR] Shutting down cleanly")
        self._disconnect_clean()

    # ------------------------------------------------------------------
    # Signal handler
    # ------------------------------------------------------------------
    def _handle_shutdown(self, signum, frame):
        logger.info("[SIMULATOR] Signal %d received – stopping", signum)
        self.running = False


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="[SIMULATOR] Smart Parking MQTT Simulator"
    )
    p.add_argument("--broker", default="localhost", help="MQTT broker hostname")
    p.add_argument("--port", type=int, default=1883, help="MQTT broker port")
    p.add_argument("--lot", default="A", help="Parking lot ID")
    p.add_argument("--slots", type=int, default=4, help="Number of slots to simulate")
    p.add_argument(
        "--speed",
        type=float,
        default=1.0,
        help="Simulation speed multiplier (10 = 10x faster)",
    )
    p.add_argument(
        "--inject-faults",
        action="store_true",
        default=False,
        help="Enable fault injection",
    )
    p.add_argument(
        "--fault-rate",
        type=float,
        default=0.05,
        help="Probability of fault per message (0.0–1.0)",
    )
    p.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging verbosity",
    )
    return p.parse_args()


def main():
    args = parse_args()
    logger.setLevel(getattr(logging, args.log_level))
    sim = ParkingSimulator(args)
    sim.run()


if __name__ == "__main__":
    main()
