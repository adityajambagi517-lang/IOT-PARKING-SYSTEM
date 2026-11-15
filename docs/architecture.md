# System Architecture & Technical Specifications
**Project:** IoT-Based Smart Parking Occupancy Monitoring and Usage Pattern Analysis System  
**Course:** UE23CS342AA3 (Jackfruit Problem)  

---

## 1. High-Level System Block Diagram

```mermaid
flowchart TD
    subgraph Sensing & Edge Layer
        S1["HC-SR04 Slot 1"] -->|Echo/Trig| ESP["ESP32 DevKit V1"]
        S2["HC-SR04 Slot 2"] -->|Echo/Trig| ESP
        S3["HC-SR04 Slot 3"] -->|Echo/Trig| ESP
        S4["HC-SR04 Slot 4"] -->|Echo/Trig| ESP
        ESP -->|Digital Out| LED["8x LEDs (Red/Green)"]
        ESP -->|I2C| OLED["SSD1306 OLED (Optional)"]
        ESP -->|PWM| BUZ["Piezo Buzzer"]
    end

    subgraph Simulation Alternative
        SIM["Python Simulator<br/>(simulate.py)"]
    end

    subgraph Telemetry & Broker Layer
        ESP -->|MQTT / WiFi QoS 1| BRK["Mosquitto MQTT Broker<br/>Port 1883"]
        SIM -.->|MQTT QoS 1| BRK
    end

    subgraph Backend & Analytics Pipeline
        BRK -->|paho-mqtt subscribe<br/>parking/#| BE["FastAPI Backend<br/>(Python 3.11)"]
        BE -->|Pydantic Validation| VAL["Payload Validator"]
        VAL -->|SQLAlchemy ORM| DB[("SQLite Database<br/>parking.db")]
        DB --> ANL["Pandas Analytics Engine"]
        DB --> ML["Scikit-Learn ML Model<br/>(RandomForestRegressor)"]
    end

    subgraph Presentation & UI Layer
        BE -->|WebSocket Push /ws| DASH["Live SPA Dashboard<br/>(Vanilla HTML/JS + Chart.js)"]
        BE -->|REST API /api/*| DASH
    end
```

---

## 2. End-to-End Data Flow Diagram

```mermaid
flowchart LR
    US["HC-SR04 Pulse"] -->|Echo Time| MED["5-Sample Median Filter"]
    MED -->|Filtered Distance| DEB["Debounce Logic<br/>(3 Consecutive Hits)"]
    DEB -->|State Flip?| LEDS["Local LED Update<br/>(Red/Green)"]
    DEB -->|JSON Serializer| JSON["Construct Payload<br/>lot, slot, ts, dist, seq, rssi"]
    JSON -->|MQTT Publish| PUB["Topic: parking/A/slot/{id}/state<br/>QoS 1, Retained"]
    PUB --> MOSQ["Eclipse Mosquitto"]
    MOSQ --> SUB["FastAPI paho Thread"]
    SUB --> PYD["Pydantic Schema Check"]
    PYD --> LOG["Insert Event Log"]
    LOG --> SESS["Derive Parking Session<br/>(Compute duration on exit)"]
    SESS --> WS["Broadcast via WebSocket"]
    WS --> UI["Update Slot Card & Charts"]
```

---

## 3. Sequence Diagram: Slot State Transition & WebSocket Broadcast

```mermaid
sequenceDiagram
    autonumber
    participant Sensor as HC-SR04 / Car
    participant ESP as ESP32 Firmware
    participant Broker as Mosquitto MQTT
    participant Backend as FastAPI Backend
    participant DB as SQLite DB
    participant UI as Browser Dashboard

    Sensor->>ESP: Car enters slot (distance < 20cm)
    Note over ESP: Median filter 5 samples<br/>Debounce 3 consecutive readings
    ESP->>ESP: Set Green LED OFF, Red LED ON
    ESP->>Broker: PUBLISH parking/A/slot/1/state (QoS 1, Retain=true)<br/>{"lot":"A","slot":1,"occupied":true,"distance_cm":14.2,"ts":"...","seq":42}
    Broker-->>ESP: PUBACK (QoS 1 Acknowledgment)
    Broker->>Backend: DELIVER message (parking/# subscription)
    Backend->>Backend: Validate payload via SlotPayload schema
    Backend->>DB: Upsert SlotState (slot_id=1, occupied=true)
    Backend->>DB: Insert Event record
    Backend->>DB: Insert new ParkingSession (start_ts=now, end_ts=null)
    Backend->>UI: WebSocket Broadcast (type: "slots", slot_id=1, occupied=true)
    Note over UI: Slot 1 card turns red<br/>Duration counter starts<br/>KPI Occupancy increments
```

---

## 4. Database Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    SLOT_STATE {
        int id PK
        string lot_id
        int slot_id
        boolean occupied
        float distance_cm
        int rssi
        datetime ts
        int seq
        datetime updated_at
    }

    EVENT {
        int id PK
        string lot_id
        int slot_id
        boolean occupied
        float distance_cm
        int rssi
        datetime ts
        int seq
        datetime received_at
    }

    PARKING_SESSION {
        int id PK
        string lot_id
        int slot_id
        datetime start_ts
        datetime end_ts
        float duration_seconds
        datetime created_at
    }

    DEVICE_STATUS {
        int id PK
        string lot_id UK
        string status
        datetime ts
    }

    SLOT_STATE ||--o{ EVENT : "records history in"
    SLOT_STATE ||--o{ PARKING_SESSION : "tracks intervals in"
    DEVICE_STATUS ||--o{ SLOT_STATE : "manages slots of"
```

---

## 5. MQTT Topic Hierarchy & Routing Architecture

```mermaid
flowchart TD
    ROOT["parking/"]
    LOT["{lot_id} (e.g., 'A')"]
    ROOT --> LOT

    SLOT_ROOT["slot/"]
    DEV_ROOT["device/"]
    CMD_ROOT["cmd"]

    LOT --> SLOT_ROOT
    LOT --> DEV_ROOT
    LOT --> CMD_ROOT

    SLOT_ID["{slot_id} (1 to 4)"]
    SLOT_ROOT --> SLOT_ID

    STATE["state<br/><i>Payload: JSON {lot, slot, occupied, distance_cm, ts, seq, rssi}<br/>QoS 1, Retained=True</i>"]
    SLOT_ID --> STATE

    STATUS["status<br/><i>Payload: 'online' / 'offline'<br/>QoS 1, Retained=True, LWT configured</i>"]
    DEV_ROOT --> STATUS

    CMD_DESC["<i>Payload: JSON {slot, command, params}<br/>Used for remote gate or LED actuators</i>"]
    CMD_ROOT --> CMD_DESC
```

