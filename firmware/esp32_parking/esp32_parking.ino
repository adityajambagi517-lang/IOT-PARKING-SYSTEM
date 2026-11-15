// ============================================================
// Smart Parking System – ESP32 Firmware
// ============================================================
// Hardware: ESP32 DevKit V1 + 4× HC-SR04 ultrasonic sensors
// Protocol: MQTT over WiFi, JSON payloads
// Sensors:  HC-SR04 (ECHO via 1kΩ+2kΩ voltage divider → 3.3V safe)
// Optional: SSD1306 128×64 OLED display (I2C)
//
// All credentials and pin assignments come from config.h.
// NEVER hardcode secrets in this file.
// ============================================================

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <NTPClient.h>
#include <WiFiUdp.h>
#include <Wire.h>
#include <time.h>
#include "config.h"

// --- Conditional OLED support ---
#ifdef ENABLE_OLED
  #include <U8g2lib.h>
  // SSD1306 128×64, I2C, full buffer mode
  U8G2_SSD1306_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, /* reset=*/ U8X8_PIN_NONE,
                                             OLED_SCL_PIN, OLED_SDA_PIN);
#endif

// ============================================================
// Slot descriptor
// ============================================================
struct ParkingSlot {
  uint8_t  id;               // 1-based slot number
  uint8_t  trig_pin;
  uint8_t  echo_pin;
  uint8_t  led_green;
  uint8_t  led_red;
  bool     occupied;         // current debounced state
  bool     prev_occupied;    // state at last publish
  uint8_t  debounce_count;   // consecutive same-direction readings
  bool     debounce_reading; // candidate new state being debounced
  time_t   last_change_ts;   // epoch seconds of last state change
  uint32_t seq;              // publish sequence counter
  float    last_distance_cm; // last measured distance (for payload)
};

// ============================================================
// Globals
// ============================================================
WiFiClient   wifiClient;
PubSubClient mqtt(wifiClient);
WiFiUDP      ntpUDP;

// Slot array – pins from config.h macros
ParkingSlot slots[NUM_SLOTS] = {
  {1, TRIG_PIN_0, ECHO_PIN_0, LED_GREEN_0, LED_RED_0, false, false, 0, false, 0, 0, 999.0f},
  {2, TRIG_PIN_1, ECHO_PIN_1, LED_GREEN_1, LED_RED_1, false, false, 0, false, 0, 0, 999.0f},
  {3, TRIG_PIN_2, ECHO_PIN_2, LED_GREEN_2, LED_RED_2, false, false, 0, false, 0, 0, 999.0f},
  {4, TRIG_PIN_3, ECHO_PIN_3, LED_GREEN_3, LED_RED_3, false, false, 0, false, 0, 0, 999.0f},
};

unsigned long lastHeartbeatMs = 0;  // millis() of last heartbeat

// ============================================================
// MQTT topic helpers
// ============================================================
// parking/A/slot/1/state
// parking/A/device/status
// parking/A/cmd

String topicSlotState(uint8_t slot_id) {
  return String("parking/") + LOT_ID + "/slot/" + slot_id + "/state";
}

String topicDeviceStatus() {
  return String("parking/") + LOT_ID + "/device/status";
}

String topicCmd() {
  return String("parking/") + LOT_ID + "/cmd";
}

// ============================================================
// Timestamp helper – ISO 8601 (UTC)
// ============================================================
// Returns "2024-11-15T06:17:30Z"
String getTimestampISO() {
  time_t now;
  time(&now);
  struct tm timeinfo;
  gmtime_r(&now, &timeinfo);
  char buf[32];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(buf);
}

