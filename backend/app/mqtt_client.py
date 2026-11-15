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


def _upsert_device_status(db: Session, lot_id: str, status: str) -> None:
    record: Optional[DeviceStatus] = (
        db.query(DeviceStatus).filter(DeviceStatus.lot_id == lot_id).first()
    )
    if record is None:
        record = DeviceStatus(lot_id=lot_id, status=status, ts=datetime.utcnow())
        db.add(record)
    else:
        record.status = status
        record.ts = datetime.utcnow()
    db.commit()


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
    try:
        raw = json.loads(msg.payload.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        logger.warning("Invalid JSON on topic %s: %s", topic, exc)
        return

    # Topic pattern: parking/{lot_id}/slot/{slot_id}/state
    parts = topic.split("/")
    db = SessionLocal()
    try:
        if len(parts) == 5 and parts[0] == "parking" and parts[2] == "slot" and parts[4] == "state":
            _handle_slot_state(db, raw, topic)

        elif len(parts) == 4 and parts[0] == "parking" and parts[2] == "device" and parts[3] == "status":
            lot_id = parts[1]
            if isinstance(raw, dict):
                status = raw.get("status", "online")
            elif isinstance(raw, str):
                status = raw.strip()
            else:
                status = "online"
            _upsert_device_status(db, lot_id, status)
            _broadcast({"type": "device_status", "lot_id": lot_id, "status": status})

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

    _upsert_slot_state(db, payload)
    _insert_event(db, payload)
    _handle_session(db, payload, previous_occupied)

    _broadcast({
        "type": "slot_update",
        "lot": payload.lot,
        "slot": payload.slot,
        "occupied": payload.occupied,
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

    # Last Will and Testament — backend publishes offline status if it crashes
    lwt_topic = f"parking/{settings.lot_id}/device/status"
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
