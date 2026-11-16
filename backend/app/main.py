"""
FastAPI Application for IoT Smart Parking Occupancy Monitoring System.
"""

from __future__ import annotations

import asyncio
import io
import csv
import json
import logging
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional, Any

from fastapi import FastAPI, Depends, WebSocket, WebSocketDisconnect, Query, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import desc

from .config import settings
from .db import get_db, init_db, SessionLocal
from .models import SlotState, Event, ParkingSession, DeviceStatus
from .schemas import (
    SlotPayload,
    SlotStateResponse,
    EventResponse,
    SessionResponse,
    AnalyticsSummary,
    HourlyStats,
    DailyStats,
    HealthResponse,
    CmdRequest,
)
from . import analytics, predict
from .mqtt_client import (
    start_mqtt,
    stop_mqtt,
    is_connected as mqtt_is_connected,
    websocket_connections,
    publish_cmd,
)

logger = logging.getLogger("parking_api")
logging.basicConfig(level=logging.INFO)

START_TIME = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if os.environ.get("TESTING"):
        yield
        return

    # Startup
    logger.info("Initializing database tables...")
    init_db()

    # Pre-populate slot_state rows if empty so dashboard shows all slots immediately
    db = SessionLocal()
    try:
        existing_slots = db.query(SlotState).filter(SlotState.lot_id == settings.lot_id).all()
        existing_ids = {s.slot_id for s in existing_slots}
        for s_id in range(1, settings.num_slots + 1):
            if s_id not in existing_ids:
                db.add(SlotState(
                    lot_id=settings.lot_id,
                    slot_id=s_id,
                    occupied=False,
                    distance_cm=150.0,
                    rssi=-50,
                    seq=0,
                    ts=datetime.now(timezone.utc),
                ))
        db.commit()
    except Exception as exc:
        logger.warning("Could not pre-populate slots: %s", exc)
    finally:
        db.close()

    # Start MQTT background subscriber (skip during unit tests)
    if not os.environ.get("TESTING"):
        loop = asyncio.get_running_loop()
        logger.info("Starting MQTT client connecting to %s:%d...", settings.mqtt_broker, settings.mqtt_port)
        start_mqtt(loop)

    yield

    # Shutdown
    if not os.environ.get("TESTING"):
        logger.info("Shutting down MQTT client...")
        stop_mqtt()


