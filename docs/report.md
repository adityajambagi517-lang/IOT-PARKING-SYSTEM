# IoT-Based Smart Parking Occupancy Monitoring and Usage Pattern Analysis System

**Course:** UE23CS342AA3 – Jackfruit Problem  
**Institution:** [University Name]  
**Date:** November 2026

---

## Abstract

Urban parking congestion is a pervasive problem in modern cities, contributing significantly to traffic delays, fuel wastage, and carbon emissions. This report presents the design, implementation, and evaluation of an IoT-based Smart Parking Occupancy Monitoring and Usage Pattern Analysis System. The system employs ESP32 microcontrollers paired with HC-SR04 ultrasonic distance sensors to detect real-time occupancy of individual parking slots. Sensor readings are transmitted via MQTT protocol to a FastAPI backend, which persists data in a SQLite database, computes analytics, and delivers live updates to a web dashboard via WebSockets. A machine learning module using `RandomForestRegressor` predicts future occupancy patterns, enabling drivers to identify optimal arrival windows. A software simulator allows full end-to-end validation without physical hardware. The system addresses cost and complexity limitations of existing camera- and sensor-based parking solutions by using commodity components and open-source software. Evaluation on 30 days of seeded simulation data demonstrates accurate occupancy analytics and meaningful ML predictions.

---

## 1. Problem Statement & Real-World Relevance

### 1.1 Urban Parking Congestion

Parking search behaviour is a significant and often underappreciated contributor to urban congestion. According to studies conducted by INRIX, a global transportation analytics firm, **approximately 30% of urban traffic in major cities consists of vehicles circling blocks in search of an available parking space**. In Indian metropolitan areas such as Bengaluru, Mumbai, and Delhi—where vehicle density has grown faster than infrastructure—this problem is particularly acute.

A 2019 survey of Indian drivers estimated that the **average time spent searching for parking in a congested urban zone is approximately 17 minutes per trip**. For a commuter making two trips per working day over 250 working days, this amounts to over 140 hours lost annually per person to the parking search problem alone.

### 1.2 Fuel Waste and Environmental Impact

A vehicle idling or driving slowly while searching for parking consumes fuel even when it is not making useful progress. Conservative estimates place idle fuel consumption at **approximately 0.7 litres per hour** for typical four-cylinder petrol engines. At scale, across a city of one million daily commuters, the cumulative fuel waste and associated CO₂ emissions are substantial. Studies in European cities have linked parking search traffic to 10–15% of local CO₂ emissions in commercial districts.

### 1.3 Economic and Productivity Costs

Beyond direct fuel costs, the parking search problem imposes:
- **Lost productive time:** Time spent circling is uncompensated and unproductive.
- **Missed appointments:** Unpredictable parking search duration leads to lateness for meetings, medical appointments, and official engagements.
- **Stress:** Surveys consistently rank parking as one of the top sources of driver stress.
- **Opportunity cost:** Parking lot operators with low visibility into occupancy may price spaces inefficiently, leaving revenue on the table.

### 1.4 Limitations of Existing Systems

| System Type | Example | Limitation |
|---|---|---|
| Manual Attendants | Traditional garages | Labour-intensive, no digital record |
| Pay-and-Display | Municipal car parks | No real-time occupancy data |
| Camera-Based | SmartPark | High infrastructure cost (₹50,000+ per slot) |
| Loop Detector | Airport lots | Road-cut installation, expensive maintenance |
| App-Based Estimates | Google Maps Parking | Probabilistic, no live sensor data |

### 1.5 Our Approach

Our system uses **ESP32 microcontrollers** (₹400–600 each) and **HC-SR04 ultrasonic sensors** (₹30–50 each) to deliver accurate, real-time slot occupancy data at a fraction of the cost of camera-based alternatives. MQTT over WiFi provides efficient, lightweight communication. The open-source backend stack (FastAPI, SQLite, Python) requires no licensing fees. The system is therefore accessible to small businesses, educational institutions, and municipalities with modest budgets.

---

## 2. Objectives

The specific objectives of this project are:

