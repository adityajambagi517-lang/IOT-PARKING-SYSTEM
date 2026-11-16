# IoT Smart Parking Occupancy Monitoring & Management System

> **Architecture:** ESP32 DevKit V1 + 4× HC-SR04 Ultrasonic Sensors + MQTT Mosquitto + FastAPI + SQLite + WebSocket + Real-Time Dark Dashboard

![Python 3.11+](https://img.shields.io/badge/Python-3.11%2B-blue?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111%2B-009688?logo=fastapi&logoColor=white)
![MQTT](https://img.shields.io/badge/MQTT-Mosquitto-660066?logo=eclipsemosquitto&logoColor=white)
![Database](https://img.shields.io/badge/Database-SQLite-003B57?logo=sqlite&logoColor=white)
![Charts](https://img.shields.io/badge/UI-Chart.js%204.4-FF6384?logo=chartdotjs&logoColor=white)

---

## 1. System Overview

This enterprise IoT Smart Parking System monitors 4 physical parking bays in real-time. It uses an **ESP32 DevKit V1** microcontroller connected to four **HC-SR04 ultrasonic sensors**, green and red indicator LEDs for each bay, an active audible buzzer for alarm/test signaling, and an optional SSD1306 OLED display.

Telemetry is published over **MQTT (QoS 1)** to an **Eclipse Mosquitto** broker. A **FastAPI** backend ingests and validates the telemetry, updates a persistent **SQLite** database, derives vehicle parking sessions, recalculates analytics, and pushes live state changes over **WebSockets** to a responsive, premium dark-themed dashboard.

```
HC-SR04 Sensors (Bays 1–4)
            ↓ (Trigger / Echo via 3.3V Divider)
      ESP32 DevKit V1
            ↓ (Wi-Fi 2.4 GHz)
  Mosquitto MQTT Broker (Port 1883)
            ↓ (Paho MQTT Client - QoS 1)
     FastAPI Backend (Port 8000)
            ↓ (SQLAlchemy ORM)
      SQLite Database (parking.db)
            ↓ (Async WebSocket Broadcast)
 Smart Parking Dashboard (Single Page App)
```

---

## 2. Key Features

- **Live Bay Monitoring**: Real-time bay occupancy cards with instant visual indicators, distance in centimetres, sequence IDs, and Wi-Fi RSSI.
- **Persistent Occupancy Timers**: Duration counters (`Occupied for Xm Ys` or `Available for Xm Ys`) that preserve state across 30-second heartbeats and only reset when occupancy actually changes.
- **Physical Actuator Diagnostics**: Live dashboard controls for the hardware active buzzer (`{"cmd":"buzzer","duration_ms":500}`) and individual slot LED overrides.
- **Device Freshness & Health**: Accurately differentiates broker connectivity from ESP32 microcontroller connectivity using a 60-second heartbeat timeout.
- **Analytics & Heatmap**:
  - Hourly occupancy profile (00:00 to 23:00) using `avg_occupancy_pct`.
  - Day-of-week occupancy profile (Monday to Sunday).
  - 7 × 24 day-hour occupancy heatmap matrix.
  - Per-slot utilization ranking and duration statistics.
  - Sensor anomaly detection (long occupancy > 4 hours, rapid state flapping).
- **Machine Learning Forecasting**: RandomForestRegressor model predicting 24-hour future occupancy with 95% confidence intervals and optimal arrival time recommendations.
- **Full Audit Log & CSV Export**: Complete historical event log with one-click CSV download.

---

## 3. MQTT Communication Protocol

### Topics

| Purpose | MQTT Topic | Direction | Retained | QoS |
|---------|------------|-----------|----------|-----|
| Slot State Telemetry | `parking/A/slot/{1-4}/state` | ESP32 → Broker | Yes | 1 |
| Device Heartbeat & LWT | `parking/A/device/status` | ESP32 → Broker | Yes | 1 |
| Actuator Commands | `parking/A/cmd` | Backend → ESP32 | No | 1 |

### Payload Formats

#### Slot State (`parking/A/slot/1/state`)
```json
{
  "lot": "A",
  "slot": 1,
  "occupied": true,
  "distance_cm": 14.5,
  "ts": "2026-11-16T18:30:00Z",
  "seq": 42,
  "rssi": -62
}
```

#### Device Heartbeat (`parking/A/device/status`)
```json
{
  "status": "online",
  "ts": "2026-11-16T18:30:00Z"
}
```

#### Last Will and Testament (LWT)
```json
{
  "status": "offline"
}
```

#### Actuator Commands (`parking/A/cmd`)
- **Buzzer Actuation:**
  ```json
  {"cmd": "buzzer", "duration_ms": 500, "lot": "A"}
  ```
- **Diagnostic LED Override:**
  ```json
  {"cmd": "led", "slot": 2, "color": "red", "state": true, "lot": "A"}
  ```

---

## 4. REST & WebSocket API Specification

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Serves modern web dashboard |
| `GET` | `/api/health` | Hardware heartbeat freshness, MQTT broker status, uptime |
| `GET` | `/api/slots` | Current status, distance, and sequence of all 4 slots |
| `GET` | `/api/events` | Paginated raw MQTT sensor audit log |
| `GET` | `/api/sessions` | Vehicle parking sessions with duration calculations |
| `GET` | `/api/analytics/summary` | High-level KPIs, occupancy %, peak hour, anomalies |
| `GET` | `/api/analytics/hourly` | Average hourly occupancy percentage (0–23h) |
| `GET` | `/api/analytics/daily` | Day of week occupancy percentage (Mon–Sun) |
| `GET` | `/api/analytics/heatmap` | 7 × 24 day × hour numeric occupancy matrix |
| `GET` | `/api/analytics/utilization` | Per-slot utilization ranking and total sessions |
| `GET` | `/api/predict` | 24-hour ML forecast with confidence intervals |
| `POST` | `/api/cmd` | Dispatches actuator commands (`buzzer`, `led`) |
| `GET` | `/api/export.csv` | Streams all recorded sensor events as downloadable CSV |
| `WS` | `/ws` | Real-time WebSocket stream (`slots`, `slot_update`, `device_status`) |

---

## 5. Hardware Specifications & Wiring

### Components
- **Microcontroller**: ESP32 DevKit V1 (30-pin / 38-pin)
- **Sensors**: 4× HC-SR04 Ultrasonic Distance Sensors
- **Indicators**: 4× 5mm Green LEDs, 4× 5mm Red LEDs (with 220Ω current-limiting resistors)
- **Audible Alert**: Active 5V Buzzer (GPIO 2)
- **Display**: SSD1306 0.96" 128×64 I2C OLED (SDA: GPIO 21, SCL: GPIO 22)
- **Voltage Divider**: 1kΩ + 2kΩ resistors on each HC-SR04 ECHO pin to convert 5V echo pulse to 3.3V logic level safe for ESP32 inputs.

### GPIO Pinout Table

| Function | Slot 1 | Slot 2 | Slot 3 | Slot 4 |
|----------|--------|--------|--------|--------|
| **TRIG (Output)** | GPIO 5 | GPIO 18 | GPIO 19 | GPIO 23 |
| **ECHO (Input 3.3V)** | GPIO 34 | GPIO 35 | GPIO 32 | GPIO 33 |
| **Green LED (Free)** | GPIO 13 | GPIO 12 | GPIO 14 | GPIO 27 |
| **Red LED (Occupied)** | GPIO 26 | GPIO 25 | GPIO 4 | GPIO 0 |
| **Active Buzzer** | GPIO 2 | GPIO 2 | GPIO 2 | GPIO 2 |
| **OLED Display** | I2C SDA = GPIO 21, SCL = GPIO 22 |

---

## 6. How to Configure & Flash the ESP32

1. Open Arduino IDE or VSCode with PlatformIO.
2. Install required Arduino libraries:
   - `PubSubClient` by Nick O'Leary
   - `ArduinoJson` (v6.x) by Benoit Blanchon
   - `NTPClient` by Fabrice Weinberg
   - `U8g2` (if using SSD1306 OLED)
3. Copy the configuration template:
   ```bash
   cp firmware/esp32_parking/config.example.h firmware/esp32_parking/config.h
   ```
4. Edit `firmware/esp32_parking/config.h`:
   ```c
   #define WIFI_SSID       "Your_WiFi_Name"
   #define WIFI_PASSWORD   "Your_WiFi_Password"
   #define MQTT_BROKER     "192.168.1.XXX" // IP of machine running backend & broker
   #define MQTT_PORT       1883
   #define OCCUPIED_THRESHOLD_CM 20        // Obstacle < 20cm triggers OCCUPIED
   ```
5. Select Board: **DOIT ESP32 DEVKIT V1**.
6. Connect ESP32 via Micro-USB, select the COM port, and click **Upload**.
7. Open Serial Monitor at **115200 baud** to confirm Wi-Fi connection, NTP time sync, and MQTT broker registration.

---

## 7. How to Start the System

### Step 1: Start Mosquitto Broker
```bash
# Using Docker Compose
docker-compose up -d

# Or run Mosquitto natively if installed
mosquitto -c mosquitto/mosquitto.conf
```

### Step 2: Start the FastAPI Backend
```bash
# Activate virtual environment
.\.venv\Scripts\activate

# Run Uvicorn server on all interfaces so mobile phones on Wi-Fi can connect
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Step 3: Open the Dashboard
Open your browser to:
- On host laptop: `http://localhost:8000`
- On other laptops / phones on same Wi-Fi: `http://<HOST_IP>:8000`

---

## 8. Live College Demonstration Procedure

Follow this exact checklist during your presentation:

1. **Pre-Demo Verification:**
   - Ensure the laptop and ESP32 are connected to the same Wi-Fi network (or laptop mobile hotspot).
   - Verify Mosquitto broker is running (`docker-compose ps` or `netstat -ano | findstr 1883`).
   - Launch FastAPI backend: `python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000`.
   - Open `http://localhost:8000` on your browser.

2. **Demonstrate System Health:**
   - Show the top header: Point out that **ESP32 Online** (green pill) and **MQTT Broker Connected** (blue pill) are active.
   - Click **Device Health** in the sidebar: Show real-time Wi-Fi RSSI (dBm), last heartbeat timestamp, and individual sensor telemetry.

3. **Demonstrate Real-Time Parking Detection:**
   - Navigate to **Live Parking** in the sidebar:
   - Notice all slots initially display **FREE** with green indicators.
   - **Action**: Place an object (e.g. toy car, hand, box) within 15 cm of the HC-SR04 sensor for **Slot 1**.
   - **Hardware Reaction**: Physical Red LED for Slot 1 turns ON instantly, Green LED turns OFF.
   - **Dashboard Reaction**: Without refreshing the page, Slot 1 card animates to **OCCUPIED** in red, displays exact distance (e.g. `12.4 cm`), and starts counting the occupancy duration timer (`Occupied for 0m 05s`).
   - Look at the top KPI counters: Available slots decreases from 4 to 3, and Occupancy % updates in real-time.

4. **Demonstrate Vehicle Departure:**
   - **Action**: Remove the object from Slot 1.
   - **Hardware Reaction**: Physical Green LED turns ON, Red LED turns OFF.
   - **Dashboard Reaction**: Slot 1 card immediately turns green (**FREE**), duration timer displays elapsed free time, and KPIs instantly update back to 4 available slots.

5. **Demonstrate Hardware Actuation:**
   - On the **Live Parking** or **Device Health** view, click the **Test Buzzer (0.5s)** button.
   - Hear the physical buzzer on the ESP32 chirp for 500ms and observe the green toast notification confirming MQTT command dispatch.

6. **Demonstrate Analytics, Heatmap & ML:**
   - Navigate to **Analytics**:
     - Point out the **Hourly Occupancy Profile** (Chart.js bar chart showing diurnal peak hours).
     - Point out the **Day × Hour Heatmap Matrix** displaying occupancy intensity from Monday to Sunday across 24 hours.
     - Review the **Slot Utilization Ranking** and automated **Insight Pills**.
   - Navigate to **Parking History**:
     - Review the session log table showing the session just created in Step 3.
     - Click **Download CSV Audit Log** to demonstrate export capability.

---

## 9. Running Automated Tests

Run the comprehensive pytest suite:
```bash
.\.venv\Scripts\python -m pytest -v
```

All 36 tests validate:
- REST API health, slots, sessions, events, export, and prediction endpoints
- Slot payload validation and boundary conditions
- Buzzer and LED actuator command validation
- Device online/offline heartbeat detection and stale timeout logic
- State transitions, duplicate sequence handling, and session derivations
