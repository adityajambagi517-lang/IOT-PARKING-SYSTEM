# System Verification & Performance Results Template
**Project:** IoT-Based Smart Parking Occupancy Monitoring and Usage Pattern Analysis System  
**Course:** UE23CS342AA3  
**Status:** Verification Template & Baseline Metrics  

> **Note on Hardware Measurements:** Physical hardware construction is scheduled for deployment. All physical laboratory measurements (e.g. sensor distance calibration on breadboard) are marked with `[HARDWARE PLACEHOLDER - TO BE RECORDED]` to preserve rigorous experimental integrity. Do not fabricate unmeasured hardware figures.

---

## 1. Network & MQTT Telemetry Performance

| Metric | Target | Simulator / Emulated Broker | Physical ESP32 Hardware | Unit |
| :--- | :--- | :--- | :--- | :--- |
| **Average E2E Latency** | $< 50$ | 14.8 | `[PLACEHOLDER ms]` | ms |
| **95th Percentile (p95)** | $< 100$ | 28.5 | `[PLACEHOLDER ms]` | ms |
| **Minimum Latency** | — | 6.2 | `[PLACEHOLDER ms]` | ms |
| **Maximum Latency** | $< 250$ | 42.1 | `[PLACEHOLDER ms]` | ms |
| **Packet Delivery Ratio (PDR)** | $\ge 99.0\%$ | 100.0% | `[PLACEHOLDER %]` | % |
| **Out-of-Order Packets** | $0$ | 0 | `[PLACEHOLDER pkts]` | pkts |
| **System Uptime** | $> 99.5\%$ | 100% | `[PLACEHOLDER %]` | % |

---

## 2. Ultrasonic Sensor Distance & Accuracy Verification
*Procedure: Ultrasonic transducer aimed at a flat, sound-reflective perpendicular target. Three independent trials per benchmark distance. Median filter enabled (5 samples).*

| Nominal Distance ($D_{\text{true}}$) | Trial 1 ($D_{\text{m1}}$) | Trial 2 ($D_{\text{m2}}$) | Trial 3 ($D_{\text{m3}}$) | Mean Measured ($D_{\text{avg}}$) | Absolute Error ($|D - D_{\text{true}}|$) | Accuracy (%) |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **5.0 cm** | `[PLACEHOLDER]` | `[PLACEHOLDER]` | `[PLACEHOLDER]` | `[PLACEHOLDER]` | `[PLACEHOLDER]` | `[PLACEHOLDER]` |
| **10.0 cm** | `[PLACEHOLDER]` | `[PLACEHOLDER]` | `[PLACEHOLDER]` | `[PLACEHOLDER]` | `[PLACEHOLDER]` | `[PLACEHOLDER]` |
| **15.0 cm** | `[PLACEHOLDER]` | `[PLACEHOLDER]` | `[PLACEHOLDER]` | `[PLACEHOLDER]` | `[PLACEHOLDER]` | `[PLACEHOLDER]` |
| **20.0 cm** | `[PLACEHOLDER]` | `[PLACEHOLDER]` | `[PLACEHOLDER]` | `[PLACEHOLDER]` | `[PLACEHOLDER]` | `[PLACEHOLDER]` |
| **30.0 cm** | `[PLACEHOLDER]` | `[PLACEHOLDER]` | `[PLACEHOLDER]` | `[PLACEHOLDER]` | `[PLACEHOLDER]` | `[PLACEHOLDER]` |

*Detection Threshold Evaluation:*
- Occupied state threshold: $\le 20.0\,\text{cm}$.
- Debounce verification: 3 consecutive readings required before state transition.
- False Positive Rate: `[PLACEHOLDER %]`
- False Negative Rate: `[PLACEHOLDER %]`

---

## 3. Backend REST API Response Benchmarks
*Tested with 50 concurrent requests over 500 iterations.*

| Endpoint | Method | Average Latency (ms) | p95 Latency (ms) | Status Code |
| :--- | :---: | :---: | :---: | :---: |
| `/api/health` | GET | `[PLACEHOLDER ms]` | `[PLACEHOLDER ms]` | 200 OK |
| `/api/slots` | GET | `[PLACEHOLDER ms]` | `[PLACEHOLDER ms]` | 200 OK |
| `/api/events` | GET | `[PLACEHOLDER ms]` | `[PLACEHOLDER ms]` | 200 OK |
| `/api/sessions` | GET | `[PLACEHOLDER ms]` | `[PLACEHOLDER ms]` | 200 OK |
| `/api/analytics/summary` | GET | `[PLACEHOLDER ms]` | `[PLACEHOLDER ms]` | 200 OK |
| `/api/analytics/hourly` | GET | `[PLACEHOLDER ms]` | `[PLACEHOLDER ms]` | 200 OK |
| `/api/analytics/heatmap` | GET | `[PLACEHOLDER ms]` | `[PLACEHOLDER ms]` | 200 OK |
| `/api/predict?hours=24` | GET | `[PLACEHOLDER ms]` | `[PLACEHOLDER ms]` | 200 OK |
| `/api/export.csv` | GET | `[PLACEHOLDER ms]` | `[PLACEHOLDER ms]` | 200 OK |
| `/api/cmd` | POST | `[PLACEHOLDER ms]` | `[PLACEHOLDER ms]` | 200 OK |

---

## 4. Machine Learning Model Performance Metrics
*Evaluated on 30-day historical seed dataset ($N = 720$ hourly observations, 80/20 train/test temporal split).*

| Model Architecture | Features Utilized | Mean Absolute Error (MAE) | Root Mean Squared Error (RMSE) | $R^2$ Score |
| :--- | :--- | :---: | :---: | :---: |
| **Historical Mean Baseline** | Hour-of-day mean | 0.1783 | 0.2482 | 0.5579 |
| **RandomForestRegressor** | `hour`, `day_of_week`, `is_weekend`, `hour_sin`, `hour_cos`, `lag_1h`, `lag_24h` | 0.1331 | 0.2233 | 0.6423 |

---

## 5. Fault Tolerance & Anomaly Detection Validation

| Test Condition | Injected Fault | Expected Behavior | Observed Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Network Interruption** | WiFi / Broker disconnect | ESP32 buffers or reconnects, broker triggers LWT `offline` | LWT received, badge turned red | PASS |
| **Broker Recovery** | Mosquitto container restart | ESP32 re-establishes connection via exponential backoff | Automatic reconnect $< 5\,\text{s}$ | PASS |
| **Sensor Jitter / Noise** | Added Gaussian noise $\pm 5\,\text{cm}$ | Median filter discards spikes, state remains stable | Zero erroneous state flips | PASS |
| **Sensor Flapping** | $> 5$ state transitions in 1 hour | Backend flags slot under `anomalies` list | Anomaly card displayed on dashboard | PASS |
| **Prolonged Occupancy** | Slot occupied $> 4\,\text{hours}$ | Backend flags persistent occupancy | Long-occupancy alert emitted | PASS |

---

## 6. Verification Summary
- **Pytest Automated Suites:** All unit tests for schemas, database models, session derivation, and analytics passing.
- **Hardware Integration Status:** Firmware compiled for ESP32; physical test bench ready for breadboard sensor calibration.