1. **Design and implement** an ESP32-based firmware capable of reading HC-SR04 ultrasonic sensors with median filtering and debounce logic to reliably detect vehicle presence.
2. **Establish reliable IoT communication** using the MQTT protocol (QoS 1, retained messages, Last Will and Testament) between the embedded device and backend.
3. **Build a FastAPI backend** that subscribes to MQTT topics, validates incoming payloads, and persists occupancy events to a relational database.
4. **Derive structured parking sessions** from raw occupancy events, enabling duration-based analytics and revenue estimation.
5. **Compute a comprehensive analytics dashboard** showing real-time occupancy, peak hours, slot utilisation rates, average session durations, and anomaly detection.
6. **Train a machine learning model** (RandomForestRegressor) on historical occupancy data to forecast near-future occupancy and suggest optimal arrival windows.
7. **Develop a software simulator** that emulates the ESP32 firmware behaviour, enabling full system integration testing without physical hardware.
8. **Produce professional documentation** including architecture diagrams, hardware schematics, testing results, and a complete viva preparation guide.

---

## 3. Literature Review / Existing Systems

Several commercial and research-grade smart parking systems have been proposed and deployed. We review four representative solutions below.

### 3.1 SmartPark (Camera-Based)

SmartPark uses overhead cameras combined with computer vision (YOLO-based object detection) to determine slot occupancy. While accurate (>95% reported), the system requires high-resolution cameras, edge GPUs, and ongoing model maintenance. Infrastructure cost per slot is prohibitive for small lots.

**Limitation:** Cost per slot (camera + compute) exceeds ₹40,000. Requires lighting conditions suitable for vision; fails in direct sun glare or darkness without supplementary lighting.

### 3.2 ParkSight (Sensor-Based, Commercial)

ParkSight uses dedicated in-ground magnetic or infrared sensors with proprietary wireless protocols. The hardware is ruggedised and highly accurate, but requires road-cutting for installation and a proprietary gateway device.

**Limitation:** Installation requires civil engineering work. Proprietary stack prevents customisation. Per-sensor licensing fees apply.

### 3.3 Siemens Smart Parking

Siemens offers a full-stack smart parking solution with vehicle guidance signs, payment integration, and central management software. This is enterprise-grade and targets major cities or airport operators.

**Limitation:** Minimum deployment size (hundreds of slots). Requires Siemens professional services for integration. Not suitable for a single parking lot or educational institution.

### 3.4 Google Maps Parking Availability

Google Maps shows a probabilistic parking availability indicator for some areas, derived from anonymised location data from smartphones.

**Limitation:** Data is aggregated and stale (not real-time). Does not indicate specific slot availability. Only available in regions with sufficient data density.

### 3.5 Our Differentiation

Our system occupies a niche unserved by existing options: **low-cost, real-time, slot-level occupancy monitoring with integrated analytics and ML prediction**, deployable by a single developer on commodity hardware with no proprietary dependencies.

---

## 4. System Architecture

The system follows a classic **three-tier IoT architecture**:

### 4.1 Device Layer (Perception)

The device layer consists of one or more **ESP32 development boards**, each managing up to 4 HC-SR04 ultrasonic sensors via dedicated TRIG/ECHO GPIO pin pairs. The firmware implements:
- **Median filtering** over 5 samples to reject spurious sensor readings
- **Debounce logic** (3 consecutive consistent readings) to prevent false state transitions
- **NTP time synchronisation** for accurate timestamps
- **WiFi + MQTT client** with automatic reconnection and Last Will and Testament (LWT) publication
- **Publish-on-change** strategy (plus a 30-second heartbeat) for bandwidth efficiency

A software **simulator** (`simulator/simulate.py`) replicates this behaviour in Python, publishing realistic occupancy patterns with configurable speed and optional fault injection.

### 4.2 Communication Layer (MQTT)

The communication layer is an **Eclipse Mosquitto MQTT broker** (v2.0), running in Docker. MQTT was selected over alternatives (see Section 7) for its:
- Minimal protocol overhead (2-byte fixed header)
- Support for QoS levels, retained messages, and LWT
- Native publish-subscribe topology, decoupling devices from the backend
- Mature Python client library (paho-mqtt)

### 4.3 Application Layer (Backend + Frontend)

The application layer comprises:
- **FastAPI backend:** Subscribes to MQTT via paho-mqtt in a background thread; exposes REST endpoints and a WebSocket endpoint for the dashboard.
- **SQLite database (via SQLAlchemy ORM):** Stores slot states, occupancy events, sessions, device status, and analytics results.
- **Analytics pipeline:** Runs on demand or on a schedule, computing 10+ metrics from stored session data.
- **ML module:** Trains and serves a `RandomForestRegressor` for occupancy prediction.
- **Web dashboard (SPA):** Vanilla JS + Chart.js frontend served by FastAPI, consuming WebSocket and REST endpoints.

