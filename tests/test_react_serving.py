import os
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

@pytest.fixture
def client():
    return TestClient(app)

def test_react_spa_serving(client):
    """Verify that root / and SPA routes return the React index.html."""
    res = client.get("/")
    assert res.status_code == 200
    assert "ParkPulse IoT" in res.text
    assert '<div id="root"></div>' in res.text

def test_api_routes_unaffected(client):
    """Verify that API endpoints still return JSON and are not intercepted by the SPA fallback."""
    res = client.get("/api/slots")
    assert res.status_code == 200
    assert isinstance(res.json(), list)

    res_health = client.get("/api/health")
    assert res_health.status_code == 200
    assert "slot_count" in res_health.json()

def test_spa_client_side_routing(client):
    """Verify that routes like /live or /analytics serve the index.html for client-side navigation."""
    res = client.get("/live")
    assert res.status_code == 200
    assert '<div id="root"></div>' in res.text
