from sqlalchemy import (
    Column, Integer, String, Boolean, Float, DateTime, func
)
from .db import Base


class SlotState(Base):
    """Current (latest) state of each parking slot — one row per slot."""
    __tablename__ = "slot_states"

    id = Column(Integer, primary_key=True, index=True)
    lot_id = Column(String, nullable=False, index=True)
    slot_id = Column(Integer, nullable=False, index=True)
    occupied = Column(Boolean, nullable=False, default=False)
    distance_cm = Column(Float, nullable=True)
    rssi = Column(Integer, nullable=True)
    ts = Column(DateTime, nullable=True)          # sensor timestamp
    seq = Column(Integer, nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Event(Base):
    """Every MQTT state message received — full audit log."""
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    lot_id = Column(String, nullable=False, index=True)
    slot_id = Column(Integer, nullable=False, index=True)
    occupied = Column(Boolean, nullable=False)
    distance_cm = Column(Float, nullable=True)
    rssi = Column(Integer, nullable=True)
    ts = Column(DateTime, nullable=True)          # sensor timestamp
    seq = Column(Integer, nullable=True)
    received_at = Column(DateTime, server_default=func.now())


class ParkingSession(Base):
    """A contiguous occupied interval for a slot."""
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    lot_id = Column(String, nullable=False, index=True)
    slot_id = Column(Integer, nullable=False, index=True)
    start_ts = Column(DateTime, nullable=False)
    end_ts = Column(DateTime, nullable=True)       # None = still open
    duration_seconds = Column(Float, nullable=True)  # computed on close
    created_at = Column(DateTime, server_default=func.now())


class DeviceStatus(Base):
    """Latest device heartbeat / LWT status per lot."""
    __tablename__ = "device_status"

    id = Column(Integer, primary_key=True, index=True)
    lot_id = Column(String, nullable=False, index=True, unique=True)
    status = Column(String, nullable=False, default="offline")  # "online" | "offline"
    ts = Column(DateTime, server_default=func.now())