---

## 5. Hardware Design

*(See [docs/hardware.md](hardware.md) for full schematics, pin mapping, and BOM.)*

### 5.1 HC-SR04 Operating Principle

The HC-SR04 ultrasonic sensor operates by emitting a 40 kHz ultrasonic burst on the TRIG pin (triggered by a 10 μs HIGH pulse) and measuring the time until the echo returns on the ECHO pin. The measured pulse width is converted to distance:

```
distance_cm = pulse_duration_μs / 58.0
```

The sensor operates at 5 V but the ESP32 GPIO pins are 3.3 V tolerant. The ECHO pin therefore requires a **voltage divider** (1 kΩ / 2 kΩ) to step the 5 V logic level down to ~3.3 V, protecting the ESP32.

### 5.2 Median Filtering

Raw HC-SR04 readings exhibit occasional outliers due to multi-path reflections, interference, or sensor noise. A **5-sample median filter** is applied: five successive distance readings are taken, sorted, and the middle value is returned. The median is robust to outliers in a way that a mean is not.

### 5.3 Debounce Logic

A single state-change reading is insufficient to trigger a slot state update—a vehicle partially entering a slot might oscillate the reading. The firmware maintains a **debounce counter** per slot: only after 3 consecutive readings agree on the new state does the system publish a state change. This eliminates transient false transitions.

### 5.4 Voltage Divider Design

```
5V ECHO ──[ 1kΩ ]──┬──→ ESP32 GPIO (3.3V)
                   │
                 [2kΩ]
                   │
                  GND
```

Output voltage = 5V × 2000 / (1000 + 2000) = 3.33 V ✓

---

## 6. Software Design

### 6.1 Firmware Architecture

The ESP32 firmware is structured as a cooperative state machine with the following states:
- **INIT:** GPIO configuration, serial setup
- **WIFI_CONNECT:** WiFi connection with retry backoff
- **NTP_SYNC:** Time synchronisation via pool.ntp.org
- **MQTT_CONNECT:** Broker connection with LWT registration
- **RUNNING:** Main loop — sensor read → filter → debounce → publish on change → heartbeat timer

The firmware uses the Arduino framework with the `PubSubClient` library for MQTT and `WiFi.h` for network management. Automatic reconnection is handled in the main loop for both WiFi and MQTT.

### 6.2 Backend Architecture

The FastAPI backend is organised into:
```
backend/
├── app/
│   ├── main.py          # FastAPI app, lifespan, routes
│   ├── mqtt_client.py   # paho-mqtt subscriber, payload handler
│   ├── models.py        # SQLAlchemy ORM models
│   ├── database.py      # DB session management
│   ├── analytics.py     # Metrics computation
│   ├── websocket.py     # WebSocket manager
│   └── schemas.py       # Pydantic request/response models
├── scripts/
│   ├── seed_data.py     # 30-day data seeder
│   └── train_model.py   # ML training pipeline
└── models/              # Serialised .pkl and metrics.json
```

The MQTT subscriber runs in a dedicated background thread, using an asyncio event loop bridge to push received messages into the async FastAPI context.

### 6.3 Database Schema Overview

| Table | Key Columns | Purpose |
|---|---|---|
| `slot_state` | lot_id, slot_id, occupied, timestamp | Current state of each slot |
| `event` | slot_id, event_type, timestamp | Raw occupancy change log |
| `session` | slot_id, start_time, end_time, duration_min | Derived parking sessions |
| `device_status` | device_id, online, last_seen | LWT-driven device health |
| `analytics_cache` | metric_name, value, computed_at | Pre-computed analytics |

### 6.4 Frontend SPA Design

The frontend is a single-page application (SPA) using vanilla JavaScript and Chart.js:
- **Slot Grid:** Live card per slot, colour-coded (green = free, red = occupied)
- **KPI Cards:** Total slots, occupied count, occupancy %, live session count
- **Charts:** Hourly occupancy heatmap, weekly trends, slot utilisation bar chart
- **ML Prediction Panel:** 24-hour occupancy forecast with best arrival window
- **CSV Export:** Download analytics data via REST endpoint

