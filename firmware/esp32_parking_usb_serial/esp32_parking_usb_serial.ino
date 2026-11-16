// ============================================================
// PARKPULSE IoT — 2-Slot Smart Parking System (USB Serial Mode)
// Target Board: ESP32 DevKit V1
// Baud Rate:    115200 baud
//
// Streams machine-readable JSON telemetry directly over USB Serial
// to the Python Serial Bridge (COM15 -> localhost:1883 MQTT).
// ============================================================

// ------------------------------------------------------------
// Hardware Pinout (Your Exact Wiring Preserved)
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
// If vehicle is closer than 10 cm -> OCCUPIED
const float DISTANCE_THRESHOLD = 10.0;

// ------------------------------------------------------------
// Median-filtered Distance Measurement
// ------------------------------------------------------------
float readSingleDistance(int trigPin, int echoPin) {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  long duration = pulseIn(echoPin, HIGH, 30000); // 30ms timeout (~5m max)
  if (duration == 0) return -1.0;
  return (duration * 0.0343 / 2.0);
}

float getFilteredDistance(int trigPin, int echoPin) {
  // Take 3 quick samples for noise rejection
  float s1 = readSingleDistance(trigPin, echoPin);
  delay(10);
  float s2 = readSingleDistance(trigPin, echoPin);
  delay(10);
  float s3 = readSingleDistance(trigPin, echoPin);

  // Return median
  if ((s1 >= s2 && s1 <= s3) || (s1 <= s2 && s1 >= s3)) return s1;
  if ((s2 >= s1 && s2 <= s3) || (s2 <= s1 && s2 >= s3)) return s2;
  return s3;
}

// ------------------------------------------------------------
// Setup
// ------------------------------------------------------------
void setup() {
  Serial.begin(115200);

  // Configure ultrasonic pins
  pinMode(TRIG1, OUTPUT);
  pinMode(ECHO1, INPUT);
  pinMode(TRIG2, OUTPUT);
  pinMode(ECHO2, INPUT);

  // Configure LED indicator pins
  pinMode(GREEN1, OUTPUT);
  pinMode(RED1,   OUTPUT);
  pinMode(GREEN2, OUTPUT);
  pinMode(RED2,   OUTPUT);

  // Initially set both bays to FREE (Green ON, Red OFF)
  digitalWrite(GREEN1, HIGH);
  digitalWrite(RED1,   LOW);
  digitalWrite(GREEN2, HIGH);
  digitalWrite(RED2,   LOW);

  delay(200);
}

// ------------------------------------------------------------
// Main Loop
// ------------------------------------------------------------
void loop() {
  // Read both parking bay sensors
  float d1 = getFilteredDistance(TRIG1, ECHO1);
  delay(20);
  float d2 = getFilteredDistance(TRIG2, ECHO2);

  // Determine occupancy based on 10 cm threshold
  bool occ1 = (d1 > 0 && d1 < DISTANCE_THRESHOLD);
  bool occ2 = (d2 > 0 && d2 < DISTANCE_THRESHOLD);

  // Update physical LEDs immediately on breadboard
  digitalWrite(GREEN1, occ1 ? LOW : HIGH);
  digitalWrite(RED1,   occ1 ? HIGH : LOW);

  digitalWrite(GREEN2, occ2 ? LOW : HIGH);
  digitalWrite(RED2,   occ2 ? HIGH : LOW);

  // Substitute default distance (150 cm) if sensor times out / unobstructed
  float dist1_report = (d1 > 0) ? d1 : 150.0;
  float dist2_report = (d2 > 0) ? d2 : 150.0;

  // Output standardized single-line JSON directly over USB Serial
  // Example: {"s1":{"d":8.5,"occ":true},"s2":{"d":150.0,"occ":false}}
  Serial.print("{\"s1\":{\"d\":");
  Serial.print(dist1_report, 1);
  Serial.print(",\"occ\":");
  Serial.print(occ1 ? "true" : "false");
  Serial.print("},\"s2\":{\"d\":");
  Serial.print(dist2_report, 1);
  Serial.print(",\"occ\":");
  Serial.print(occ2 ? "true" : "false");
  Serial.println("}}");

  // Sample every 250 ms for smooth sub-second web updates
  delay(250);
}
