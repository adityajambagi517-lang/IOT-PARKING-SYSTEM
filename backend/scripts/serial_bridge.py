#!/usr/bin/env python3
"""
PARKPULSE IoT — USB Serial to MQTT Bridge
Reads ESP32 ultrasonic parking sensor data over USB Serial (COM15, 115200 baud)
and publishes standardized telemetry to the Mosquitto MQTT broker on localhost:1883.

Architecture:
  ESP32 (USB Serial COM15)
       │
       ▼
  Python Serial Bridge (serial_bridge.py)
       │
       ▼ MQTT (localhost:1883)
  Mosquitto Broker
       │
       ▼
  FastAPI Backend ──► SQLite (Audit Log & Sessions)
       │
       ▼ WebSocket (/ws)
  React Web Dashboard (http://localhost:8000)
"""

import argparse
import json
import logging
import re
import sys
import time
from datetime import datetime, timezone
from typing import Optional, Tuple

import paho.mqtt.client as mqtt
import serial
from serial.tools import list_ports

# Setup clean console logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("serial_bridge")


class ParkingSerialBridge:
    def __init__(
        self,
        port: str = "COM15",
        baud: int = 115200,
        broker_host: str = "localhost",
        broker_port: int = 1883,
        lot_id: str = "A",
    ):
        self.port = port
        self.baud = baud
        self.broker_host = broker_host
        self.broker_port = broker_port
        self.lot_id = lot_id

        self.mqtt_client: Optional[mqtt.Client] = None
        self.serial_conn: Optional[serial.Serial] = None
        self.running: bool = False

        self.seq_slot1: int = 0
        self.seq_slot2: int = 0
        self.last_heartbeat: float = 0.0
        self.heartbeat_interval: float = 15.0  # seconds

        # Previous state tracking to reduce redundant logging
        self.prev_state = {1: None, 2: None}

    def connect_mqtt(self) -> bool:
        """Connect to local Mosquitto MQTT broker."""
        try:
            self.mqtt_client = mqtt.Client(client_id=f"usb-serial-bridge-{self.lot_id}")
            self.mqtt_client.on_connect = self._on_mqtt_connect
            self.mqtt_client.on_disconnect = self._on_mqtt_disconnect
            
            logger.info("Connecting to MQTT broker at %s:%d ...", self.broker_host, self.broker_port)
            self.mqtt_client.connect(self.broker_host, self.broker_port, keepalive=60)
            self.mqtt_client.loop_start()
            return True
        except Exception as exc:
            logger.error("Failed to connect to MQTT broker (%s:%d): %s", self.broker_host, self.broker_port, exc)
            return False

    def _on_mqtt_connect(self, client, userdata, flags, rc):
        if rc == 0:
            logger.info("MQTT Connected successfully to %s:%d", self.broker_host, self.broker_port)
            self.publish_heartbeat(status="online")
        else:
            logger.error("MQTT Connection failed with return code: %d", rc)

    def _on_mqtt_disconnect(self, client, userdata, rc):
        if rc != 0:
            logger.warning("Unexpected MQTT disconnect (rc=%d). Reconnecting...", rc)

    def publish_heartbeat(self, status: str = "online"):
        """Publish device status heartbeat to parking/{lot_id}/device/status."""
        if not self.mqtt_client:
            return
        topic = f"parking/{self.lot_id}/device/status"
        payload = {
            "status": status,
            "ts": datetime.now(timezone.utc).isoformat(),
        }
        self.mqtt_client.publish(topic, json.dumps(payload), qos=1, retain=True)
        self.last_heartbeat = time.time()
        logger.debug("Published heartbeat -> %s : %s", topic, payload)

    def publish_slot(self, slot_id: int, occupied: bool, distance_cm: float):
        """Build compliant SlotPayload and publish to parking/{lot_id}/slot/{slot_id}/state."""
        if not self.mqtt_client:
            return

        # Clamp distance to valid backend schema range (0.0 to 400.0)
        dist = max(0.0, min(float(distance_cm), 400.0))

        if slot_id == 1:
            self.seq_slot1 += 1
            seq = self.seq_slot1
        else:
            self.seq_slot2 += 1
            seq = self.seq_slot2

        topic = f"parking/{self.lot_id}/slot/{slot_id}/state"
        payload = {
            "lot": self.lot_id,
            "slot": slot_id,
            "occupied": bool(occupied),
            "distance_cm": round(dist, 1),
            "rssi": -50,  # Standard wired USB RSSI value
            "seq": seq,
            "ts": datetime.now(timezone.utc).isoformat(),
        }

        self.mqtt_client.publish(topic, json.dumps(payload), qos=1)

        # Log state changes or updates
        state_str = "OCCUPIED [RED]" if occupied else "FREE [GREEN]"
        if self.prev_state.get(slot_id) != occupied:
            self.prev_state[slot_id] = occupied
            logger.info(">>> STATE CHANGE: Bay %d -> %s (Distance: %.1f cm) [Seq #%d]", slot_id, state_str, dist, seq)
        else:
            logger.info("Bay %d: %s | %.1f cm (MQTT Published)", slot_id, state_str, dist)

    def parse_line(self, raw_line: str):
        """
        Dual parser supporting both:
        1. Clean JSON Lines: {"s1":{"d":8.5,"occ":true},"s2":{"d":150.0,"occ":false}}
        2. Text Fallback: Slot 1: OCCUPIED | Distance: 8.50 cm
        """
        line = raw_line.strip()
        if not line:
            return

        # Strategy 1: Fast JSON Parser
        if line.startswith("{") and line.endswith("}"):
            try:
                data = json.loads(line)
                # Format A: Combined two-slot object {"s1": {"d": ..., "occ": ...}, "s2": ...}
                if "s1" in data and "s2" in data:
                    s1 = data["s1"]
                    s2 = data["s2"]
                    self.publish_slot(1, bool(s1.get("occ", False)), float(s1.get("d", 150.0)))
                    self.publish_slot(2, bool(s2.get("occ", False)), float(s2.get("d", 150.0)))
                    return
                # Format B: Single slot object {"slot": 1, "distance_cm": 8.5, "occupied": true}
                if "slot" in data and ("occupied" in data or "occ" in data):
                    s_id = int(data["slot"])
                    occ = bool(data.get("occupied", data.get("occ", False)))
                    dist = float(data.get("distance_cm", data.get("d", 150.0)))
                    self.publish_slot(s_id, occ, dist)
                    return
            except Exception as e:
                logger.debug("JSON parse skipped: %s", e)

        # Strategy 2: Text Regex Fallback (Parses standard Serial.print output)
        # Matches: "Slot 1: OCCUPIED | Distance: 8.50 cm" or "Slot 2: FREE | Distance: 150.00 cm"
        m1 = re.search(r"Slot\s*1\s*:\s*(OCCUPIED|FREE).*?Distance\s*:\s*([\d\.]+)", line, re.IGNORECASE)
        if m1:
            occ1 = (m1.group(1).upper() == "OCCUPIED")
            dist1 = float(m1.group(2))
            self.publish_slot(1, occ1, dist1)
            return

        m2 = re.search(r"Slot\s*2\s*:\s*(OCCUPIED|FREE).*?Distance\s*:\s*([\d\.]+)", line, re.IGNORECASE)
        if m2:
            occ2 = (m2.group(2).upper() == "OCCUPIED" if len(m2.groups()) >= 2 else (m2.group(1).upper() == "OCCUPIED"))
            dist2 = float(m2.group(2))
            self.publish_slot(2, occ2, dist2)
            return

    def run(self):
        """Main loop connecting serial and publishing to MQTT."""
        if not self.connect_mqtt():
            logger.error("Cannot proceed without MQTT broker. Ensure Mosquitto or Docker is running on port 1883.")
            return

        self.running = True
        logger.info("=============================================================")
        logger.info("  PARKPULSE IoT — USB Serial Bridge (COM15 -> MQTT 1883)     ")
        logger.info("=============================================================")
        logger.info("Serial Port: %s | Baud: %d", self.port, self.baud)
        logger.info("MQTT Broker: %s:%d | Lot: %s", self.broker_host, self.broker_port, self.lot_id)
        logger.info("Listening for ESP32 parking bay telemetry...")
        logger.info("Press CTRL+C to stop bridge.")
        logger.info("-------------------------------------------------------------")

        while self.running:
            try:
                # Open serial port
                self.serial_conn = serial.Serial(self.port, self.baud, timeout=1.0)
                logger.info("Successfully opened serial port %s!", self.port)

                # Announce online status
                self.publish_heartbeat(status="online")

                while self.running:
                    # Check periodic heartbeat (every 15s)
                    if time.time() - self.last_heartbeat > self.heartbeat_interval:
                        self.publish_heartbeat(status="online")

                    if self.serial_conn.in_waiting:
                        try:
                            raw_bytes = self.serial_conn.readline()
                            line = raw_bytes.decode("utf-8", errors="replace")
                            self.parse_line(line)
                        except Exception as parse_err:
                            logger.debug("Line read error: %s", parse_err)
                    else:
                        time.sleep(0.02)

            except serial.SerialException as se:
                err_msg = str(se)
                if "PermissionError" in err_msg or "Access is denied" in err_msg:
                    logger.error(
                        "ACCESS DENIED on %s: The port is currently locked by another program!\n"
                        "  ==> FIX: Close the Serial Monitor window in Arduino IDE.\n"
                        "  Retrying connection in 3 seconds...",
                        self.port,
                    )
                elif "FileNotFoundError" in err_msg or "cannot find" in err_msg:
                    logger.warning(
                        "Port %s not detected. Ensure ESP32 USB cable is securely connected. Retrying in 3s...",
                        self.port,
                    )
                else:
                    logger.warning("Serial error on %s: %s. Retrying in 3s...", self.port, se)
                time.sleep(3.0)

            except Exception as exc:
                logger.error("Unexpected bridge error: %s", exc)
                time.sleep(2.0)

            finally:
                if self.serial_conn and self.serial_conn.is_open:
                    try:
                        self.serial_conn.close()
                    except Exception:
                        pass

    def stop(self):
        self.running = False
        if self.mqtt_client:
            try:
                self.publish_heartbeat(status="offline")
                time.sleep(0.5)
                self.mqtt_client.loop_stop()
                self.mqtt_client.disconnect()
            except Exception:
                pass
        logger.info("Serial bridge stopped cleanly.")


def main():
    parser = argparse.ArgumentParser(description="PARKPULSE IoT USB Serial to MQTT Bridge")
    parser.add_argument("--port", default="COM15", help="Serial port of ESP32 (default: COM15)")
    parser.add_argument("--baud", type=int, default=115200, help="Baud rate (default: 115200)")
    parser.add_argument("--broker", default="localhost", help="MQTT Broker host (default: localhost)")
    parser.add_argument("--mqtt-port", type=int, default=1883, help="MQTT Broker port (default: 1883)")
    parser.add_argument("--lot", default="A", help="Lot ID (default: A)")

    args = parser.parse_args()

    bridge = ParkingSerialBridge(
        port=args.port,
        baud=args.baud,
        broker_host=args.broker,
        broker_port=args.mqtt_port,
        lot_id=args.lot,
    )

    try:
        bridge.run()
    except KeyboardInterrupt:
        logger.info("Stopping Serial Bridge...")
    finally:
        bridge.stop()


if __name__ == "__main__":
    main()