---

## 7. IoT Protocol Choice

### 7.1 Protocol Comparison

| Protocol | Header Overhead | QoS Support | Bidirectional | Power Consumption | Range | Best Use Case |
|---|---|---|---|---|---|---|
| **MQTT** | Very low (2 B fixed header) | 0 / 1 / 2 | Yes (pub/sub) | Low | Unlimited (via broker) | IoT telemetry, sensor data |
| **HTTP/REST** | High (headers ~200–800 B) | None (TCP) | Request-response only | Medium | Unlimited | Web APIs, one-shot queries |
| **CoAP** | Low (4 B header) | 0 / 1 | Yes (observe) | Very low | Medium | Constrained devices, LAN |
| **BLE** | Medium | Varies | Yes (GATT) | Very low | 10–50 m | Proximity, wearables |
| **LoRa / LoRaWAN** | Low | 0 / 1 | Limited (uplink-heavy) | Very low | Km-scale | Rural, large-area IoT |
| **WebSocket** | Low (after handshake) | None | Yes (full-duplex) | Medium | Unlimited | Browser ↔ server real-time |

### 7.2 Why MQTT Was Chosen

**1. Minimal overhead:** MQTT's 2-byte fixed header is ideal for the small JSON payloads (~80 bytes) our sensors produce. HTTP would add 10–40× more overhead per message.

**2. Broker-mediated routing:** The broker decouples senders from receivers. The ESP32 does not need to know the backend's IP address or whether it is online—it simply publishes to a topic. This makes the architecture resilient and scalable.

**3. Retained messages:** MQTT retained messages allow the broker to store the last state of each slot topic. When the backend restarts, it immediately receives the current state of all slots upon subscribing, without waiting for the next sensor reading.

**4. QoS 1 (at-least-once delivery):** QoS 1 ensures that occupancy state changes are delivered to the broker even if the initial attempt fails. This is critical: a missed state change would result in incorrect occupancy display until the next heartbeat.

**5. Publish-on-change + heartbeat:** By publishing only when state changes (plus a 30-second heartbeat), the firmware minimises network traffic. An always-publishing design wastes bandwidth and reduces ESP32 WiFi radio life.

**6. Last Will and Testament (LWT):** The ESP32 registers an LWT message at connection time. If the device disconnects unexpectedly, the broker automatically publishes the LWT to the `parking/{lot_id}/device/status` topic, alerting the backend to mark the device offline.

**7. Mature ecosystem:** Mosquitto (the broker) is a production-grade, free, open-source MQTT broker that runs in Docker with minimal configuration. The `paho-mqtt` Python library is the reference client, well-documented and actively maintained.

**8. WiFi availability:** Parking lots in urban India increasingly have WiFi coverage (as part of commercial building infrastructure). MQTT over TCP/WiFi is therefore a practical choice, unlike LoRa (which requires a gateway) or BLE (insufficient range).

---

## 8. Analytics & ML

### 8.1 Computed Metrics

The analytics pipeline computes the following metrics from stored session data:

1. **Current occupancy rate (%):** Occupied slots / total slots × 100
2. **Peak occupancy hour:** Hour of day with highest average occupancy across 30 days
3. **Average session duration (minutes):** Mean of all completed session durations
4. **Median session duration (minutes):** Robust to outlier-long sessions (e.g., overnight parking)
5. **Slot utilisation rate (%):** Per-slot: total time occupied / total observed time × 100
6. **Daily average occupancy:** Average occupancy per day of week (Mon–Sun pattern)
7. **Turnover rate:** Number of sessions per slot per day (vehicles served per day)
8. **Peak hour occupancy per slot:** Cross-tabulation of hour × slot
9. **Revenue estimate:** Sessions × estimated rate per hour (configurable)
10. **Anomaly count:** Sessions with duration < 2 min (drive-through) or > 8 hours (possible overstay)
11. **Free slot duration:** Time a slot was free between sessions (gap analysis)
12. **Busiest day of week:** Day with highest total session count

### 8.2 RandomForestRegressor: ML Occupancy Prediction

**Objective:** Predict the number of occupied slots at a given future time (hour-level granularity).

**Feature Engineering:**

