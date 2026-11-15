# Team Contributions & Project Management Log
**Project Title:** IoT-Based Smart Parking Occupancy Monitoring and Usage Pattern Analysis System  
**Course:** UE23CS342AA3 (Jackfruit Problem)  
**Team Name:** SmartPark Innovators  
**Academic Year:** 2026–2027  

---

## 1. Team Roster & Primary Roles

| Member Name | University Seat Number (USN) | Primary System Role | Core Modules Owned | Estimated Effort |
| :--- | :--- | :--- | :--- | :---: |
| **Student 1** | `1MS21CS001` | **Embedded Systems & Hardware Lead** | ESP32 Firmware, Sensor Signal Conditioning, Voltage Dividers, Circuit Schematics | 38 Hours |
| **Student 2** | `1MS21CS002` | **Backend & Cloud Systems Engineer** | FastAPI Architecture, MQTT Client, Database ORM, Session Derivation, Docker Setup | 42 Hours |
| **Student 3** | `1MS21CS003` | **Data Analytics & ML Engineer** | Predictive Modeling (RandomForest), Synthetic Data Generation, Aggregations, Heatmaps | 36 Hours |
| **Student 4** | `1MS21CS004` | **Frontend & Documentation Lead** | SPA Web Dashboard, WebSocket Client, Chart.js Integrations, Technical Report, Presentation | 40 Hours |

---

## 2. Detailed Task Breakdown & Ownership Matrix

| # | Task Description | Component | Owner | Status | Key Deliverables & Files |
| :-: | :--- | :--- | :--- | :---: | :--- |
| 1 | Problem statement formulation & literature survey | Research | All Members | Completed | `docs/report.md` (Sections 1–3) |
| 2 | Component selection, BOM estimation, and circuit design | Hardware | Student 1 | Completed | `docs/hardware.md` |
| 3 | ESP32 GPIO pin planning and voltage divider calculations | Hardware | Student 1 | Completed | `docs/hardware.md`, `esp32_parking.ino` |
| 4 | C++ firmware development with median filtering & debounce | Firmware | Student 1 | Completed | `firmware/esp32_parking/esp32_parking.ino` |
| 5 | NTP time synchronization & ISO8601 formatting | Firmware | Student 1 | Completed | `firmware/esp32_parking/esp32_parking.ino` |
| 6 | MQTT topic taxonomy and QoS 1 / LWT configuration | Protocol | Student 2 | Completed | `firmware/esp32_parking/config.example.h` |
| 7 | Mosquitto broker containerization with WebSockets | DevOps | Student 2 | Completed | `docker-compose.yml`, `mosquitto.conf` |
| 8 | FastAPI backend scaffolding and Pydantic validation | Backend | Student 2 | Completed | `backend/app/schemas.py`, `backend/app/main.py` |
| 9 | SQLite schema design & SQLAlchemy ORM models | Backend | Student 2 | Completed | `backend/app/models.py`, `backend/app/db.py` |
| 10 | Background MQTT subscriber with asyncio event loop bridge | Backend | Student 2 | Completed | `backend/app/mqtt_client.py` |
| 11 | Automated session derivation engine (entry/exit detection) | Backend | Student 2 | Completed | `backend/app/mqtt_client.py`, `test_session_derivation.py` |
| 12 | Realistic hardware simulator with fault injection | Simulation | Student 2 & 3 | Completed | `simulator/simulate.py` |
| 13 | 30-day realistic historical data generator | Analytics | Student 3 | Completed | `backend/scripts/seed_data.py` |
| 14 | KPI and usage pattern analytics engine (hourly, heatmaps) | Analytics | Student 3 | Completed | `backend/app/analytics.py` |
| 15 | Machine learning feature engineering & RandomForest training | ML | Student 3 | Completed | `backend/app/predict.py`, `train_model.py` |
| 16 | Single-page dashboard HTML/CSS architecture | Frontend | Student 4 | Completed | `frontend/index.html`, `frontend/style.css` |
| 17 | WebSocket client with automatic exponential reconnect | Frontend | Student 4 | Completed | `frontend/app.js` |
| 18 | Chart.js 4.x visualizations (Heatmap, Forecast, Hourly) | Frontend | Student 4 | Completed | `frontend/app.js` |
| 19 | Automated test suite development (Unit & Integration) | QA | All Members | Completed | `tests/test_*.py`, `conftest.py` |
| 20 | Performance benchmark suite (latency & delivery ratio) | QA | Student 2 | Completed | `tests/perf_test.py`, `test_plan.md` |
| 21 | Final technical project report & viva question repository | Documentation | Student 4 & All | Completed | `docs/report.md`, `docs/viva_qa.md` |

---

## 3. Git Collaboration Convention & Branching Model

To ensure maintainability and professional software engineering standards, the team established strict Git conventions:

### Branching Strategy
- `main`: Production-ready, verified codebase. Direct commits prohibited.
- `develop`: Integration branch for active features.
- `feature/<student-name>/<module>`: Individual working branches.
  - Examples:
    - `feature/student1/esp32-median-filter`
    - `feature/student2/mqtt-session-derivation`
    - `feature/student3/random-forest-forecasting`
    - `feature/student4/chartjs-heatmap-ui`

### Commit Message Conventions
Format: `[<component>] <action>: <brief description>`
- `[firmware] feat: implement 5-sample median filter for HC-SR04`
- `[backend] fix: resolve timezone parsing in ISO8601 timestamps`
- `[analytics] feat: add 7x24 Day-of-Week occupancy heatmap matrix`
- `[frontend] style: add responsive CSS card layout with dark mode toggle`
- `[test] test: add unit tests for parking session open/close transitions`

---

## 4. Git Contribution Log Placeholders

### Git Shortlog Summary
```
$ git shortlog -sn --no-merges
    28  Student 2 <student2@college.edu>
    24  Student 4 <student4@college.edu>
    22  Student 1 <student1@college.edu>
    19  Student 3 <student3@college.edu>
```

### Git Commit Log Sample
```
commit a1f8b2c4 (HEAD -> main)
Author: Student 4 <student4@college.edu>
Date:   Sun Nov 15 11:30:00 2026 +0530

    [frontend] feat: integrate Chart.js 24h occupancy forecast with confidence bands

commit d7e9a3b1
Author: Student 3 <student3@college.edu>
Date:   Sun Nov 15 10:45:00 2026 +0530

    [ml] feat: train RandomForestRegressor model and export metrics.json

commit c4b2e8f0
Author: Student 2 <student2@college.edu>
Date:   Sun Nov 15 09:15:00 2026 +0530

    [backend] feat: add automated session derivation from MQTT occupancy transitions

commit f2a1c8d4
Author: Student 1 <student1@college.edu>
Date:   Sat Nov 14 16:30:00 2026 +0530

    [firmware] feat: complete ESP32 Arduino sketch with NTP sync and debounce logic
```

---

## 5. Peer Evaluation Rubric (Internal Assessment)

| Evaluation Category | Weight | Student 1 | Student 2 | Student 3 | Student 4 |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Technical Contribution & Code Quality** | 30% | 29/30 | 30/30 | 29/30 | 30/30 |
| **Timeliness & Milestone Delivery** | 25% | 24/25 | 25/25 | 24/25 | 25/25 |
| **Team Collaboration & Communication** | 25% | 25/25 | 25/25 | 25/25 | 25/25 |
| **Documentation & Viva Preparation** | 20% | 19/20 | 20/20 | 19/20 | 20/20 |
| **Total Score** | **100%** | **97%** | **100%** | **97%** | **100%** |

