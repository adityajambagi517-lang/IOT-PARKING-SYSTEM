# Hardware Documentation – IoT Smart Parking System

## Overview

Each parking slot is monitored by an **HC-SR04 ultrasonic sensor** connected to an **ESP32 DevKit V1**.
The ESP32 drives green/red LEDs per slot, an optional buzzer, and an optional SSD1306 OLED display,
while publishing occupancy data over MQTT/WiFi.

> [!IMPORTANT]
> The HC-SR04 ECHO pin outputs **5 V logic**. The ESP32 GPIO is rated for **3.3 V maximum**.
> Always use the voltage divider described below on every ECHO line to avoid damaging the MCU.

---

## Bill of Materials

| # | Component | Qty | Specification | Approx Cost (INR) |
|---|-----------|-----|---------------|-------------------|
| 1 | ESP32 DevKit V1 | 1 | 38-pin, dual-core Xtensa LX6, 4 MB flash, WiFi+BT | ₹350–450 |
| 2 | HC-SR04 Ultrasonic Sensor | 4 | 2 cm–400 cm range, 15° beam angle, 5 V supply | ₹60–80 each |
| 3 | Green LED (5 mm) | 4 | 2.0–2.4 V forward voltage, ~20 mA | ₹2–5 each |
| 4 | Red LED (5 mm) | 4 | 1.8–2.2 V forward voltage, ~20 mA | ₹2–5 each |
| 5 | 220 Ω resistor (1/4 W) | 8 | Current limiting for LEDs | ₹1 each |
| 6 | 1 kΩ resistor (1/4 W) | 4 | Voltage divider R1 (per ECHO line) | ₹1 each |
| 7 | 2 kΩ resistor (1/4 W) | 4 | Voltage divider R2 (per ECHO line) | ₹1 each |
| 8 | Active Buzzer (5 V) | 1 | 85 dB, 2 kHz, 5 V coil | ₹20–30 |
| 9 | SSD1306 OLED 128×64 *(optional)* | 1 | I2C, 3.3 V / 5 V tolerant, 0.96″ | ₹120–180 |
| 10 | Full-size Breadboard | 1 | 830 tie-point | ₹60–80 |
| 11 | Jumper Wires | 1 set | M-M and M-F, 20 cm | ₹60–80 |
| 12 | USB Power Supply | 1 | 5 V 2 A micro-USB | ₹120–180 |
| **Total** | | | | **≈ ₹900–1100** |

---

## Pin Map

| Slot | Function | ESP32 GPIO | Notes |
|------|----------|-----------|-------|
| 1 | HC-SR04 TRIG | GPIO 5 | OUTPUT |
| 1 | HC-SR04 ECHO | GPIO 34 | INPUT (3.3 V via divider) – **input-only pin** |
| 1 | LED Green | GPIO 13 | OUTPUT via 220 Ω |
| 1 | LED Red | GPIO 26 | OUTPUT via 220 Ω |
| 2 | HC-SR04 TRIG | GPIO 18 | OUTPUT |
| 2 | HC-SR04 ECHO | GPIO 35 | INPUT (3.3 V via divider) – **input-only pin** |
| 2 | LED Green | GPIO 12 | OUTPUT via 220 Ω |
| 2 | LED Red | GPIO 25 | OUTPUT via 220 Ω |
| 3 | HC-SR04 TRIG | GPIO 19 | OUTPUT |
| 3 | HC-SR04 ECHO | GPIO 32 | INPUT (3.3 V via divider) |
| 3 | LED Green | GPIO 14 | OUTPUT via 220 Ω |
| 3 | LED Red | GPIO 4 | OUTPUT via 220 Ω |
| 4 | HC-SR04 TRIG | GPIO 23 | OUTPUT |
| 4 | HC-SR04 ECHO | GPIO 33 | INPUT (3.3 V via divider) |
| 4 | LED Green | GPIO 27 | OUTPUT via 220 Ω |
| 4 | LED Red | GPIO 0 | OUTPUT via 220 Ω *(avoid pulling LOW at boot)* |
| – | Buzzer | GPIO 2 | OUTPUT (built-in LED also on GPIO 2) |
| – | OLED SDA *(opt.)* | GPIO 21 | I2C data |
| – | OLED SCL *(opt.)* | GPIO 22 | I2C clock |
| – | 3.3 V power | 3V3 | OLED VCC |
| – | 5 V power | VIN | HC-SR04 VCC, Buzzer VCC |
| – | Ground | GND | Shared ground for all components |

> [!TIP]
> GPIOs 34, 35, 32, 33 on the ESP32 DevKit V1 are **input-only** (no internal pull-up/pull-down
> and no output capability). They are ideal for ECHO pins where only reading is required.