| Feature | Description |
|---|---|
| `hour_of_day` | 0–23, captures intraday pattern |
| `day_of_week` | 0 (Mon) – 6 (Sun), captures weekly pattern |
| `is_weekend` | Binary flag |
| `lag_1h` | Occupancy 1 hour ago |
| `lag_24h` | Occupancy at same hour yesterday |
| `lag_168h` | Occupancy at same hour last week |
| `rolling_mean_3h` | 3-hour rolling mean (trend smoothing) |
| `rolling_std_3h` | 3-hour rolling std (volatility) |

**Training:** The model is trained on 30 days of seeded historical data (21 days train / 9 days test split). `RandomForestRegressor` with 100 estimators is used. Hyperparameter tuning uses a simple grid search over `max_depth` and `min_samples_leaf`.

**Evaluation Metrics:**

| Metric | Formula | Meaning |
|---|---|---|
| MAE | mean(|y_pred − y_true|) | Average absolute error in slots |
| RMSE | √mean((y_pred − y_true)²) | Penalises large errors more |
| R² | 1 − SS_res/SS_tot | Proportion of variance explained (1 = perfect) |

**Baseline Comparison:** The model is benchmarked against a naïve baseline (predict = same hour yesterday, i.e., lag_24h). A good model should substantially outperform this baseline in MAE and RMSE.

**Insight Generation:** The backend exposes a `/api/prediction` endpoint that returns the 24-hour occupancy forecast for the next day, along with the predicted best arrival windows (hours where occupancy is lowest).

---

## 9. Testing

### 9.1 Unit Tests

Unit tests are implemented using `pytest` and cover:
- MQTT payload parsing and validation (edge cases: missing fields, out-of-range values)
- Distance-to-occupancy threshold logic
- Session derivation from event sequences
- Analytics computation correctness
- API endpoint response schemas (via `httpx` test client)

Tests are located in `backend/tests/` and are run with `pytest backend/tests/ -v`.

### 9.2 Performance Testing

A performance test script (`backend/tests/perf_test.py`) measures:
- **End-to-end latency:** Time from simulator PUBLISH to WebSocket delivery at the dashboard. Target: < 500 ms.
- **MQTT delivery ratio:** Fraction of published messages received by the backend over a 1000-message burst. Target: > 99.5% with QoS 1.
- **Backend throughput:** Maximum MQTT messages per second the backend can process without queue buildup.

> **Note:** Hardware latency characterisation (physical HC-SR04 to MQTT publish timing) is pending physical device assembly.

### 9.3 Sensor Accuracy Methodology

For physical hardware validation (planned post-assembly):
- Measure HC-SR04 distance reading vs. ruler-measured ground truth at 5 cm intervals from 5 cm to 50 cm.
- Compute mean absolute error and standard deviation across 20 readings per distance.
- Determine the optimal `OCCUPIED_THRESHOLD_CM` value for the specific sensor unit.
- Validate debounce logic with controlled partial-entry/exit tests.

---

## 10. Results & Discussion

### 10.1 Simulator Validation

The software simulator successfully demonstrates end-to-end system functionality:
- Slots transition between OCCUPIED and FREE on simulated schedules
- MQTT messages are received by the backend and stored in the database
- WebSocket updates are delivered to the dashboard in real time
- Session derivation correctly identifies start and end of occupancy events

### 10.2 Analytics Results

Analytics were computed on 30 days of seeded simulation data with realistic occupancy patterns (peak hours 09:00–10:00 and 17:00–19:00, lower weekend activity). Results show clear identification of peak periods, slot utilisation differentials, and turnover rates—demonstrating that the analytics pipeline functions correctly.

### 10.3 ML Results

The `RandomForestRegressor` was trained on the seeded data. Computed metrics (stored in `backend/models/metrics.json`) demonstrate improvement over the naïve baseline, with the model capturing both daily cycles and day-of-week trends. Exact metric values depend on the seed data configuration.

### 10.4 Known Limitations

- **Simulated data:** Results are based on simulated, not real-world data. Real occupancy patterns will differ.
- **Single lot:** The current implementation is designed for one parking lot (Lot A, 4 slots). Multi-lot support requires additional backend logic.
- **WiFi dependency:** The ESP32 requires WiFi. Areas without WiFi coverage would require an alternative communication strategy (LoRa gateway, cellular modem).
- **SQLite scalability:** SQLite is suitable for prototyping and small deployments. High-throughput production deployments would require PostgreSQL.
- **No authentication:** The current MQTT broker allows anonymous connections. Production deployment requires TLS and username/password authentication.

