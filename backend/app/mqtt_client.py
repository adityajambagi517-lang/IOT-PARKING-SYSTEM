"""
Paho-MQTT client for the Smart Parking backend.

Runs in a background thread (paho's own network loop).  Bridges updates to
the main asyncio event loop via loop.call_soon_threadsafe so that WebSocket
broadcasts are safe.
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
from datetime import datetime, timezone
from typing import Optional, Set

import paho.mqtt.client as mqtt
from pydantic import ValidationError
from sqlalchemy.orm import Session

from .config import settings
from .db import SessionLocal
from .models import SlotState, Event, ParkingSession, DeviceStatus
from .schemas import SlotPayload

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Shared state – accessed from both the MQTT thread and asyncio tasks
# ---------------------------------------------------------------------------

# All active WebSocket connections (asyncio websocket objects)
websocket_connections: Set = set()

# Reference to the main asyncio event loop (set in main.py on startup)
_loop: Optional[asyncio.AbstractEventLoop] = None

# MQTT client singleton
_client: Optional[mqtt.Client] = None
_connected: bool = False
_lock = threading.Lock()

# Reconnect bookkeeping
_reconnect_delay: float = 1.0
_MAX_RECONNECT_DELAY: float = 60.0


def set_event_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _loop
    _loop = loop


def is_connected() -> bool:
    return _connected


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _broadcast(payload: dict) -> None:
    """Schedule a WebSocket broadcast on the asyncio event loop."""
    if _loop is None or not websocket_connections:
        return
    message = json.dumps(payload)

    async def _send_all(msg: str) -> None:
        dead: Set = set()
        for ws in list(websocket_connections):
            try:
                await ws.send_text(msg)
            except Exception:
                dead.add(ws)
        websocket_connections.difference_update(dead)

    _loop.call_soon_threadsafe(asyncio.ensure_future, _send_all(message))


def _upsert_slot_state(db: Session, payload: SlotPayload) -> SlotState:
    slot: Optional[SlotState] = (
        db.query(SlotState)
        .filter(SlotState.lot_id == payload.lot, SlotState.slot_id == payload.slot)
        .first()
    )
    ts_dt = _parse_ts(payload.ts)
    if slot is None:
        slot = SlotState(
            lot_id=payload.lot,
            slot_id=payload.slot,
            occupied=payload.occupied,
            distance_cm=payload.distance_cm,
            rssi=payload.rssi,
            ts=ts_dt,
            seq=payload.seq,
        )
        db.add(slot)
    else:
        slot.occupied = payload.occupied
        slot.distance_cm = payload.distance_cm
        slot.rssi = payload.rssi
        slot.ts = ts_dt
        slot.seq = payload.seq
    db.commit()
    db.refresh(slot)
    return slot


def _insert_event(db: Session, payload: SlotPayload) -> Event:
    ts_dt = _parse_ts(payload.ts)
    event = Event(
        lot_id=payload.lot,
        slot_id=payload.slot,
        occupied=payload.occupied,
        distance_cm=payload.distance_cm,
        rssi=payload.rssi,
        ts=ts_dt,
        seq=payload.seq,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def _handle_session(db: Session, payload: SlotPayload, previous_occupied: bool) -> None:
    """Open or close a ParkingSession based on occupancy transition."""
    ts_dt = _parse_ts(payload.ts)
    now = ts_dt or datetime.now(timezone.utc).replace(tzinfo=None)

    if not previous_occupied and payload.occupied:
        # Slot just became occupied → open a new session
        session = ParkingSession(
            lot_id=payload.lot,
            slot_id=payload.slot,
            start_ts=now,
        )
        db.add(session)
        db.commit()

    elif previous_occupied and not payload.occupied:
        # Slot just freed → close the most recent open session
        open_session: Optional[ParkingSession] = (
            db.query(ParkingSession)
            .filter(
                ParkingSession.lot_id == payload.lot,
                ParkingSession.slot_id == payload.slot,
                ParkingSession.end_ts.is_(None),
            )
            .order_by(ParkingSession.start_ts.desc())
            .first()
        )
        if open_session:
            open_session.end_ts = now
            delta = (now - open_session.start_ts).total_seconds()
            open_session.duration_seconds = max(delta, 0)
            db.commit()


def _upsert_device_status(db: Session, lot_id: str, status: str, ts: Optional[datetime] = None) -> None:
    now = ts or datetime.now(timezone.utc).replace(tzinfo=None)
    record: Optional[DeviceStatus] = (
        db.query(DeviceStatus).filter(DeviceStatus.lot_id == lot_id).first()
    )
    if record is None:
        record = DeviceStatus(lot_id=lot_id, status=status, ts=now)
        db.add(record)
    else:
        record.status = status
        record.ts = now
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("Failed to commit device status: %s", exc)


def _parse_ts(ts_str: str) -> Optional[datetime]:
    try:
        dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        # Store as naive UTC for SQLite compatibility
        return dt.replace(tzinfo=None) if dt.tzinfo else dt
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Paho callbacks
# ---------------------------------------------------------------------------

def _on_connect(client: mqtt.Client, userdata, flags, rc: int) -> None:
    global _connected, _reconnect_delay
    if rc == 0:
        _connected = True
        _reconnect_delay = 1.0
        logger.info("MQTT connected to %s:%d", settings.mqtt_broker, settings.mqtt_port)
        client.subscribe("parking/#", qos=1)
        logger.info("Subscribed to parking/#")
    else:
        _connected = False
        logger.error("MQTT connect failed with rc=%d", rc)


def _on_disconnect(client: mqtt.Client, userdata, rc: int) -> None:
    global _connected
    _connected = False
    if rc != 0:
        logger.warning("MQTT unexpected disconnect (rc=%d); will reconnect …", rc)


def _on_message(client: mqtt.Client, userdata, msg: mqtt.MQTTMessage) -> None:
    """Handle incoming MQTT messages in the paho thread."""
    topic: str = msg.topic
    parts = topic.split("/")

    try:
        payload_text = msg.payload.decode("utf-8", errors="replace").strip()
    except Exception as exc:
        logger.warning("Invalid payload decode on topic %s: %s", topic, exc)
        return

    # Handle device status: parking/{lot_id}/device/status
    # Tolerates JSON: {"status":"online","ts":"..."} AND plain text: "online" / "offline"
    if len(parts) == 4 and parts[0] == "parking" and parts[2] == "device" and parts[3] == "status":
        lot_id = parts[1]
        status_val = "offline"
        ts_val = None

        try:
            parsed = json.loads(payload_text)
            if isinstance(parsed, dict):
                status_val = parsed.get("status", "online")
                ts_str = parsed.get("ts")
                if ts_str:
                    ts_val = _parse_ts(ts_str)
            elif isinstance(parsed, str):
                status_val = parsed.strip()
        except Exception:
            # Plain text string like "online" or "offline"
            status_val = payload_text.strip().strip('"').strip("'").lower()

        status_val = "online" if "online" in str(status_val).lower() else "offline"
        ts_dt = ts_val or datetime.now(timezone.utc).replace(tzinfo=None)

        db = SessionLocal()
        try:
            _upsert_device_status(db, lot_id, status_val, ts_dt)
            _broadcast({
                "type": "device_status",
                "lot_id": lot_id,
                "status": status_val,
                "ts": ts_dt.isoformat(),
            })
        except Exception as exc:
            logger.exception("Error processing device status on %s: %s", topic, exc)
        finally:
            db.close()
        return

    # For other topics (slot state, etc.), parse JSON
    try:
        raw = json.loads(payload_text)
    except Exception as exc:
        logger.warning("Invalid JSON on topic %s: %s", topic, exc)
        return

    db = SessionLocal()
    try:
        if len(parts) == 5 and parts[0] == "parking" and parts[2] == "slot" and parts[4] == "state":
            _handle_slot_state(db, raw, topic)
        else:
            logger.debug("Unhandled topic: %s", topic)
    except Exception as exc:
        logger.exception("Error processing MQTT message on %s: %s", topic, exc)
    finally:
        db.close()


def _handle_slot_state(db: Session, raw: dict, topic: str) -> None:
    """Validate, persist, and broadcast a slot-state payload."""
    try:
        payload = SlotPayload(**raw)
    except ValidationError as exc:
        logger.warning("Payload validation failed for topic %s: %s", topic, exc)
        return

    # Read previous state before upsert
    prev: Optional[SlotState] = (
        db.query(SlotState)
        .filter(SlotState.lot_id == payload.lot, SlotState.slot_id == payload.slot)
        .first()
    )
    previous_occupied = prev.occupied if prev else False

    # Check for stale sequence numbers safely (guard against out-of-order packets while handling reboots)
    if prev and prev.seq is not None and payload.seq is not None:
        if payload.seq < prev.seq:
            prev_ts = prev.ts
            new_ts = _parse_ts(payload.ts)
            # If payload is genuinely older than current state by >5s and not a device reboot (reboot starts seq low)
            if prev_ts and new_ts and (prev_ts - new_ts).total_seconds() > 5.0 and not (payload.seq < 5 and prev.seq > 50):
                logger.info("Ignoring stale sequence %d (current %d) for slot %d", payload.seq, prev.seq, payload.slot)
                return

    try:
        _upsert_slot_state(db, payload)
        _insert_event(db, payload)
        _handle_session(db, payload, previous_occupied)
    except Exception as exc:
        db.rollback()
        logger.error("Database error while handling slot state: %s", exc)
        raise

    _broadcast({
        "type": "slot_update",
        "lot": payload.lot,
        "lot_id": payload.lot,
        "slot": payload.slot,
        "slot_id": payload.slot,
        "occupied": payload.occupied,
        "status": "occupied" if payload.occupied else "free",
        "distance_cm": payload.distance_cm,
        "rssi": payload.rssi,
        "ts": payload.ts,
        "seq": payload.seq,
    })


# ---------------------------------------------------------------------------
# Client lifecycle
# ---------------------------------------------------------------------------

def _reconnect_loop(client: mqtt.Client) -> None:
    """Called from the network thread when disconnected; backs off and retries."""
    global _reconnect_delay
    while not _connected:
        logger.info("Attempting MQTT reconnect in %.0fs …", _reconnect_delay)
        time.sleep(_reconnect_delay)
        _reconnect_delay = min(_reconnect_delay * 2, _MAX_RECONNECT_DELAY)
        try:
            client.reconnect()
            break
        except Exception as exc:
            logger.warning("Reconnect failed: %s", exc)


def start_mqtt(loop: asyncio.AbstractEventLoop) -> mqtt.Client:
    """Create, configure, and start the MQTT client. Returns the client."""
    global _client
    set_event_loop(loop)

    client = mqtt.Client(client_id=settings.mqtt_client_id, protocol=mqtt.MQTTv311)

    # Credentials
    if settings.mqtt_username:
        client.username_pw_set(settings.mqtt_username, settings.mqtt_password)

    # Last Will and Testament — backend publishes offline status for backend service if it crashes
    lwt_topic = f"parking/{settings.lot_id}/backend/status"
    client.will_set(lwt_topic, json.dumps({"status": "offline"}), qos=1, retain=True)

    client.on_connect = _on_connect
    client.on_disconnect = _on_disconnect
    client.on_message = _on_message

    try:
        client.connect_async(settings.mqtt_broker, settings.mqtt_port, keepalive=60)
    except Exception as exc:
        logger.error("Initial MQTT connection failed: %s — will retry in background", exc)

    # Run paho's loop in a daemon thread
    client.loop_start()
    _client = client
    return client


def stop_mqtt() -> None:
    """Gracefully disconnect the MQTT client."""
    global _client, _connected
    if _client is not None:
        _client.loop_stop()
        _client.disconnect()
        _connected = False
        logger.info("MQTT client disconnected.")


def publish_cmd(topic: str, payload_str: str) -> bool:
    """Publish a command to an MQTT topic. Returns True if published."""
    global _client, _connected
    if _client is not None and _connected:
        try:
            info = _client.publish(topic, payload_str, qos=1)
            return info.rc == mqtt.MQTT_ERR_SUCCESS
        except Exception as exc:
            logger.error("Failed to publish command: %s", exc)
            return False
    logger.warning("Cannot publish command: MQTT not connected")
    return False