// ============================================================
// Distance measurement with 5-sample median filter
// ============================================================
// HC-SR04: pulse TRIG for 10 µs, then measure ECHO pulse width.
// distance (cm) = (echo_duration_µs × 0.034) / 2
// Median filter rejects single-shot outliers (e.g. sensor glitches).
float measureDistance(uint8_t trig, uint8_t echo) {
  float samples[MEDIAN_SAMPLES];

  for (int i = 0; i < MEDIAN_SAMPLES; i++) {
    // Ensure TRIG is LOW before pulsing
    digitalWrite(trig, LOW);
    delayMicroseconds(2);

    // Send 10 µs HIGH pulse
    digitalWrite(trig, HIGH);
    delayMicroseconds(10);
    digitalWrite(trig, LOW);

    // Measure ECHO pulse (timeout = 30 ms → ~510 cm)
    long duration = pulseIn(echo, HIGH, 30000UL);
    if (duration == 0) {
      samples[i] = 999.0f; // out-of-range sentinel
    } else {
      samples[i] = (duration * 0.034f) / 2.0f;
    }
    delay(10); // short inter-sample gap
  }

  // Sort samples (simple insertion sort, N=5 is tiny)
  for (int i = 1; i < MEDIAN_SAMPLES; i++) {
    float key = samples[i];
    int j = i - 1;
    while (j >= 0 && samples[j] > key) {
      samples[j + 1] = samples[j];
      j--;
    }
    samples[j + 1] = key;
  }

  return samples[MEDIAN_SAMPLES / 2]; // middle element = median
}

// ============================================================
// LED control
// ============================================================
// Green LED = slot free, Red LED = slot occupied
void setLEDs(ParkingSlot &slot) {
  if (slot.occupied) {
    digitalWrite(slot.led_green, LOW);
    digitalWrite(slot.led_red,   HIGH);
  } else {
    digitalWrite(slot.led_green, HIGH);
    digitalWrite(slot.led_red,   LOW);
  }
}

// ============================================================
// Publish slot state to MQTT
// ============================================================
// Topic: parking/{lot}/slot/{id}/state
// Payload: {"lot":"A","slot":1,"occupied":true,"distance_cm":12.4,
//           "ts":"2024-11-15T06:17:30Z","seq":123,"rssi":-60}
// QoS 1, retained=true so new subscribers get the last known state.
void publishState(ParkingSlot &slot) {
  StaticJsonDocument<256> doc;
  doc["lot"]         = LOT_ID;
  doc["slot"]        = slot.id;
  doc["occupied"]    = slot.occupied;
  doc["distance_cm"] = round(slot.last_distance_cm * 10.0f) / 10.0f; // 1 decimal
  doc["ts"]          = getTimestampISO();
  doc["seq"]         = slot.seq++;
  doc["rssi"]        = WiFi.RSSI();

  char payload[256];
  serializeJson(doc, payload);

  String topic = topicSlotState(slot.id);
  // PubSubClient publish with retain flag
  mqtt.publish(topic.c_str(), payload, /*retained=*/true);

  slot.prev_occupied = slot.occupied;

  Serial.printf("[MQTT] %s → %s\n", topic.c_str(), payload);
}

// ============================================================
// Debounce logic
// ============================================================
// Requires DEBOUNCE_COUNT consecutive readings in the same direction
// before committing a state change. This avoids flapping on a noisy
// sensor or a person momentarily passing by.
//
// Returns true if the slot state changed this call.
bool debounceSlot(ParkingSlot &slot, float distance_cm) {
  bool raw_occupied = (distance_cm < OCCUPIED_THRESHOLD_CM);

  if (raw_occupied == slot.debounce_reading) {
    // Same candidate – increment counter
    if (slot.debounce_count < DEBOUNCE_COUNT) {
      slot.debounce_count++;
    }
  } else {
    // Direction changed – reset counter
    slot.debounce_reading = raw_occupied;
    slot.debounce_count   = 1;
  }

  // Commit only when we've seen DEBOUNCE_COUNT consecutive same readings
  // AND the candidate differs from the current committed state
  if (slot.debounce_count >= DEBOUNCE_COUNT && raw_occupied != slot.occupied) {
    slot.occupied      = raw_occupied;
    slot.last_change_ts = time(nullptr);
    slot.debounce_count = 0; // reset for next transition
    return true; // state changed
  }
  return false;
}

