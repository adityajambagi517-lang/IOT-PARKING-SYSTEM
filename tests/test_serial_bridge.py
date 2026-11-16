import json
import pytest
from backend.scripts.serial_bridge import ParkingSerialBridge
from backend.app.schemas import SlotPayload

class MockMqttClient:
    def __init__(self):
        self.published = []

    def publish(self, topic, payload, qos=1, retain=False):
        self.published.append((topic, json.loads(payload) if isinstance(payload, str) else payload))


def test_bridge_json_parsing():
    bridge = ParkingSerialBridge(port="TEST", lot_id="A")
    bridge.mqtt_client = MockMqttClient()

    # Feed machine-readable JSON line
    raw_json = '{"s1":{"d":8.5,"occ":true},"s2":{"d":150.0,"occ":false}}'
    bridge.parse_line(raw_json)

    assert len(bridge.mqtt_client.published) == 2
    t1, p1 = bridge.mqtt_client.published[0]
    t2, p2 = bridge.mqtt_client.published[1]

    # Check Topic 1
    assert t1 == "parking/A/slot/1/state"
    assert p1["slot"] == 1
    assert p1["occupied"] is True
    assert p1["distance_cm"] == 8.5
    assert p1["lot"] == "A"
    # Must pass Pydantic SlotPayload validation
    SlotPayload(**p1)

    # Check Topic 2
    assert t2 == "parking/A/slot/2/state"
    assert p2["slot"] == 2
    assert p2["occupied"] is False
    assert p2["distance_cm"] == 150.0
    SlotPayload(**p2)


def test_bridge_text_fallback_parsing():
    bridge = ParkingSerialBridge(port="TEST", lot_id="A")
    bridge.mqtt_client = MockMqttClient()

    # Feed legacy text line
    bridge.parse_line("Slot 1: OCCUPIED | Distance: 7.20 cm")
    bridge.parse_line("Slot 2: FREE | Distance: 120.50 cm")

    assert len(bridge.mqtt_client.published) == 2
    t1, p1 = bridge.mqtt_client.published[0]
    t2, p2 = bridge.mqtt_client.published[1]

    assert t1 == "parking/A/slot/1/state"
    assert p1["slot"] == 1
    assert p1["occupied"] is True
    assert p1["distance_cm"] == 7.2
    SlotPayload(**p1)

    assert t2 == "parking/A/slot/2/state"
    assert p2["slot"] == 2
    assert p2["occupied"] is False
    assert p2["distance_cm"] == 120.5
    SlotPayload(**p2)


def test_bridge_heartbeat():
    bridge = ParkingSerialBridge(port="TEST", lot_id="A")
    bridge.mqtt_client = MockMqttClient()

    bridge.publish_heartbeat("online")
    assert len(bridge.mqtt_client.published) == 1
    t, p = bridge.mqtt_client.published[0]
    assert t == "parking/A/device/status"
    assert p["status"] == "online"
    assert "ts" in p
