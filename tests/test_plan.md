# Formal Test Plan & Verification Strategy
**Project:** IoT-Based Smart Parking Occupancy Monitoring and Usage Pattern Analysis System  
**Course:** UE23CS342AA3 (Jackfruit Problem)  
**Date:** November 2026  

---

## 1. Introduction & Scope
This document specifies the verification, testing, and validation plan for the complete IoT Smart Parking solution. The system comprises:
- An ESP32 microcontroller with 4 HC-SR04 ultrasonic sensors and dual-color LED indicators.
- An MQTT broker (Eclipse Mosquitto) running QoS 1 telemetry.
- A FastAPI backend providing event persistence, session lifecycle tracking, analytics, and machine learning occupancy prediction.
- A single-page live web dashboard featuring WebSocket real-time synchronization and Chart.js analytics.
- A realistic hardware simulator with fault-injection capabilities.

The objective is to establish end-to-end functional correctness, fault tolerance, low latency, and high detection fidelity.

---

## 2. Test Objectives
1. **Functional Correctness:** Verify sensor distance measurement, median noise rejection, debounce state transitions, and automated parking session derivation.
2. **Reliability & Fault Tolerance:** Ensure graceful handling of WiFi disconnections, MQTT broker interruptions, out-of-order packets, duplicate messages, and sensor dropouts.
3. **Data Integrity & Security:** Validate incoming payloads against strict schema constraints (distance 0–400 cm, valid slot range, sanitized JSON, ISO 8601 timestamps).
4. **Performance & Low Latency:** Maintain average end-to-end publish-to-dashboard latency under 100 ms, with 99%+ packet delivery ratio.
5. **Analytics & ML Forecasting:** Verify analytical aggregations (turnover, peak hours, heatmaps) and ensure ML model (RandomForestRegressor) outperforms naive historical baselines on MAE and RMSE.

---

## 3. Test Categories & Execution Methods

### 3.1 Unit Testing (Automated via Pytest)
- **Payload Validation (`test_schemas.py`):**
  - Verify rejection of distance out-of-bounds (<0 or >400 cm).
  - Verify slot ID constraints (1 to 8).
  - Verify handling of missing required fields and negative values.
  - Test ISO 8601 timestamp parser robustness.
- **Session Lifecycle Derivation (`test_session_derivation.py`):**
  - Verify session creation upon `occupied=True` transition.
  - Verify session termination and exact duration calculation upon `occupied=False`.
  - Verify idempotency: duplicate heartbeats must not trigger multiple concurrent sessions.
  - Verify multi-slot session independence.
- **Analytics Engine (`test_analytics.py`):**
  - Current occupancy percentage and free slot count.
  - 24-hour hourly occupancy aggregation and filling of unobserved hours.
  - Day-of-week occupancy aggregations and 7x24 heatmap matrix shape.
  - Anomaly detection: long occupancy (>4h) and high-frequency flapping (>5 changes/hour).
  - Automated natural language insights generation.

### 3.2 Integration Testing (API & MQTT Pipeline)
- **REST Endpoints (`test_api.py`):**
  - `GET /api/health`: Verify database connectivity, broker state, slot counts, and uptime.
  - `GET /api/slots`: Verify live states and timestamp preservation.
  - `GET /api/events`: Verify pagination (`limit`), slot filtering, and descending sort order.
  - `GET /api/sessions`: Verify session records with valid duration and ISO timestamps.
  - `GET /api/analytics/summary`, `/hourly`, `/daily`, `/heatmap`: Verify JSON structure and numeric ranges.
  - `GET /api/predict`: Verify 24-hour horizon predictions and lower/upper confidence bands.
  - `GET /api/export.csv`: Verify CSV formatting and headers.
  - `POST /api/cmd`: Verify actuator command validation and 422 error on invalid schema.
- **WebSocket Synchronization:**
  - Verify immediate slot status snapshot upon client handshake.
  - Verify low-latency broadcast of state updates upon incoming MQTT message.

### 3.3 Performance & Load Testing (`perf_test.py`)
- Measure end-to-end round-trip latency across 100 to 1,000 consecutive messages.
- Measure packet delivery ratio (PDR) over QoS 1 with connection drops.
- Compute average latency, median, 95th percentile, and maximum jitter.

### 3.4 Hardware Sensor Verification (HC-SR04 Accuracy)
- Conduct physical distance validation across five benchmark targets: 5 cm, 10 cm, 15 cm, 20 cm, and 30 cm.
- Perform 3 trials per distance with an acoustic reflective target (flat plate perpendicular to sensor).
- Compare physical ruler measurement ($D_{\text{true}}$) vs sensor echo measurement ($D_{\text{sensor}}$).
- Formula:
  $$\text{Error (cm)} = |D_{\text{sensor}} - D_{\text{true}}|$$
  $$\text{Accuracy (\%)} = \left(1 - \frac{|D_{\text{sensor}} - D_{\text{true}}|}{D_{\text{true}}}\right) \times 100$$

---

## 4. Test Environment Requirements
- **Host OS:** Windows / Linux / macOS.
- **Runtime:** Python 3.11+, Docker 24+ & Docker Compose (Eclipse Mosquitto 2.0).
- **Physical Testbed (Hardware Phase):**
  - ESP32 DevKit V1 (30-pin / 38-pin).
  - 4x HC-SR04 ultrasonic sensors.
  - 4x Red LEDs, 4x Green LEDs with $220\,\Omega$ current-limiting resistors.
  - Voltage dividers ($1\,\text{k}\Omega / 2\,\text{k}\Omega$) on ECHO pins.
  - Standard 30 cm metric calibration ruler.
  - 5V 2A DC power supply.

---

## 5. Pass / Fail Criteria

| Test Suite | Pass Condition | Fail Condition |
| :--- | :--- | :--- |
| **Unit Tests (`pytest`)** | 100% of test cases pass (0 failures) | Any assertion error or unhandled exception |
| **API Integration** | All endpoints return HTTP 200 with valid schema | HTTP 500 status or schema mismatch |
| **MQTT Delivery Ratio** | $\ge 99.0\%$ delivery on stable network | $< 98.0\%$ packet delivery |
| **E2E Latency** | Avg latency $< 50\,\text{ms}$, p95 $< 100\,\text{ms}$ | Avg latency $> 150\,\text{ms}$ |
| **Sensor Accuracy** | Measurement error $< 1.5\,\text{cm}$ within 5–30 cm range | Error $> 3.0\,\text{cm}$ or frequent false triggers |
| **ML Model Performance**| RandomForest $R^2 > \text{Baseline } R^2$, $\text{RMSE} < 0.15$ | Model worse than naive mean baseline |