// ============================================================
// OLED update
// ============================================================
#ifdef ENABLE_OLED
void updateOLED() {
  int free_count = 0;
  for (int i = 0; i < NUM_SLOTS; i++) {
    if (!slots[i].occupied) free_count++;
  }

  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_ncenB10_tr);
  u8g2.drawStr(0, 14, ("Lot " + String(LOT_ID)).c_str());

  u8g2.setFont(u8g2_font_ncenB24_tr);
  String freeStr = String(free_count) + "/" + NUM_SLOTS;
  u8g2.drawStr(10, 50, freeStr.c_str());

  u8g2.setFont(u8g2_font_ncenB08_tr);
  u8g2.drawStr(0, 62, "slots free");

  u8g2.sendBuffer();
}
#endif

// ============================================================
// MQTT command callback
// ============================================================
// Subscribed topic: parking/{lot}/cmd
// Expected payload examples:
//   {"cmd":"buzzer","duration_ms":500}
//   {"cmd":"led","slot":2,"color":"red","state":true}
void mqttCallback(char *topic, byte *payload, unsigned int length) {
  Serial.printf("[CMD] topic=%s len=%u\n", topic, length);

  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) {
    Serial.printf("[CMD] JSON parse error: %s\n", err.c_str());
    return;
  }

  const char *cmd = doc["cmd"] | "";

  if (strcmp(cmd, "buzzer") == 0) {
    // Activate buzzer for specified duration
    int dur = doc["duration_ms"] | 300;
    digitalWrite(BUZZER_PIN, HIGH);
    delay(dur);
    digitalWrite(BUZZER_PIN, LOW);
    Serial.printf("[CMD] Buzzer fired for %d ms\n", dur);

  } else if (strcmp(cmd, "led") == 0) {
    // Override a specific LED (useful for diagnostics)
    int slot_id = doc["slot"] | -1;
    const char *color = doc["color"] | "";
    bool state = doc["state"] | false;
    for (int i = 0; i < NUM_SLOTS; i++) {
      if (slots[i].id == slot_id) {
        if (strcmp(color, "green") == 0) {
          digitalWrite(slots[i].led_green, state ? HIGH : LOW);
        } else if (strcmp(color, "red") == 0) {
          digitalWrite(slots[i].led_red, state ? HIGH : LOW);
        }
        Serial.printf("[CMD] LED slot=%d color=%s state=%d\n", slot_id, color, state);
        break;
      }
    }

  } else {
    Serial.printf("[CMD] Unknown command: %s\n", cmd);
  }
}

// ============================================================
// WiFi connect / reconnect
// ============================================================
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  // Non-blocking retry with LED blink feedback (use LED_RED_0 as indicator)
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    digitalWrite(LED_RED_0, !digitalRead(LED_RED_0)); // toggle blink
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WiFi] Connected! IP: %s  RSSI: %d dBm\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
    digitalWrite(LED_RED_0, LOW); // turn off blink indicator
  } else {
    Serial.println("\n[WiFi] Connection failed – will retry next loop.");
  }
}

// ============================================================
// MQTT connect / reconnect
// ============================================================
void connectMQTT() {
  if (mqtt.connected()) return;

  Serial.printf("[MQTT] Connecting to %s:%d as %s\n",
                MQTT_BROKER, MQTT_PORT, MQTT_CLIENT_ID);

  // --- Last Will & Testament ---
  // If the device loses connection ungracefully, the broker will
  // automatically publish "offline" to the status topic (retained).
  String lwtTopic = topicDeviceStatus();
  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  mqtt.setBufferSize(512); // ensure room for JSON payloads

  bool connected;
  if (strlen(MQTT_USERNAME) > 0) {
    connected = mqtt.connect(MQTT_CLIENT_ID, MQTT_USERNAME, MQTT_PASSWORD,
                             lwtTopic.c_str(), 1, true, "offline");
  } else {
    connected = mqtt.connect(MQTT_CLIENT_ID, nullptr, nullptr,
                             lwtTopic.c_str(), 1, true, "offline");
  }

  if (connected) {
    Serial.println("[MQTT] Connected.");
    // Announce device online (retained, so dashboard shows status even after subscribe)
    mqtt.publish(lwtTopic.c_str(), "online", /*retained=*/true);

    // Subscribe to command topic
    String cmdTopic = topicCmd();
    mqtt.subscribe(cmdTopic.c_str());
    Serial.printf("[MQTT] Subscribed to %s\n", cmdTopic.c_str());

    // Immediately publish all slot states so broker cache is fresh
    for (int i = 0; i < NUM_SLOTS; i++) {
      publishState(slots[i]);
    }
  } else {
    Serial.printf("[MQTT] Connect failed, rc=%d – retrying later.\n", mqtt.state());
  }
}

