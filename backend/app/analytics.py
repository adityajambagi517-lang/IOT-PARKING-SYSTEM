"""
Analytics functions for the Smart Parking backend.

All functions accept a SQLAlchemy Session and return plain Python dicts/lists
so they can be serialised directly by FastAPI.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from .config import settings
from .models import Event, ParkingSession, SlotState

logger = logging.getLogger(__name__)

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _events_df(db: Session, days: int = 30) -> pd.DataFrame:
    """Load recent events into a DataFrame."""
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    rows = (
        db.query(Event)
        .filter(Event.received_at >= cutoff)
        .order_by(Event.received_at.asc())
        .all()
    )
    if not rows:
        return pd.DataFrame()
    data = [
        {
            "slot_id": r.slot_id,
            "occupied": int(r.occupied),
            "ts": r.ts or r.received_at,
            "received_at": r.received_at,
        }
        for r in rows
    ]
    df = pd.DataFrame(data)
    df["ts"] = pd.to_datetime(df["ts"])
    return df


def _sessions_df(db: Session) -> pd.DataFrame:
    """Load all closed sessions into a DataFrame."""
    rows = (
        db.query(ParkingSession)
        .filter(ParkingSession.end_ts.isnot(None))
        .all()
    )
    if not rows:
        return pd.DataFrame()
    data = [
        {
            "slot_id": r.slot_id,
            "start_ts": r.start_ts,
            "end_ts": r.end_ts,
            "duration_seconds": r.duration_seconds or 0,
        }
        for r in rows
    ]
    df = pd.DataFrame(data)
    df["start_ts"] = pd.to_datetime(df["start_ts"])
    df["end_ts"] = pd.to_datetime(df["end_ts"])
    return df


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_current_occupancy(db: Session) -> dict:
    """Return real-time occupancy from the SlotState table."""
    rows = (
        db.query(SlotState)
        .filter(SlotState.lot_id == settings.lot_id)
        .filter(SlotState.slot_id <= settings.num_slots)
        .all()
    )
    total = settings.num_slots
    occupied_count = sum(1 for r in rows if r.occupied)
    free_count = total - occupied_count
    pct = round(occupied_count / total * 100, 1) if total else 0.0
    slot_states = [
        {
            "id": r.id,
            "lot_id": r.lot_id,
            "slot_id": r.slot_id,
            "occupied": r.occupied,
            "distance_cm": r.distance_cm,
            "rssi": r.rssi,
            "ts": r.ts.isoformat() if r.ts else None,
            "seq": r.seq,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in rows
    ]
    return {
        "total_slots": total,
        "occupied": occupied_count,
        "free": free_count,
        "occupancy_pct": pct,
        "slot_states": slot_states,
    }


def get_hourly_stats(db: Session, days: int = 30) -> list:
    """Average occupancy percentage per hour of day (0-23)."""
    df = _events_df(db, days=days)
    if df.empty:
        return []
    df["hour"] = df["ts"].dt.hour
    grouped = df.groupby("hour")["occupied"].agg(["mean", "count"]).reset_index()
    grouped.columns = ["hour", "mean_occ", "count"]
    result = []
    for _, row in grouped.iterrows():
        result.append({
            "hour": int(row["hour"]),
            "avg_occupancy_pct": round(float(row["mean_occ"]) * 100, 1),
            "sample_count": int(row["count"]),
        })
    # Fill missing hours with zeros
    present = {r["hour"] for r in result}
    for h in range(24):
        if h not in present:
            result.append({"hour": h, "avg_occupancy_pct": 0.0, "sample_count": 0})
    result.sort(key=lambda x: x["hour"])
    return result


def get_daily_stats(db: Session, days: int = 30) -> list:
    """Average occupancy percentage per day of week (0=Mon, 6=Sun)."""
    df = _events_df(db, days=days)
    if df.empty:
        return []
    df["dow"] = df["ts"].dt.dayofweek
    grouped = df.groupby("dow")["occupied"].agg(["mean", "count"]).reset_index()
    grouped.columns = ["dow", "mean_occ", "count"]
    result = []
    for _, row in grouped.iterrows():
        dow = int(row["dow"])
        result.append({
            "day_of_week": dow,
            "day_name": DAY_NAMES[dow],
            "avg_occupancy_pct": round(float(row["mean_occ"]) * 100, 1),
            "sample_count": int(row["count"]),
        })
    present = {r["day_of_week"] for r in result}
    for d in range(7):
        if d not in present:
            result.append({
                "day_of_week": d,
                "day_name": DAY_NAMES[d],
                "avg_occupancy_pct": 0.0,
                "sample_count": 0,
            })
    result.sort(key=lambda x: x["day_of_week"])
    return result


def get_heatmap_data(db: Session, days: int = 30) -> list:
    """Return a 7×24 matrix of avg occupancy (day_of_week × hour)."""
    df = _events_df(db, days=days)
    if df.empty:
        return [[0.0] * 24 for _ in range(7)]
    df["hour"] = df["ts"].dt.hour
    df["dow"] = df["ts"].dt.dayofweek
    pivot = df.groupby(["dow", "hour"])["occupied"].mean().unstack(fill_value=0)
    # Ensure all 7 days and 24 hours are present
    pivot = pivot.reindex(index=range(7), columns=range(24), fill_value=0)
    matrix = []
    for d in range(7):
        row = [round(float(pivot.loc[d, h]) * 100, 1) for h in range(24)]
        matrix.append(row)
    return matrix


def get_session_stats(db: Session) -> dict:
    """Return aggregate session statistics."""
    df = _sessions_df(db)
    if df.empty:
        return {
            "total_sessions": 0,
            "avg_duration_seconds": None,
            "min_duration_seconds": None,
            "max_duration_seconds": None,
            "turnover_rate": None,
        }
    durations = df["duration_seconds"]
    total = len(df)
    # Turnover rate: sessions per slot per day (approximation)
    days_span = max(
        (df["end_ts"].max() - df["start_ts"].min()).total_seconds() / 86400, 1
    )
    turnover = round(total / (settings.num_slots * days_span), 2)
    return {
        "total_sessions": total,
        "avg_duration_seconds": round(float(durations.mean()), 1),
        "min_duration_seconds": round(float(durations.min()), 1),
        "max_duration_seconds": round(float(durations.max()), 1),
        "turnover_rate": turnover,
    }


def get_slot_utilization(db: Session, days: int = 30) -> list:
    """Per-slot: total sessions, avg duration, utilization %, rank."""
    df = _sessions_df(db)
    if df.empty:
        df_ev = _events_df(db, days=days)
        if not df_ev.empty:
            grouped = df_ev.groupby("slot_id")["occupied"].mean().reset_index()
            grouped.columns = ["slot_id", "utilization_pct"]
            grouped["utilization_pct"] = grouped["utilization_pct"] * 100
            grouped = grouped.sort_values("utilization_pct", ascending=False).reset_index(drop=True)
            return [
                {
                    "slot_id": int(r["slot_id"]),
                    "total_sessions": 0,
                    "avg_duration_seconds": 0.0,
                    "utilization_pct": round(float(r["utilization_pct"]), 1),
                    "rank": i + 1,
                }
                for i, r in grouped.iterrows()
            ]
        return []
    grouped = df.groupby("slot_id").agg(
        total_sessions=("duration_seconds", "count"),
        avg_duration=("duration_seconds", "mean"),
    ).reset_index()

    total_seconds = days * 86400
    grouped["utilization_pct"] = grouped["avg_duration"] * grouped["total_sessions"] / total_seconds * 100
    grouped["utilization_pct"] = grouped["utilization_pct"].clip(0, 100)
    grouped = grouped.sort_values("utilization_pct", ascending=False).reset_index(drop=True)
    result = []
    for rank, (_, row) in enumerate(grouped.iterrows(), start=1):
        result.append({
            "slot_id": int(row["slot_id"]),
            "total_sessions": int(row["total_sessions"]),
            "avg_duration_seconds": round(float(row["avg_duration"]), 1),
            "utilization_pct": round(float(row["utilization_pct"]), 1),
            "rank": rank,
        })
    return result


def get_peak_info(db: Session, days: int = 30) -> dict:
    """Busiest hour, busiest day, quietest hour."""
    hourly = get_hourly_stats(db, days=days)
    daily = get_daily_stats(db, days=days)
    if not hourly or not daily:
        return {"busiest_hour": None, "quietest_hour": None, "busiest_day": None}
    busiest_h = max(hourly, key=lambda x: x["avg_occupancy_pct"])
    quietest_h = min(hourly, key=lambda x: x["avg_occupancy_pct"])
    busiest_d = max(daily, key=lambda x: x["avg_occupancy_pct"])
    return {
        "busiest_hour": busiest_h["hour"],
        "busiest_hour_pct": busiest_h["avg_occupancy_pct"],
        "quietest_hour": quietest_h["hour"],
        "quietest_hour_pct": quietest_h["avg_occupancy_pct"],
        "busiest_day": busiest_d["day_name"],
        "busiest_day_pct": busiest_d["avg_occupancy_pct"],
    }


def get_anomalies(db: Session) -> list:
    """
    Detect:
    - Slots occupied for >4 hours (open sessions still running).
    - Slots flapping: >5 state changes in the last 1 hour.
    """
    anomalies = []
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Long-occupancy: open sessions older than 4 h OR closed sessions with duration > 4h (14400s)
    threshold = now - timedelta(hours=4)
    long_open_sessions = (
        db.query(ParkingSession)
        .filter(
            ParkingSession.end_ts.is_(None),
            ParkingSession.start_ts <= threshold,
        )
        .all()
    )
    for s in long_open_sessions:
        duration_h = (now - s.start_ts).total_seconds() / 3600
        anomalies.append({
            "type": "long_occupancy",
            "slot_id": s.slot_id,
            "lot_id": s.lot_id,
            "duration_hours": round(duration_h, 1),
            "since": s.start_ts.isoformat(),
        })

    long_closed_sessions = (
        db.query(ParkingSession)
        .filter(
            ParkingSession.duration_seconds >= 4 * 3600,
        )
        .all()
    )
    for s in long_closed_sessions:
        if not any(a.get("slot_id") == s.slot_id and a.get("type") == "long_occupancy" for a in anomalies):
            anomalies.append({
                "type": "long_occupancy",
                "slot_id": s.slot_id,
                "lot_id": s.lot_id,
                "duration_hours": round((s.duration_seconds or 0) / 3600, 1),
                "since": s.start_ts.isoformat() if s.start_ts else "",
            })

    # Flapping: >5 events in last 1 hour
    cutoff = now - timedelta(hours=1)
    rows = (
        db.query(Event.slot_id, Event.lot_id)
        .filter(Event.received_at >= cutoff)
        .all()
    )
    if rows:
        df = pd.DataFrame(rows, columns=["slot_id", "lot_id"])
        counts = df.groupby("slot_id").size()
        for slot_id, count in counts.items():
            if count > 5:
                lot_id = df[df["slot_id"] == slot_id]["lot_id"].iloc[0]
                anomalies.append({
                    "type": "flapping",
                    "slot_id": int(slot_id),
                    "lot_id": lot_id,
                    "changes_last_hour": int(count),
                })
    return anomalies


def generate_insights(db: Session) -> list[str]:
    """Return plain-English insight strings."""
    insights: list[str] = []

    occ = get_current_occupancy(db)
    insights.append(
        f"Current occupancy is {occ['occupied']}/{occ['total_slots']} slots ({occ['occupancy_pct']}%)."
    )

    peak = get_peak_info(db)
    if peak["busiest_hour"] is not None:
        h = peak["busiest_hour"]
        label = f"{h % 12 or 12} {'AM' if h < 12 else 'PM'}"
        insights.append(
            f"Peak occupancy is around {label} ({peak['busiest_hour_pct']}% avg)."
        )
    if peak["busiest_day"]:
        insights.append(
            f"Busiest day is {peak['busiest_day']} ({peak['busiest_day_pct']}% avg)."
        )
    if peak["quietest_hour"] is not None:
        h = peak["quietest_hour"]
        label = f"{h % 12 or 12} {'AM' if h < 12 else 'PM'}"
        insights.append(f"Quietest period is around {label}.")

    util = get_slot_utilization(db)
    if util:
        top = util[0]
        insights.append(
            f"Slot {top['slot_id']} has the highest utilization at {top['utilization_pct']}%."
        )

    sess = get_session_stats(db)
    if sess["avg_duration_seconds"] is not None:
        mins = round(sess["avg_duration_seconds"] / 60)
        insights.append(f"Average parking duration is {mins} minutes.")
    if sess["turnover_rate"] is not None:
        insights.append(
            f"Average turnover rate is {sess['turnover_rate']} sessions per slot per day."
        )

    anomalies = get_anomalies(db)
    if anomalies:
        types = set(a["type"] for a in anomalies)
        if "long_occupancy" in types:
            long_count = sum(1 for a in anomalies if a["type"] == "long_occupancy")
            insights.append(
                f"{long_count} slot(s) have been occupied for more than 4 hours — possible sensor fault."
            )
        if "flapping" in types:
            flap_count = sum(1 for a in anomalies if a["type"] == "flapping")
            insights.append(
                f"{flap_count} slot(s) are reporting rapid state changes — check sensor stability."
            )

    return insights


# Backwards-compatible aliases
get_slot_utilization_ranking = get_slot_utilization
detect_anomalies = get_anomalies
