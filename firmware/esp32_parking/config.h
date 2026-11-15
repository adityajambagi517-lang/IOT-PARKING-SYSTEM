#pragma once
// ============================================================
// Smart Parking System – ESP32 Configuration (EXAMPLE)
// Copy to config.h and fill in real values. Never commit config.h.
// ============================================================

// --- WiFi ---
#define WIFI_SSID       "YOUR_WIFI_SSID"
#define WIFI_PASSWORD   "YOUR_WIFI_PASSWORD"

// --- MQTT Broker ---
// Local: use docker host IP (e.g. 192.168.1.100) or "broker.hivemq.com" for public
#define MQTT_BROKER     "192.168.1.100"
#define MQTT_PORT       1883
#define MQTT_CLIENT_ID  "esp32-parking-A"
#define MQTT_USERNAME   ""   // leave empty if broker allows anonymous
#define MQTT_PASSWORD   ""

// --- Parking Lot ---
#define LOT_ID          "A"
#define NUM_SLOTS       4

// --- Sensor thresholds ---
#define OCCUPIED_THRESHOLD_CM   20   // distance < this => occupied
#define DEBOUNCE_COUNT          3    // consecutive readings needed to change state
#define MEDIAN_SAMPLES          5    // samples for median filter
#define HEARTBEAT_INTERVAL_MS   30000

// --- NTP ---
#define NTP_SERVER      "pool.ntp.org"
#define GMT_OFFSET_SEC  19800   // IST = UTC+5:30
#define DST_OFFSET_SEC  0

// --- Optional OLED (comment out to disable) ---
#define ENABLE_OLED
#define OLED_SDA_PIN    21
#define OLED_SCL_PIN    22

// --- Pins ---
// Slots: index 0-3
// TRIG pins
#define TRIG_PIN_0  5
#define TRIG_PIN_1  18
#define TRIG_PIN_2  19
#define TRIG_PIN_3  23
// ECHO pins (3.3V safe via voltage divider)
#define ECHO_PIN_0  34
#define ECHO_PIN_1  35
#define ECHO_PIN_2  32
#define ECHO_PIN_3  33
// LED pins (green=free, red=occupied)
#define LED_GREEN_0  13
#define LED_GREEN_1  12
#define LED_GREEN_2  14
#define LED_GREEN_3  27
#define LED_RED_0    26
#define LED_RED_1    25
#define LED_RED_2    4
#define LED_RED_3    0
// Buzzer
#define BUZZER_PIN   2