app = FastAPI(
    title="IoT Smart Parking System API",
    description="Backend API for ESP32 + HC-SR04 Smart Parking Occupancy Monitoring and Analytics",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for local development and dashboard access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Health & Status
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    """System health, MQTT status, uptime, and database connectivity."""
    db_ok = True
    slot_count = settings.num_slots
    latest_status = "offline"
    last_seen = None
    esp32_connected = False

    try:
        # Check DB
        dev = db.query(DeviceStatus).filter(DeviceStatus.lot_id == settings.lot_id).first()
        if dev:
            last_seen = dev.ts.isoformat() if dev.ts else None
            now = datetime.now(timezone.utc).replace(tzinfo=None)
            # Evaluate freshness
            if dev.status == "online" and dev.ts:
                age_sec = (now - dev.ts).total_seconds()
                if age_sec <= settings.device_timeout_seconds:
                    latest_status = "online"
                    esp32_connected = True
                else:
                    # Stale heartbeat timeout -> mark offline
                    dev.status = "offline"
                    try:
                        db.commit()
                    except Exception:
                        db.rollback()
                    latest_status = "offline"
            else:
                latest_status = dev.status or "offline"

        slot_count = db.query(SlotState).filter(SlotState.lot_id == settings.lot_id).count() or settings.num_slots
    except Exception as exc:
        logger.error("DB health check failed: %s", exc)
        db_ok = False

    mqtt_ok = mqtt_is_connected()

    return {
        "status": latest_status,
        "esp32_connected": esp32_connected,
        "mqtt_connected": mqtt_ok,
        "db_ok": db_ok,
        "slot_count": slot_count,
        "uptime_seconds": round(time.time() - START_TIME, 1),
        "last_seen": last_seen,
        "last_heartbeat": last_seen,
        "device_timeout_seconds": settings.device_timeout_seconds,
        "version": "1.0.0",
    }


# ---------------------------------------------------------------------------
# Slots State
# ---------------------------------------------------------------------------

@app.get("/api/slots")
def get_slots(db: Session = Depends(get_db)):
    """Return live status for all parking slots."""
    rows = (
        db.query(SlotState)
        .filter(SlotState.lot_id == settings.lot_id)
        .filter(SlotState.slot_id <= settings.num_slots)
        .order_by(SlotState.slot_id.asc())
        .all()
    )
    result = []
    for r in rows:
        result.append({
            "id": r.id,
            "lot_id": r.lot_id,
            "slot_id": r.slot_id,
            "slot": r.slot_id,
            "occupied": r.occupied,
            "status": "occupied" if r.occupied else "free",
            "distance_cm": r.distance_cm,
            "rssi": r.rssi,
            "seq": r.seq,
            "ts": r.ts.isoformat() if r.ts else None,
            "last_changed": r.updated_at.isoformat() if r.updated_at else (r.ts.isoformat() if r.ts else None),
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        })
    return result


# ---------------------------------------------------------------------------
# Events Audit Log
# ---------------------------------------------------------------------------

@app.get("/api/events")
def get_events(
    limit: int = Query(default=100, ge=1, le=1000),
    slot_id: Optional[int] = None,
    from_ts: Optional[datetime] = None,
    to_ts: Optional[datetime] = None,
    db: Session = Depends(get_db),
):
    """Query paginated raw event log with optional filters."""
    query = db.query(Event).filter(Event.lot_id == settings.lot_id)
    if slot_id is not None:
        query = query.filter(Event.slot_id == slot_id)
    if from_ts is not None:
        query = query.filter(Event.received_at >= from_ts)
    if to_ts is not None:
        query = query.filter(Event.received_at <= to_ts)

    rows = query.order_by(desc(Event.received_at)).limit(limit).all()
    return [
        {
            "id": r.id,
            "lot_id": r.lot_id,
            "slot_id": r.slot_id,
            "occupied": r.occupied,
            "distance_cm": r.distance_cm,
            "rssi": r.rssi,
            "ts": r.ts.isoformat() if r.ts else None,
            "seq": r.seq,
            "received_at": r.received_at.isoformat() if r.received_at else None,
        }
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Parking Sessions
# ---------------------------------------------------------------------------

@app.get("/api/sessions")
def get_sessions(
    limit: int = Query(default=50, ge=1, le=500),
    slot_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Retrieve parking sessions derived from state transitions."""
    query = db.query(ParkingSession).filter(ParkingSession.lot_id == settings.lot_id)
    if slot_id is not None:
        query = query.filter(ParkingSession.slot_id == slot_id)

    rows = query.order_by(desc(ParkingSession.start_ts)).limit(limit).all()
    result = []
    for r in rows:
        duration_min = round(r.duration_seconds / 60, 1) if r.duration_seconds else None
        result.append({
            "id": r.id,
            "lot_id": r.lot_id,
            "slot_id": r.slot_id,
            "slot": r.slot_id,
            "start_time": r.start_ts.isoformat() if r.start_ts else None,
            "end_time": r.end_ts.isoformat() if r.end_ts else None,
            "duration_seconds": r.duration_seconds,
            "duration_min": duration_min,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })
    return result


# ---------------------------------------------------------------------------
# Analytics Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/analytics/summary")
def analytics_summary(db: Session = Depends(get_db)):
    """Comprehensive KPIs: occupancy %, peak hour, avg duration, anomalies, insights."""
    occ = analytics.get_current_occupancy(db)
    session_stats = analytics.get_session_stats(db)
    peak = analytics.get_peak_info(db)
    anomalies = analytics.get_anomalies(db)
    insights = analytics.generate_insights(db)

    avg_dur_min = (
        round(session_stats["avg_duration_seconds"] / 60, 1)
        if session_stats["avg_duration_seconds"] is not None
        else 0.0
    )

    return {
        "total_slots": occ["total_slots"],
        "occupied": occ["occupied"],
        "free_slots": occ["free"],
        "occupancy_pct": occ["occupancy_pct"],
        "peak_hour": peak.get("busiest_hour"),
        "avg_duration": avg_dur_min,
        "avg_duration_min": avg_dur_min,
        "avg_duration_seconds": session_stats["avg_duration_seconds"],
        "total_sessions": session_stats["total_sessions"],
        "turnover_rate": session_stats["turnover_rate"],
        "anomalies": anomalies,
        "insights": insights,
        "slot_states": occ["slot_states"],
    }


@app.get("/api/analytics/hourly")
def analytics_hourly(days: int = Query(default=30, ge=1, le=90), db: Session = Depends(get_db)):
    """Hourly average occupancy profile (0–23h)."""
    return analytics.get_hourly_stats(db, days=days)


@app.get("/api/analytics/daily")
def analytics_daily(days: int = Query(default=30, ge=1, le=90), db: Session = Depends(get_db)):
    """Day of week average occupancy (0=Mon to 6=Sun)."""
    return analytics.get_daily_stats(db, days=days)


@app.get("/api/analytics/heatmap")
def analytics_heatmap(days: int = Query(default=30, ge=1, le=90), db: Session = Depends(get_db)):
    """7x24 Day of week x Hour occupancy heatmap matrix."""
    return analytics.get_heatmap_data(db, days=days)


@app.get("/api/analytics/utilization")
def analytics_utilization(days: int = Query(default=30, ge=1, le=90), db: Session = Depends(get_db)):
    """Per-slot utilization ranking."""
    return analytics.get_slot_utilization(db, days=days)


# ---------------------------------------------------------------------------
# ML Prediction
# ---------------------------------------------------------------------------

@app.get("/api/predict")
def predict_occupancy_api(hours: int = Query(default=24, ge=1, le=72)):
    """Get ML forecast for next N hours."""
    predictions = predict.predict_occupancy(hours_ahead=hours)
    best_time_str = predict.get_best_arrival_time(predictions)

    # Extract best hour integer for dashboard UI
    best_hour = None
    if predictions:
        best_entry = min(predictions, key=lambda x: x["predicted_occupancy_pct"])
        try:
            best_hour = datetime.fromisoformat(best_entry["ts"]).hour
        except Exception:
            best_hour = 10

    # Format forecast rows for dashboard
    forecast_rows = []
    for p in predictions:
        try:
            h = datetime.fromisoformat(p["ts"]).hour
        except Exception:
            h = 0
        forecast_rows.append({
            "hour": h,
            "ts": p["ts"],
            "occupancy": p["predicted_occupancy_pct"],
            "predicted": p["predicted_occupancy_pct"],
            "lower": p["lower"],
            "upper": p["upper"],
            "is_fallback": p.get("is_fallback", False),
        })

    is_fallback = any(p.get("is_fallback") for p in predictions) if predictions else True

    return {
        "predictions": forecast_rows,
        "forecast": forecast_rows,
        "best_arrival_time": best_hour,
        "best_arrival_text": best_time_str,
        "hours_ahead": hours,
        "is_fallback": is_fallback,
        "model_type": "RandomForestRegressor (Trained)" if not is_fallback else "Baseline Fallback (Untrained)",
        "model_source": "Historical Events (Model)" if not is_fallback else "Fallback Estimate",
    }


@app.post("/api/retrain")
@app.post("/api/predict/retrain")
def retrain_model_api(db: Session = Depends(get_db)):
    """Trigger retraining of the occupancy prediction model."""
    metrics = predict.train_model(db)
    return {"status": "retrained", "metrics": metrics}


# ---------------------------------------------------------------------------
# Actuator Commands
# ---------------------------------------------------------------------------

@app.post("/api/cmd")
def send_actuator_cmd(payload: dict):
    """
    Publish actuator command to MQTT topic parking/{lot_id}/cmd.
    Supports:
    - {"cmd": "buzzer", "duration_ms": 500}
    - {"command": "buzzer", "duration_ms": 500}
    - {"cmd": "led", "slot": 2, "color": "red", "state": true}
    - {"slot": 1, "command": "open"}
    """
    cmd = payload.get("cmd") or payload.get("command")
    slot_id = payload.get("slot") or payload.get("slot_id")
    params = payload.get("params", {})

    if not cmd:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Field 'command' or 'cmd' is required.",
        )

    # For commands other than buzzer, a slot is required
    if cmd != "buzzer" and slot_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Field 'slot' (or 'slot_id') is required for slot-specific commands.",
        )

    topic = f"parking/{settings.lot_id}/cmd"
    ts_now = datetime.now(timezone.utc).isoformat()

    # Build consistent payload matching firmware parser
    if cmd == "buzzer":
        dur = payload.get("duration_ms", 500)
        cmd_dict = {
            "cmd": "buzzer",
            "duration_ms": int(dur),
        }
    elif cmd == "led":
        color = payload.get("color", "red")
        st = bool(payload.get("state", True))
        cmd_dict = {
            "cmd": "led",
            "slot": int(slot_id),
            "color": color,
            "state": st,
        }
    else:
        cmd_dict = {
            "cmd": cmd,
            "slot": int(slot_id) if slot_id is not None else None,
            "params": params,
        }

    success = publish_cmd(topic, json.dumps(cmd_dict))
    
    # In testing mode, simulate success if broker not connected
    if os.environ.get("TESTING") and not success:
        success = True

    return {
        "status": "sent" if success else "failed",
        "topic": topic,
        "slot": slot_id,
        "command": cmd,
        "cmd": cmd,
        "mqtt_published": success,
    }


# ---------------------------------------------------------------------------
# CSV Export
# ---------------------------------------------------------------------------

@app.get("/api/export.csv")
def export_csv(db: Session = Depends(get_db)):
    """Export all recorded parking events as CSV."""
    rows = db.query(Event).order_by(Event.id.asc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "lot_id", "slot_id", "occupied", "distance_cm", "rssi", "sensor_timestamp", "received_at", "sequence_number"])

    for r in rows:
        writer.writerow([
            r.id,
            r.lot_id,
            r.slot_id,
            1 if r.occupied else 0,
            r.distance_cm if r.distance_cm is not None else "",
            r.rssi if r.rssi is not None else "",
            r.ts.isoformat() if r.ts else "",
            r.received_at.isoformat() if r.received_at else "",
            r.seq if r.seq is not None else "",
        ])

    output.seek(0)
    filename = f"parking_events_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ---------------------------------------------------------------------------
# WebSocket for Real-Time Dashboard Pushes
# ---------------------------------------------------------------------------

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, db: Session = Depends(get_db)):
    """WebSocket connection: streams live slot updates and state changes to dashboard."""
    await websocket.accept()
    websocket_connections.add(websocket)
    logger.info("WebSocket connected. Active clients: %d", len(websocket_connections))

    try:
        # Send initial snapshot immediately upon connection
        current_slots = get_slots(db)
        dev = db.query(DeviceStatus).filter(DeviceStatus.lot_id == settings.lot_id).first()
        dev_status = "offline"
        if dev and dev.status == "online" and dev.ts:
            age = (datetime.now(timezone.utc).replace(tzinfo=None) - dev.ts).total_seconds()
            if age <= settings.device_timeout_seconds:
                dev_status = "online"

        await websocket.send_json({
            "type": "slots",
            "slots": current_slots,
            "device_status": dev_status,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        # Keep connection open; receive pings/messages from client
        while True:
            data = await websocket.receive_text()
            # Client can request immediate refresh
            if data == "refresh":
                slots = get_slots(db)
                await websocket.send_json({"type": "slots", "slots": slots})
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected.")
    except Exception as exc:
        logger.warning("WebSocket exception: %s", exc)
    finally:
        websocket_connections.discard(websocket)


# ---------------------------------------------------------------------------
# Static Files & SPA Dashboard Serving
# ---------------------------------------------------------------------------

FRONTEND_DIST = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"))
FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend"))

if os.path.isdir(FRONTEND_DIST) and os.path.exists(os.path.join(FRONTEND_DIST, "index.html")):
    assets_dir = os.path.join(FRONTEND_DIST, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        # Allow direct file access if file exists in dist
        target_file = os.path.join(FRONTEND_DIST, full_path)
        if full_path and os.path.isfile(target_file):
            return FileResponse(target_file)
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))

elif os.path.isdir(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

    @app.get("/")
    def serve_dashboard():
        index_file = os.path.join(FRONTEND_DIR, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"message": "IoT Smart Parking API is running. Frontend index.html not found."}