---

## Voltage Divider – HC-SR04 ECHO Line

### Why it is needed

The HC-SR04 ECHO pin drives a **5 V** logic signal when it detects the return pulse.
The ESP32's GPIO input pins are tolerant only up to **3.3 V**. Connecting 5 V directly
will permanently damage the microcontroller over time.

### Design

A simple resistive voltage divider brings 5 V down to ≈ 3.3 V:

```
HC-SR04 ECHO ──┬── R1 (1 kΩ) ──── ESP32 GPIO (ECHO input)
               │
              R2 (2 kΩ)
               │
              GND
```

**Formula:**

```
Vout = Vin × R2 / (R1 + R2)
     = 5 V × 2000 / (1000 + 2000)
     = 5 V × 0.6667
     ≈ 3.33 V  ✓ (within 3.3 V spec)
```

Build one divider per ECHO line (4 total). Use 1% tolerance resistors for accuracy.

---

## HC-SR04 Operation Principle

```
        ┌────────────────────────────────────────────────────────┐
        │  HC-SR04 Ultrasonic Sensor                             │
        │                                                        │
 TRIG ──►  10 µs HIGH pulse → triggers 8-cycle 40 kHz burst     │
        │                                                        │
 ECHO ◄──  Goes HIGH when burst sent, LOW when echo received     │
        │                                                        │
        └────────────────────────────────────────────────────────┘

Timing:
  TRIG:  ____|‾‾‾‾‾‾‾‾‾‾|_______________________________________
              ←10 µs→

  ECHO:  _______________|‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾|_____________________
                        ←  echo width  →
```

**Distance formula:**

```
distance (cm) = (echo_duration_µs × speed_of_sound_cm_per_µs) / 2
              = (echo_duration_µs × 0.034) / 2
```

The factor of 2 accounts for the round-trip (out and back).

**Effective range:** 2 cm – 400 cm  
**Beam angle:** ≈ 15°  
**Measurement cycle:** ≥ 60 ms between triggers to avoid echo overlap

---

## Median Filter – Noise Rejection

Raw ultrasonic readings can spike due to multi-path reflections, temperature variation,
or partial obstructions. The firmware takes **5 consecutive samples**, sorts them, and
returns the **middle (median) value**:

```
Samples:  [23.1, 22.8, 350.0, 23.0, 22.9]   ← 350.0 is an outlier
Sorted:   [22.8, 22.9, 23.0, 23.1, 350.0]
Median:                 ↑ 23.0 cm            ← outlier rejected
```

This is more robust than averaging (which would give ≈ 88 cm).

---

## Wiring Diagram – ASCII Art

```
                    ┌──────────────────────────────────┐
                    │        ESP32 DevKit V1           │
                    │                                  │
                    │  3V3 ●─────────────── OLED VCC   │
                    │  GND ●─────────────── OLED GND   │
                    │  G21 ●─────────────── OLED SDA   │
                    │  G22 ●─────────────── OLED SCL   │
                    │                                  │
                    │  VIN ●──┬──────────── HC-SR04 VCC (×4)
                    │  GND ●──┴──────────── HC-SR04 GND (×4)
                    │                                  │
         Slot 1     │   G5 ●─────────────── TRIG₁      │
   ┌──── R1(1kΩ) ───│  G34 ●                ECHO₁ ─────┤
   │                │       └── R2(2kΩ) ─── GND        │
   │    Slot 2      │  G18 ●─────────────── TRIG₂      │
   │ ┌── R1(1kΩ) ───│  G35 ●                ECHO₂ ─────┤
   │ │              │       └── R2(2kΩ) ─── GND        │
   │ │  Slot 3      │  G19 ●─────────────── TRIG₃      │
   │ │ ┌─ R1(1kΩ) ──│  G32 ●                ECHO₃ ─────┤
   │ │ │            │       └── R2(2kΩ) ─── GND        │
   │ │ │  Slot 4    │  G23 ●─────────────── TRIG₄      │
   │ │ │ ┌ R1(1kΩ) ─│  G33 ●                ECHO₄ ─────┤
   │ │ │ │          │       └── R2(2kΩ) ─── GND        │
   │ │ │ │          │                                  │
   │ │ │ │  LEDs    │  G13 ●── 220Ω ── GREEN₁ ── GND  │
   │ │ │ │          │  G26 ●── 220Ω ── RED₁   ── GND  │
   │ │ │ │          │  G12 ●── 220Ω ── GREEN₂ ── GND  │
   │ │ │ │          │  G25 ●── 220Ω ── RED₂   ── GND  │
   │ │ │ │          │  G14 ●── 220Ω ── GREEN₃ ── GND  │
   │ │ │ │          │   G4 ●── 220Ω ── RED₃   ── GND  │
   │ │ │ │          │  G27 ●── 220Ω ── GREEN₄ ── GND  │
   │ │ │ │          │   G0 ●── 220Ω ── RED₄   ── GND  │
   │ │ │ │          │                                  │
   │ │ │ │  Buzzer  │   G2 ●─────────── BUZZER+ ── VIN│
   │ │ │ │          │  GND ●─────────── BUZZER-        │
   │ │ │ │          └──────────────────────────────────┘
   │ │ │ │
   └─┴─┴─┘  (each leg connects to its respective ECHO₁-₄ input)
```

