#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Wire.h>

// 1. Apna Wi-Fi / Hotspot details daal
const char* WIFI_SSID = "hotspot";
const char* WIFI_PASS = "password";

// 2. Firebase RTDB Endpoint (live data yahan update hoga)
const char* FIREBASE_URL = "https://firebase_example.firebaseio.com";

const int MPU_ADDR = 0x68;
const int PIEZO_PIN = 34;

WiFiClientSecure client;
HTTPClient http;

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22); // SDA = 21, SCL = 22
  pinMode(PIEZO_PIN, INPUT);

  // MPU6050 wake up
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B);
  Wire.write(0);
  if (Wire.endTransmission(true) == 0) {
    Serial.println("MPU6050 OK!");
  } else {
    Serial.println("MPU6050 ERROR! Wiring check kar.");
  }

  // Wi-Fi connect
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected!");

  // SSL certificate skip (Firebase HTTPS ke liye)
  client.setInsecure();
}

void loop() {
  // 1. Piezo Peak Detection (100ms tak fast sample karega taaki tap/vibration miss na ho)
  int piezoPeak = 0;
  unsigned long startTime = millis();
  while (millis() - startTime < 100) {
    int val = analogRead(PIEZO_PIN);
    if (val > piezoPeak) piezoPeak = val;
    delay(2);
  }

  // 2. MPU6050 Read
  int16_t rawAx = 0, rawAy = 0, rawAz = 0, rawTemp = 0, rawGx = 0, rawGy = 0, rawGz = 0;
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, 14, true);

  if (Wire.available() == 14) {
    rawAx = Wire.read() << 8 | Wire.read();
    rawAy = Wire.read() << 8 | Wire.read();
    rawAz = Wire.read() << 8 | Wire.read();
    rawTemp = Wire.read() << 8 | Wire.read();
    rawGx = Wire.read() << 8 | Wire.read();
    rawGy = Wire.read() << 8 | Wire.read();
    rawGz = Wire.read() << 8 | Wire.read();
  }

  // Convert to real units (g aur deg/s)
  float ax = rawAx / 16384.0;
  float ay = rawAy / 16384.0;
  float az = rawAz / 16384.0;
  float gx = rawGx / 131.0;
  float gy = rawGy / 131.0;
  float gz = rawGz / 131.0;

  // 3. JSON Payload banao
  String json = "{";
  json += "\"acc\":{\"x\":" + String(ax, 3) + ",\"y\":" + String(ay, 3) + ",\"z\":" + String(az, 3) + "},";
  json += "\"gyro\":{\"x\":" + String(gx, 2) + ",\"y\":" + String(gy, 2) + ",\"z\":" + String(gz, 2) + "},";
  json += "\"piezo\":" + String(piezoPeak) + ",";
  json += "\"timestamp\":" + String(millis());
  json += "}";

  // 4. Firebase par PUT karo (real-time overwrite)
  if (WiFi.status() == WL_CONNECTED) {
    http.begin(client, FIREBASE_URL);
    http.addHeader("Content-Type", "application/json");

    int httpCode = http.PUT(json);
    if (httpCode > 0) {
      Serial.print("Sent ["); Serial.print(httpCode); Serial.print("]: ");
      Serial.println(json);
    } else {
      Serial.print("Error: ");
      Serial.println(http.errorToString(httpCode));
    }
    http.end();
  }

  delay(100); // ~4-5 updates per second
}