---

## 11. Future Work

The following enhancements are planned for future iterations:

1. **Camera/LPR Integration:** Add a camera above the entry lane for License Plate Recognition (LPR), enabling vehicles to be tracked from entry to exit, automatic session attribution, and blacklist enforcement.

2. **Payment Gateway Integration:** Integrate Razorpay or PayU to convert the system into a full paid parking management solution, with QR-code-based payments and digital receipts.

3. **LoRa for Large Lots:** For multi-level parking structures or outdoor lots without WiFi coverage, replace the ESP32-WiFi setup with an ESP32-LoRa (SX1276) module communicating to a LoRaWAN gateway, enabling kilometre-scale coverage.

4. **Edge Inference with TinyML:** Deploy a TinyML model directly on the ESP32 using TensorFlow Lite for Microcontrollers to perform local anomaly detection (e.g., detect unusual sensor behaviour indicating tampering or hardware failure) without requiring backend connectivity.

5. **Mobile Application:** Develop a React Native mobile app that allows drivers to view real-time slot availability, reserve a slot in advance, navigate to the lot, and pay—all within one application.

6. **Multi-Lot Federation:** Extend the backend to support multiple parking lots managed by different operators, with a central aggregation API, operator dashboards, and cross-lot analytics.

7. **Predictive Pricing:** Use ML predictions to implement dynamic pricing (demand-based surge pricing during peak hours), maximising revenue for lot operators.

---

## 12. Conclusion

This project demonstrates that a low-cost, fully functional IoT smart parking system can be constructed using commodity hardware (ESP32 + HC-SR04) and open-source software (MQTT, FastAPI, SQLite, Chart.js). The system addresses a real and economically significant urban problem—parking congestion—through real-time occupancy monitoring, historical analytics, and machine learning-based prediction.

The three-tier architecture (Device → MQTT → Application) is robust, extensible, and follows industry best practices for IoT system design. The choice of MQTT as the communication protocol is well-justified by its minimal overhead, decoupled architecture, QoS guarantees, and suitability for the publish-subscribe pattern that parking occupancy monitoring demands.

The software simulator enables full end-to-end development and testing without physical hardware, ensuring the system is demonstrably complete. The analytics and ML modules provide actionable insights beyond simple occupancy display, meeting the project's requirement for usage pattern analysis. All components are containerised or easily reproducible, lowering the barrier to deployment.

Future work in LPR integration, mobile applications, and LoRa-based communication will extend the system's applicability to larger and more demanding environments.

---

## References

[1] H. Berna Özer, O. Kocabıyıkoğlu, and F. Alagöz, "Smart parking system based on IoT and MQTT protocol," *2018 26th Signal Processing and Communications Applications Conference (SIU)*, Izmir, Turkey, 2018, pp. 1–4, doi: 10.1109/SIU.2018.8404524.

[2] T. Perumal, M. N. Sulaiman, and C. Y. Leong, "Internet of Things (IoT) enabled water monitoring system," *2015 IEEE 4th Global Conference on Consumer Electronics (GCCE)*, Osaka, Japan, 2015, pp. 86–87, doi: 10.1109/GCCE.2015.7398581.

[3] A. Al-Turjman and A. Malekloo, "Smart parking in IoT-enabled cities: A survey," *Sustainable Cities and Society*, vol. 49, p. 101608, 2019, doi: 10.1016/j.scs.2019.101608.

[4] R. Kodali and S. Mahesh, "A low cost implementation of MQTT using ESP8266," *2016 2nd International Conference on Contemporary Computing and Informatics (IC3I)*, Noida, India, 2016, pp. 404–408, doi: 10.1109/IC3I.2016.7917998.

[5] INRIX, "INRIX Global Traffic Scorecard," INRIX Research, Kirkland, WA, 2022. [Online]. Available: https://inrix.com/scorecard/

[6] L. Breiman, "Random Forests," *Machine Learning*, vol. 45, no. 1, pp. 5–32, 2001, doi: 10.1023/A:1010933404324.

[7] OASIS Standard, "MQTT Version 3.1.1," OASIS, October 2014. [Online]. Available: https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/os/mqtt-v3.1.1-os.html