---

## Color-Coded Wire Guide

| Wire Color | Signal | From → To |
|------------|--------|-----------|
| **Red** | 5 V power | ESP32 VIN → HC-SR04 VCC, Buzzer+ |
| **Black** | Ground | ESP32 GND → all GNDs |
| **Orange** | TRIG | ESP32 GPIO → HC-SR04 TRIG |
| **Yellow** | ECHO (5 V side) | HC-SR04 ECHO → R1 (1 kΩ) |
| **Green** | ECHO (3.3 V side) | R1/R2 junction → ESP32 GPIO |
| **Bright Green** | LED (free) | ESP32 GPIO → 220 Ω → LED anode |
| **Pink/Red** | LED (occupied) | ESP32 GPIO → 220 Ω → LED anode |
| **Purple** | I2C SDA | ESP32 G21 → OLED SDA |
| **Blue** | I2C SCL | ESP32 G22 → OLED SCL |

---

## Safety Notes

> [!CAUTION]
> **Never connect the HC-SR04 ECHO pin directly to an ESP32 GPIO without the voltage divider.**
> The 5 V signal will exceed the GPIO's absolute maximum rating and may permanently destroy the MCU.

> [!WARNING]
> **GPIO 0** is used as LED_RED_4 but is also the ESP32 boot-mode pin. If it is pulled LOW at
> power-on, the device enters download mode. Ensure the red LED for slot 4 is off (or use an
> N-channel MOSFET driver) during boot, or reassign to another GPIO.

- **LED current limiting:** Each LED must have a 220 Ω series resistor.  
  `I = (3.3 V − V_f) / 220 Ω ≈ (3.3 − 2.0) / 220 ≈ 5.9 mA` – safe for GPIO and LED.
- **Total GPIO source current:** ESP32 GPIO can source/sink ~40 mA per pin, 1200 mA total.
  8 LEDs × 6 mA = 48 mA – well within limits.
- **Power supply:** Use a quality 5 V 2 A supply. HC-SR04s can draw up to 15 mA each (60 mA for 4).
  The ESP32 itself draws up to 250 mA during WiFi transmit bursts.
- **ESD:** Handle the ESP32 with ESD precautions; avoid touching GPIO pins directly.

---

## Assembly Steps

1. **Plan layout on breadboard** – place ESP32 in the centre, sensors on the outer rails.
2. **Power rails** – connect ESP32 `VIN` to the breadboard `+5V` rail and `GND` to the `-` rail.
   Connect `3V3` to a separate `3.3V` rail for the OLED.
3. **Voltage dividers (×4)** – for each ECHO line, place R1 (1 kΩ) in series then R2 (2 kΩ)
   to GND. The midpoint connects to the ESP32 ECHO GPIO.
4. **HC-SR04 sensors** – VCC → 5V rail, GND → GND rail, TRIG → ESP32 TRIG GPIO,
   ECHO → voltage divider input.
5. **LEDs** – anode through 220 Ω to ESP32 GPIO, cathode to GND rail.
6. **Buzzer** – positive terminal to ESP32 GPIO 2, negative to GND.
   *(Active buzzer: buzzes whenever the GPIO is HIGH.)*
7. **OLED (optional)** – VCC → 3.3V rail, GND → GND rail, SDA → G21, SCL → G22.
8. **Copy firmware** – open `esp32_parking.ino` in Arduino IDE, copy `config.example.h`
   to `config.h`, fill in WiFi and MQTT credentials.
9. **Install libraries** (Arduino IDE Library Manager):
   - `PubSubClient` by Nick O'Leary
   - `ArduinoJson` by Benoit Blanchon
   - `NTPClient` by Fabrice Weinberg
   - `U8g2` by oliver (for OLED)
10. **Select board** – `ESP32 Dev Module`, 115200 baud, correct COM port.
11. **Upload and monitor** – open Serial Monitor at 115200 baud to verify WiFi,
    NTP sync, and MQTT connection messages.
12. **Test each sensor** – wave your hand over each HC-SR04 and confirm the
    corresponding red LED lights and a JSON payload appears in the MQTT broker.
