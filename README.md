# IoT-Based Smart Parking Occupancy Monitoring and Usage Pattern Analysis System

> **Course:** UE23CS342AA3 — Jackfruit Problem

![Python 3.11](https://img.shields.io/badge/Python-3.11-blue?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi&logoColor=white)
![MQTT](https://img.shields.io/badge/MQTT-Mosquitto-660066?logo=eclipsemosquitto&logoColor=white)
![SQLite](https://img.shields.io/badge/Database-SQLite-003B57?logo=sqlite&logoColor=white)
![Chart.js](https://img.shields.io/badge/Charts-Chart.js-FF6384?logo=chartdotjs&logoColor=white)

---

## Overview

This system monitors **4 parking slots** in real time using **ESP32 microcontrollers** paired with **HC-SR04 ultrasonic sensors**. Each sensor measures the distance to the nearest object; if the distance falls below a configurable threshold the slot is marked *occupied*. Sensor readings are serialised as JSON and published over **MQTT** to an Eclipse Mosquitto broker.

A **FastAPI** backend subscribes to those topics, persists every event in **SQLite** via SQLAlchemy, exposes a REST + WebSocket API, and serves a single-page **web dashboard** built with Chart.js. A **scikit-learn** Random-Forest model is trained on historical data to predict near-future occupancy, and a **Python simulator** lets you develop and demo the full stack without any physical hardware.

---

## Features

| # | Feature |
|---|---------|
| 1 | **Live monitoring** — real-time slot status pushed over WebSocket to the dashboard |
| 2 | **Historical analytics** — hourly / daily / weekly occupancy charts and CSV export |
| 3 | **ML occupancy prediction** — scikit-learn model predicts slot availability for the next hour |
| 4 | **Hardware simulator** — `simulator/simulate.py` replays realistic parking patterns without ESP32 |
| 5 | **Fault injection** — `--inject-faults` flag simulates stuck sensors and network drops |
| 6 | **CSV export** — download any date range directly from the dashboard or REST API |

---

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (for Mosquitto broker)
- Python 3.11
- pip

### Steps

```bash
# 1 — Clone the repository
git clone <repo-url>
cd parking-iot

# 2 — Start the MQTT broker
docker-compose up -d

# 3 — Install Python dependencies
pip install -r backend/requirements.txt

# 4 — Seed historical data (required for ML training)
python backend/scripts/seed_data.py

# 5 — Train the occupancy-prediction model
python backend/scripts/train_model.py

# 6 — Start the API server
uvicorn backend.app.main:app --reload

# 7 — Open the dashboard
#     http://localhost:8000
```

---

## Using the Simulator

```bash
python simulator/simulate.py --speed 10 --inject-faults
```

| Flag | Default | Description |
|------|---------|-------------|
| `--speed` | `1` | Time-warp factor (10 = 10× faster than real time) |
| `--inject-faults` | off | Randomly simulate stuck sensors and lost packets |

---

## Switching to Real ESP32 Hardware

Only **one file** needs to change:

```
firmware/esp32_parking/config.h
```

Edit the three constants:

```c
#define WIFI_SSID      "YourNetworkSSID"
#define WIFI_PASSWORD  "YourNetworkPassword"
#define MQTT_BROKER    "192.168.x.x"   // IP of the host running docker-compose
```

Flash the firmware, ensure the ESP32 and the broker host are on the same network, and the rest of the stack is unchanged.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Serves the web dashboard |
| `GET` | `/api/slots` | Current occupancy of all 4 slots |
| `GET` | `/api/slots/{slot_id}` | Current status of one slot |
| `GET` | `/api/history` | Paginated event history (supports `?from=&to=&slot=`) |
| `GET` | `/api/analytics/hourly` | Hourly occupancy aggregates |
| `GET` | `/api/analytics/daily` | Daily occupancy aggregates |
| `GET` | `/api/predict` | ML model prediction for next-hour occupancy |
| `GET` | `/api/export/csv` | Download history as CSV |
| `WebSocket` | `/ws` | Live event stream for the dashboard |

---

## MQTT Topics

| Topic | Direction | Payload |
|-------|-----------|---------|
| `parking/slot/1` | ESP32 → Broker | `{"slot": 1, "distance_cm": 12.4, "occupied": true, "ts": 1700000000}` |
| `parking/slot/2` | ESP32 → Broker | Same schema |
| `parking/slot/3` | ESP32 → Broker | Same schema |
| `parking/slot/4` | ESP32 → Broker | Same schema |
| `parking/status` | Backend → Broker | `{"slot": 1, "occupied": true, "ts": …}` (re-broadcast after DB write) |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Firmware | C++ / Arduino framework on ESP32 |
| Sensor | HC-SR04 ultrasonic (trigger/echo GPIO) |
| Messaging | MQTT 3.1.1 via Eclipse Mosquitto 2.0 |
| Backend | Python 3.11, FastAPI, SQLAlchemy, paho-mqtt |
| Database | SQLite (file-based, zero-config) |
| ML | scikit-learn Random Forest, joblib serialisation |
| Dashboard | HTML5, Chart.js, vanilla JS (served by FastAPI) |
| Container | Docker / docker-compose |

---

## Project Structure

```
parking-iot/
├── firmware/
│   └── esp32_parking/
│       ├── esp32_parking.ino   # Main Arduino sketch
│       └── config.h            # ← edit this for real hardware
├── backend/
│   ├── app/
│   │   ├── main.py             # FastAPI application & WebSocket hub
│   │   ├── models.py           # SQLAlchemy ORM models
│   │   ├── schemas.py          # Pydantic request/response schemas
│   │   ├── crud.py             # Database CRUD helpers
│   │   ├── mqtt_client.py      # paho-mqtt subscriber thread
│   │   └── ml.py              # Prediction loader & inference
│   ├── models/                 # Serialised .pkl model files (git-ignored)
│   ├── scripts/
│   │   ├── seed_data.py        # Populates DB with synthetic history
│   │   └── train_model.py      # Trains & saves the Random Forest
│   └── requirements.txt
├── simulator/
│   └── simulate.py             # Software sensor simulator
├── data/                       # CSV exports (git-ignored, .gitkeep tracked)
│   └── .gitkeep
├── mosquitto/
│   └── mosquitto.conf          # Broker configuration
├── docker-compose.yml
├── .gitignore
└── README.md
```

---

## License

MIT © 2024 — UE23CS342AA3 Jackfruit Problem Team
