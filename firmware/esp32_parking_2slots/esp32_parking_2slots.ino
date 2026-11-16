// ============================================================
// IoT Smart Parking System — 2 Slots (ESP32 + Wi-Fi + MQTT)
// Connects Physical Hardware to the ParkPulse IoT Web Platform
// ============================================================

#include <WiFi.h>
#include <PubSubClient.h>

// ------------------------------------------------------------
// 1. Wi-Fi & MQTT Configuration
// Enter your Wi-Fi (or Mobile Hotspot) name & password below.
// ------------------------------------------------------------
const char* WIFI_SSID     = "YOUR_WIFI_OR_HOTSPOT_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Your Laptop's IP running start_demo.bat
const char* MQTT_BROKER   = "10.3.2.100"; 
const int   MQTT_PORT     = 1883;
const char* LOT_ID        = "A";

// ------------------------------------------------------------
// 2. Hardware Pinout (Your Exact Wiring)
// ------------------------------------------------------------
// -------- Slot 1 --------
const int TRIG1  = 13;
const int ECHO1  = 25;
const int GREEN1 = 4;
const int RED1   = 5;

// -------- Slot 2 --------
const int TRIG2  = 14;
const int ECHO2  = 26;
const int GREEN2 = 16;
const int RED2   = 17;

// Distance threshold (cm)
const float DISTANCE_THRESHOLD = 10.0;

// ------------------------------------------------------------
// Global Variables & MQTT Client
// ------------------------------------------------------------
WiFiClient espClient;
PubSubClient mqtt(espClient);

bool prev_occupied1 = false;
bool prev_occupied2 = false;
unsigned long lastHeartbeat = 0;
const unsigned long HEARTBEAT_INTERVAL = 10000; // 10 seconds
unsigned long seq1 = 0;
unsigned long seq2 = 0;

// ------------------------------------------------------------
// Ultrasonic Distance Measurement
// ------------------------------------------------------------
float getDistance(int trigPin, int echoPin) {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  long duration = pulseIn(echoPin, HIGH, 30000);
  if (duration == 0) return -1;
  return (duration * 0.0343 / 2);
}

// ------------------------------------------------------------
// MQTT Publish Helper
// ------------------------------------------------------------
void publishSlotState(int slotId, bool occupied, float distance, unsigned long &seq) {
  seq++;
  char topic[64];
  snprintf(topic, sizeof(topic), "parking/%s/slot/%d/state", LOT_ID, slotId);

  // Build JSON payload matching backend expectations
  char payload[180];
  snprintf(payload, sizeof(payload),
    "{\"lot\":\"%s\",\"slot\":%d,\"occupied\":%s,\"distance_cm\":%.1f,\"rssi\":%d,\"seq\":%lu}",
    LOT_ID,
    slotId,
    occupied ? "true" : "false",
    distance,
    WiFi.RSSI(),
    seq
  );

  mqtt.publish(topic, payload, true);
  Serial.printf("[MQTT PUB] %s -> %s\n", topic, payload);
}

// ------------------------------------------------------------
// MQTT Command Callback (Remote control from Web Dashboard)
// ------------------------------------------------------------
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  char msg[256];
  if (length >= sizeof(msg)) length = sizeof(msg) - 1;
  memcpy(msg, payload, length);
  msg[length] = '\0';
  Serial.printf("[MQTT CMD] %s -> %s\n", topic, msg);

  // Check if testing LED
  if (strstr(msg, "\"cmd\":\"led\"")) {
    int slot = 1;
    if (strstr(msg, "\"slot\":2")) slot = 2;

    bool state = strstr(msg, "\"state\":true") != NULL;
    bool isRed = strstr(msg, "\"color\":\"red\"") != NULL;

    if (slot == 1) {
      if (isRed) digitalWrite(RED1, state ? HIGH : LOW);
      else digitalWrite(GREEN1, state ? HIGH : LOW);
    } else if (slot == 2) {
      if (isRed) digitalWrite(RED2, state ? HIGH : LOW);
      else digitalWrite(GREEN2, state ? HIGH : LOW);
    }
  }
}

