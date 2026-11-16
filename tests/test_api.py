"""
Integration tests for FastAPI REST endpoints.
"""

import pytest
from fastapi.testclient import TestClient


def test_health_endpoint(client: TestClient):
    """GET /api/health returns 200 with health metadata."""
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert "status" in data
    assert "db_ok" in data
    assert "mqtt_connected" in data
    assert "slot_count" in data
    assert "uptime_seconds" in data


def test_slots_endpoint(client: TestClient):
    """GET /api/slots returns a list of slot states."""
    res = client.get("/api/slots")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)


def test_events_endpoint(client: TestClient):
    """GET /api/events returns paginated event log."""
    res = client.get("/api/events?limit=10")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)


def test_sessions_endpoint(client: TestClient):
    """GET /api/sessions returns parking sessions."""
    res = client.get("/api/sessions?limit=10")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)


def test_analytics_summary(client: TestClient):
    """GET /api/analytics/summary returns KPI overview."""
    res = client.get("/api/analytics/summary")
    assert res.status_code == 200
    data = res.json()
    assert "occupancy_pct" in data
    assert "total_slots" in data
    assert "insights" in data
    assert "anomalies" in data


def test_analytics_hourly(client: TestClient):
    """GET /api/analytics/hourly returns hourly stats."""
    res = client.get("/api/analytics/hourly")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)


def test_analytics_daily(client: TestClient):
    """GET /api/analytics/daily returns daily stats."""
    res = client.get("/api/analytics/daily")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)


def test_analytics_heatmap(client: TestClient):
    """GET /api/analytics/heatmap returns 7x24 matrix."""
    res = client.get("/api/analytics/heatmap")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) == 7
    assert len(data[0]) == 24


def test_predict_endpoint(client: TestClient):
    """GET /api/predict returns forecast and best arrival time."""
    res = client.get("/api/predict?hours=24")
    assert res.status_code == 200
    data = res.json()
    assert "predictions" in data
    assert "forecast" in data
    assert len(data["predictions"]) == 24
    assert "best_arrival_time" in data


def test_export_csv(client: TestClient):
    """GET /api/export.csv returns CSV formatted stream."""
    res = client.get("/api/export.csv")
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    assert "attachment" in res.headers.get("content-disposition", "")


def test_cmd_endpoint(client: TestClient):
    """POST /api/cmd publishes actuator command."""
    res = client.post("/api/cmd", json={"slot": 1, "command": "open", "params": {}})
    assert res.status_code == 200
    data = res.json()
    assert data["slot"] == 1
    assert data["command"] == "open"


def test_cmd_buzzer_endpoint(client: TestClient):
    """POST /api/cmd supports buzzer command without requiring slot."""
    res = client.post("/api/cmd", json={"cmd": "buzzer", "duration_ms": 500})
    assert res.status_code == 200
    data = res.json()
    assert data["cmd"] == "buzzer"
    assert data["status"] in ("sent", "queued_offline")


def test_cmd_led_endpoint(client: TestClient):
    """POST /api/cmd supports LED diagnostic command."""
    res = client.post("/api/cmd", json={"cmd": "led", "slot": 2, "color": "red", "state": True})
    assert res.status_code == 200
    data = res.json()
    assert data["cmd"] == "led"
    assert data["slot"] == 2


def test_invalid_cmd_missing_slot(client: TestClient):
    """POST /api/cmd without slot returns 422 Unprocessable Entity."""
    res = client.post("/api/cmd", json={"command": "open"})
    assert res.status_code == 422


def test_invalid_cmd_missing_command(client: TestClient):
    """POST /api/cmd without command returns 422 Unprocessable Entity."""
    res = client.post("/api/cmd", json={"slot": 1})
    assert res.status_code == 422


