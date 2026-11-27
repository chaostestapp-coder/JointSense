#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <math.h>

// Wi-Fi Credentials
const char* WIFI_SSID = "hotspot";
const char* WIFI_PASS = "password";

// Firebase RTDB Endpoint (Shoe Node)
const char* FIREBASE_URL = "https://jointsense-a5897-default-rtdb.asia-southeast1.firebasedatabase.app/shoe/live.json";

const int MPU_ADDR = 0x68; // AD0 open/GND

// FSR Pins (ADC1 - Wi-Fi safe) -> Board par D32, D33, D34, D35
const int FSR_HEEL  = 32;
const int FSR_TOE   = 33;
const int FSR_INNER = 34;
const int FSR_OUTER = 35;

WiFiClientSecure client;
HTTPClient http;

float shoeAngle = 0.0;
unsigned long lastMpuTime = 0;

// 5-sample average to cut ESP32 ADC jitter
int readFSR(int pin) {
  long sum = 0;
  for (int i = 0; i < 5; i++) {
    sum += analogRead(pin);
  }
  return sum / 5;
}

bool readMPU(float &ax, float &ay, float &az, float &gx, float &gy, float &gz) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  if (Wire.endTransmission(false) != 0) return false;

  Wire.requestFrom(MPU_ADDR, 14, true);
  if (Wire.available() == 14) {
    int16_t rAx = (Wire.read() << 8) | Wire.read();
    int16_t rAy = (Wire.read() << 8) | Wire.read();
    int16_t rAz = (Wire.read() << 8) | Wire.read();
    Wire.read(); Wire.read(); // skip temp
    int16_t rGx = (Wire.read() << 8) | Wire.read();
    int16_t rGy = (Wire.read() << 8) | Wire.read();
    int16_t rGz = (Wire.read() << 8) | Wire.read();

    ax = rAx / 16384.0; ay = rAy / 16384.0; az = rAz / 16384.0;
    gx = rGx / 131.0;   gy = rGy / 131.0;   gz = rGz / 131.0;
    return true;
  }
  return false;
}

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22); // D21 = SDA, D22 = SCL

  pinMode(FSR_HEEL, INPUT);
  pinMode(FSR_TOE, INPUT);
  pinMode(FSR_INNER, INPUT);
  pinMode(FSR_OUTER, INPUT);

  // Wake up MPU6050
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B);
  Wire.write(0);
  if (Wire.endTransmission(true) == 0) {
    Serial.println("Shoe MPU6050 (0x68) OK!");
  } else {
    Serial.println("Shoe MPU6050 ERROR! D21/D22 aur 3V3/GND check kar.");
  }

  // Initial angle calibration
  float ax=0, ay=0, az=0, gx=0, gy=0, gz=0;
  if (readMPU(ax, ay, az, gx, gy, gz)) {
    shoeAngle = atan2(ay, sqrt(ax * ax + az * az)) * 180.0 / PI;
  }

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected!");

  client.setInsecure();
  lastMpuTime = millis();
}

void loop() {
  // 1. Read 4x FSRs (0 - 4095)
  int heel  = readFSR(FSR_HEEL);
  int toe   = readFSR(FSR_TOE);
  int inner = readFSR(FSR_INNER);
  int outer = readFSR(FSR_OUTER);

  int totalPressure = heel + toe + inner + outer;
  float heelPct  = (totalPressure > 100) ? ((float)heel  / totalPressure) * 100.0 : 0.0;
  float toePct   = (totalPressure > 100) ? ((float)toe   / totalPressure) * 100.0 : 0.0;
  float innerPct = (totalPressure > 100) ? ((float)inner / totalPressure) * 100.0 : 0.0;
  float outerPct = (totalPressure > 100) ? ((float)outer / totalPressure) * 100.0 : 0.0;
  bool footOnGround = (totalPressure > 300);

  // 2. Read MPU6050 & Compute Shoe Angle (90/10 Complementary Filter)
  float ax=0, ay=0, az=0, gx=0, gy=0, gz=0;
  bool mpuOK = readMPU(ax, ay, az, gx, gy, gz);

  unsigned long now = millis();
  float dt = (now - lastMpuTime) / 1000.0;
  if (dt > 1.0) dt = 0.2; // HTTP delay spike guard
  lastMpuTime = now;

  if (mpuOK) {
    float accAngle = atan2(ay, sqrt(ax * ax + az * az)) * 180.0 / PI;
    shoeAngle = 0.90 * (shoeAngle + gx * dt) + 0.10 * accAngle;
  }

  // 3. JSON Payload
  String json = "{";
  json += "\"fsr\":{";
  json += "\"heel\":" + String(heel) + ",";
  json += "\"toe\":" + String(toe) + ",";
  json += "\"inner\":" + String(inner) + ",";
  json += "\"outer\":" + String(outer) + ",";
  json += "\"total\":" + String(totalPressure);
  json += "},";
  json += "\"balance\":{";
  json += "\"heel_pct\":" + String(heelPct, 1) + ",";
  json += "\"toe_pct\":" + String(toePct, 1) + ",";
  json += "\"inner_pct\":" + String(innerPct, 1) + ",";
  json += "\"outer_pct\":" + String(outerPct, 1);
  json += "},";
  json += "\"foot_contact\":" + String(footOnGround ? "true" : "false") + ",";
  json += "\"shoe_angle_deg\":" + String(fabs(shoeAngle), 1) + ",";
  json += "\"acc\":{\"x\":" + String(ax, 2) + ",\"y\":" + String(ay, 2) + ",\"z\":" + String(az, 2) + "},";
  json += "\"gyro\":{\"x\":" + String(gx, 1) + ",\"y\":" + String(gy, 1) + ",\"z\":" + String(gz, 1) + "},";
  json += "\"timestamp\":" + String(now);
  json += "}";

  // 4. Send to Firebase (with auto-reconnect)
  if (WiFi.status() == WL_CONNECTED) {
    http.begin(client, FIREBASE_URL);
    http.addHeader("Content-Type", "application/json");
    int httpCode = http.PUT(json);
    if (httpCode > 0) {
      Serial.print("Sent ["); Serial.print(httpCode); Serial.print("]: ");
      Serial.println(json);
    } else {
      Serial.println("Error: " + http.errorToString(httpCode));
    }
    http.end();
  } else {
    Serial.println("WiFi dropped, reconnecting...");
    WiFi.reconnect();
    delay(500);
  }

  delay(150);
}