// ------------------------------------------------------------
// Connect to Wi-Fi
// ------------------------------------------------------------
void setupWiFi() {
  delay(10);
  Serial.println();
  Serial.print("[WiFi] Connecting to: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int retries = 0;
  while (WiFi.status() != WL_CONNECTED && retries < 30) {
    delay(500);
    Serial.print(".");
    retries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.println("[WiFi] Connected successfully!");
    Serial.print("[WiFi] ESP32 IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println();
    Serial.println("[WiFi] Failed to connect! Check SSID & password.");
  }
}

// ------------------------------------------------------------
// Connect to MQTT Broker
// ------------------------------------------------------------
void reconnectMQTT() {
  while (!mqtt.connected()) {
    if (WiFi.status() != WL_CONNECTED) {
      setupWiFi();
    }
    Serial.print("[MQTT] Connecting to broker: ");
    Serial.print(MQTT_BROKER);
    Serial.print("...");

    char statusTopic[64];
    snprintf(statusTopic, sizeof(statusTopic), "parking/%s/device/status", LOT_ID);

    // Last Will and Testament (LWT) published automatically if ESP32 disconnects
    if (mqtt.connect("esp32-parking-2slots", statusTopic, 1, true, "offline")) {
      Serial.println(" connected!");
      
      // Announce online
      mqtt.publish(statusTopic, "online", true);

      // Subscribe to command topic for dashboard actuator tests
      char cmdTopic[64];
      snprintf(cmdTopic, sizeof(cmdTopic), "parking/%s/cmd", LOT_ID);
      mqtt.subscribe(cmdTopic);
      Serial.printf("[MQTT] Subscribed to %s\n", cmdTopic);

      // Send immediate initial status of both bays
      float d1 = getDistance(TRIG1, ECHO1);
      float d2 = getDistance(TRIG2, ECHO2);
      publishSlotState(1, (d1 > 0 && d1 < DISTANCE_THRESHOLD), (d1 > 0 ? d1 : 150), seq1);
      publishSlotState(2, (d2 > 0 && d2 < DISTANCE_THRESHOLD), (d2 > 0 ? d2 : 150), seq2);
    } else {
      Serial.print(" failed, rc=");
      Serial.print(mqtt.state());
      Serial.println(" retrying in 3 seconds...");
      delay(3000);
    }
  }
}

// ------------------------------------------------------------
// Setup
// ------------------------------------------------------------
void setup() {
  Serial.begin(115200);

  // Ultrasonic pins
  pinMode(TRIG1, OUTPUT);
  pinMode(ECHO1, INPUT);
  pinMode(TRIG2, OUTPUT);
  pinMode(ECHO2, INPUT);

  // LED pins
  pinMode(GREEN1, OUTPUT);
  pinMode(RED1,   OUTPUT);
  pinMode(GREEN2, OUTPUT);
  pinMode(RED2,   OUTPUT);

  // Initial LED state: FREE
  digitalWrite(GREEN1, HIGH);
  digitalWrite(RED1,   LOW);
  digitalWrite(GREEN2, HIGH);
  digitalWrite(RED2,   LOW);

  Serial.println();
  Serial.println("=========================================");
  Serial.println(" IoT Smart Parking - 2 Slots with Wi-Fi  ");
  Serial.println("=========================================");

  setupWiFi();

  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
}

// ------------------------------------------------------------
// Main Loop
// ------------------------------------------------------------
void loop() {
  if (!mqtt.connected()) {
    reconnectMQTT();
  }
  mqtt.loop();

  // Read sensors
  float distance1 = getDistance(TRIG1, ECHO1);
  delay(60);
  float distance2 = getDistance(TRIG2, ECHO2);

  bool occupied1 = (distance1 > 0 && distance1 < DISTANCE_THRESHOLD);
  bool occupied2 = (distance2 > 0 && distance2 < DISTANCE_THRESHOLD);

  // Local LED Control
  digitalWrite(GREEN1, occupied1 ? LOW : HIGH);
  digitalWrite(RED1,   occupied1 ? HIGH : LOW);

  digitalWrite(GREEN2, occupied2 ? LOW : HIGH);
  digitalWrite(RED2,   occupied2 ? HIGH : LOW);

  unsigned long now = millis();

  // Publish Slot 1 if state changed OR heartbeat interval elapsed
  if (occupied1 != prev_occupied1 || (now - lastHeartbeat > HEARTBEAT_INTERVAL)) {
    publishSlotState(1, occupied1, (distance1 > 0 ? distance1 : 150.0), seq1);
    prev_occupied1 = occupied1;
  }

  // Publish Slot 2 if state changed OR heartbeat interval elapsed
  if (occupied2 != prev_occupied2 || (now - lastHeartbeat > HEARTBEAT_INTERVAL)) {
    publishSlotState(2, occupied2, (distance2 > 0 ? distance2 : 150.0), seq2);
    prev_occupied2 = occupied2;
  }

  if (now - lastHeartbeat > HEARTBEAT_INTERVAL) {
    lastHeartbeat = now;
  }

  // Local Serial Monitor feedback
  Serial.printf("[STATUS] Bay 1: %-8s (%.1f cm) | Bay 2: %-8s (%.1f cm)\n",
    occupied1 ? "OCCUPIED" : "FREE", distance1,
    occupied2 ? "OCCUPIED" : "FREE", distance2
  );

  delay(500);
}