// ============================================================
// Setup
// ============================================================
void setup() {
  Serial.begin(115200);
  Serial.println("\n=== Smart Parking ESP32 Firmware ===");

  // --- Pin modes ---
  for (int i = 0; i < NUM_SLOTS; i++) {
    pinMode(slots[i].trig_pin, OUTPUT);
    pinMode(slots[i].echo_pin, INPUT);
    pinMode(slots[i].led_green, OUTPUT);
    pinMode(slots[i].led_red,   OUTPUT);
    // Start with green lit (assume free until measured)
    digitalWrite(slots[i].led_green, HIGH);
    digitalWrite(slots[i].led_red,   LOW);
  }
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  // --- OLED init ---
#ifdef ENABLE_OLED
  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
  u8g2.begin();
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_ncenB08_tr);
  u8g2.drawStr(0, 20, "Smart Parking");
  u8g2.drawStr(0, 36, "Booting...");
  u8g2.sendBuffer();
#endif

  // --- WiFi ---
  connectWiFi();

  // --- NTP time sync ---
  // configTime sets up SNTP; subsequent calls to time() return correct UTC.
  configTime(GMT_OFFSET_SEC, DST_OFFSET_SEC, NTP_SERVER);
  Serial.print("[NTP] Waiting for time sync");
  time_t now = 0;
  int ntp_tries = 0;
  while (now < 1700000000UL && ntp_tries < 20) { // 1700000000 = Nov 2023
    delay(500);
    time(&now);
    Serial.print(".");
    ntp_tries++;
  }
  Serial.printf("\n[NTP] Time: %s", getTimestampISO().c_str());
  Serial.println();

  // --- MQTT ---
  connectMQTT();

  // Startup beep
  digitalWrite(BUZZER_PIN, HIGH);
  delay(100);
  digitalWrite(BUZZER_PIN, LOW);

  lastHeartbeatMs = millis();
  Serial.println("[Setup] Complete.");
}

// ============================================================
// Main loop
// ============================================================
void loop() {
  // --- Reconnect if needed ---
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[Loop] WiFi dropped – reconnecting...");
    connectWiFi();
    return; // skip rest of loop until connected
  }

  if (!mqtt.connected()) {
    Serial.println("[Loop] MQTT dropped – reconnecting...");
    connectMQTT();
    // Brief delay to avoid tight reconnect loop on broker refusal
    delay(1000);
    return;
  }

  // --- Process incoming MQTT messages (commands) ---
  mqtt.loop();

  // --- Measure each slot ---
  for (int i = 0; i < NUM_SLOTS; i++) {
    ParkingSlot &s = slots[i];
    float dist = measureDistance(s.trig_pin, s.echo_pin);
    s.last_distance_cm = dist;

    bool changed = debounceSlot(s, dist);
    if (changed) {
      setLEDs(s);
      publishState(s);
      Serial.printf("[Slot %d] State → %s (dist=%.1f cm)\n",
                    s.id, s.occupied ? "OCCUPIED" : "FREE", dist);
    }
  }

  // --- Heartbeat: publish all slots every HEARTBEAT_INTERVAL_MS ---
  // This ensures the backend receives fresh data even if no state changes.
  unsigned long now_ms = millis();
  if (now_ms - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatMs = now_ms;
    Serial.println("[Heartbeat] Publishing all slots...");
    for (int i = 0; i < NUM_SLOTS; i++) {
      publishState(slots[i]);
    }
  }

  // --- OLED refresh ---
#ifdef ENABLE_OLED
  updateOLED();
#endif

  // Small delay between measurement cycles (don't hammer sensors)
  delay(200);
}
