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

// Shared data struct between 40Hz Sensor Task & Firebase loop
struct ShoeData {
  int heel, toe, inner, outer, totalPressure;
  float heelPct, toePct, innerPct, outerPct;
  bool footOnGround;
  unsigned long stepCount;
  float shoeAngle;
  float ax, ay, az, gx, gy, gz;
  unsigned long timestamp;
};

ShoeData sharedData = {0};
portMUX_TYPE dataMux = portMUX_INITIALIZER_UNLOCKED;

// Smoothing & Adaptive Step Detection Variables
float emaHeel = 0, emaToe = 0, emaInner = 0, emaOuter = 0;
const float ALPHA = 0.30;

float shoeAngle = 0.0;
unsigned long lastMpuTime = 0;

unsigned long stepCount = 0;
bool footOnGround = false;
unsigned long lastStepTime = 0;
float peakVal = 0.0;
float valleyVal = 0.0;

const float MIN_STEP_SPAN = 500.0;          // Real step vs minor sway/noise diff
const unsigned long STEP_DEBOUNCE_MS = 350; // Same foot ke 2 steps ke beech min gap

int readFSR(int pin) {
  analogRead(pin); // Dummy read (ADC crosstalk hatane ke liye)
  delayMicroseconds(100);
  long sum = 0;
  for (int i = 0; i < 8; i++) {
    sum += analogRead(pin);
    delayMicroseconds(50);
  }
  int avg = sum / 8;
  return (avg < 60) ? 0 : avg;
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

// 40Hz Background Task: Non-stop FSR + MPU + Step Counting (HTTP se block nahi hoga)
void sensorTask(void *pvParameters) {
  for (;;) {
    int rawHeel  = readFSR(FSR_HEEL);
    int rawToe   = readFSR(FSR_TOE);
    int rawInner = readFSR(FSR_INNER);
    int rawOuter = readFSR(FSR_OUTER);
    int rawTotal = rawHeel + rawToe + rawInner + rawOuter;

    unsigned long now = millis();

    // Adaptive Peak & Valley tracking (tight shoe baseline handle karne ke liye)
    if (rawTotal > peakVal) {
      peakVal = rawTotal;
    } else {
      peakVal = peakVal * 0.992f + rawTotal * 0.008f;
    }

    if (rawTotal < valleyVal) {
      valleyVal = rawTotal;
    } else {
      valleyVal = valleyVal * 0.992f + rawTotal * 0.008f;
    }

    float span = peakVal - valleyVal;

    // Step Detection with Dynamic Hysteresis + Debounce
    if (rawTotal < 150) {
      footOnGround = false;
    } else if (span >= MIN_STEP_SPAN) {
      float highThresh = valleyVal + 0.65f * span;
      float lowThresh  = valleyVal + 0.35f * span;

      if (!footOnGround && rawTotal > highThresh) {
        if (now - lastStepTime > STEP_DEBOUNCE_MS) {
          stepCount++;
          lastStepTime = now;
        }
        footOnGround = true;
      } else if (footOnGround && rawTotal < lowThresh) {
        footOnGround = false;
      }
    }

    // EMA Smoothing for clean dashboard display
    emaHeel  = ALPHA * rawHeel  + (1.0f - ALPHA) * emaHeel;
    emaToe   = ALPHA * rawToe   + (1.0f - ALPHA) * emaToe;
    emaInner = ALPHA * rawInner + (1.0f - ALPHA) * emaInner;
    emaOuter = ALPHA * rawOuter + (1.0f - ALPHA) * emaOuter;

    int heel  = (emaHeel  < 60) ? 0 : (int)emaHeel;
    int toe   = (emaToe   < 60) ? 0 : (int)emaToe;
    int inner = (emaInner < 60) ? 0 : (int)emaInner;
    int outer = (emaOuter < 60) ? 0 : (int)emaOuter;

    int totalPressure = heel + toe + inner + outer;
    float heelPct  = (totalPressure > 100) ? ((float)heel  / totalPressure) * 100.0f : 0.0f;
    float toePct   = (totalPressure > 100) ? ((float)toe   / totalPressure) * 100.0f : 0.0f;
    float innerPct = (totalPressure > 100) ? ((float)inner / totalPressure) * 100.0f : 0.0f;
    float outerPct = (totalPressure > 100) ? ((float)outer / totalPressure) * 100.0f : 0.0f;

    // MPU6050 Pitch Angle (ab accurate 25ms dt par chalega)
    float ax = 0, ay = 0, az = 0, gx = 0, gy = 0, gz = 0;
    bool mpuOK = readMPU(ax, ay, az, gx, gy, gz);

    float dt = (now - lastMpuTime) / 1000.0f;
    if (dt > 0.5f || dt <= 0.0f) dt = 0.025f;
    lastMpuTime = now;

    if (mpuOK) {
      float accAngle = atan2(ay, sqrt(ax * ax + az * az)) * 180.0f / PI;
      shoeAngle = 0.90f * (shoeAngle + gx * dt) + 0.10f * accAngle;
    }

    // Thread-safe copy to shared struct
    portENTER_CRITICAL(&dataMux);
    sharedData.heel = heel;
    sharedData.toe = toe;
    sharedData.inner = inner;
    sharedData.outer = outer;
    sharedData.totalPressure = totalPressure;
    sharedData.heelPct = heelPct;
    sharedData.toePct = toePct;
    sharedData.innerPct = innerPct;
    sharedData.outerPct = outerPct;
    sharedData.footOnGround = footOnGround;
    sharedData.stepCount = stepCount;
    sharedData.shoeAngle = shoeAngle;
    sharedData.ax = ax; sharedData.ay = ay; sharedData.az = az;
    sharedData.gx = gx; sharedData.gy = gy; sharedData.gz = gz;
    sharedData.timestamp = now;
    portEXIT_CRITICAL(&dataMux);

    vTaskDelay(pdMS_TO_TICKS(25)); // 40Hz sampling rate
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);

  Wire.begin(21, 22);   // D21 = SDA, D22 = SCL
  Wire.setTimeOut(50);  // Loose wire par I2C hang nahi hoga

  pinMode(FSR_HEEL, INPUT);
  pinMode(FSR_TOE, INPUT);
  pinMode(FSR_INNER, INPUT);
  pinMode(FSR_OUTER, INPUT);
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  // Wake up MPU6050
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B);
  Wire.write(0);
  if (Wire.endTransmission(true) == 0) {
    Serial.println("Shoe MPU6050 (0x68) OK!");
  } else {
    Serial.println("Shoe MPU6050 ERROR! D21/D22 aur 3V3/GND check kar.");
  }

  // Initial angle & baseline calibration (taaki boot par false step 1 na aaye)
  float ax = 0, ay = 0, az = 0, gx = 0, gy = 0, gz = 0;
  if (readMPU(ax, ay, az, gx, gy, gz)) {
    shoeAngle = atan2(ay, sqrt(ax * ax + az * az)) * 180.0f / PI;
  }

  int initTotal = readFSR(FSR_HEEL) + readFSR(FSR_TOE) + readFSR(FSR_INNER) + readFSR(FSR_OUTER);
  peakVal = initTotal;
  valleyVal = initTotal;
  footOnGround = (initTotal > 300);

  // Wi-Fi Fix for Type-C ESP32
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true);
  delay(200);
  WiFi.setTxPower(WIFI_POWER_8_5dBm);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected!");

  // SSL Timeout Fix
  client.setInsecure();
  client.setTimeout(3);
  client.setHandshakeTimeout(5);

  lastMpuTime = millis();

  // Start 40Hz Sensor + Step Task on Core 1 (priority 2)
  xTaskCreatePinnedToCore(sensorTask, "SensorTask", 4096, NULL, 2, NULL, 1);
}

void loop() {
  // Latest sensor snapshot copy kar
  ShoeData snap;
  portENTER_CRITICAL(&dataMux);
  snap = sharedData;
  portEXIT_CRITICAL(&dataMux);

  // Exact same JSON format
  String json = "{";
  json += "\"fsr\":{";
  json += "\"heel\":" + String(snap.heel) + ",";
  json += "\"toe\":" + String(snap.toe) + ",";
  json += "\"inner\":" + String(snap.inner) + ",";
  json += "\"outer\":" + String(snap.outer) + ",";
  json += "\"total\":" + String(snap.totalPressure);
  json += "},";
  json += "\"balance\":{";
  json += "\"heel_pct\":" + String(snap.heelPct, 1) + ",";
  json += "\"toe_pct\":" + String(snap.toePct, 1) + ",";
  json += "\"inner_pct\":" + String(snap.innerPct, 1) + ",";
  json += "\"outer_pct\":" + String(snap.outerPct, 1);
  json += "},";
  json += "\"foot_contact\":" + String(snap.footOnGround ? "true" : "false") + ",";
  json += "\"step_count\":" + String(snap.stepCount) + ",";
  json += "\"shoe_angle_deg\":" + String(fabs(snap.shoeAngle), 1) + ",";
  json += "\"acc\":{\"x\":" + String(snap.ax, 2) + ",\"y\":" + String(snap.ay, 2) + ",\"z\":" + String(snap.az, 2) + "},";
  json += "\"gyro\":{\"x\":" + String(snap.gx, 1) + ",\"y\":" + String(snap.gy, 1) + ",\"z\":" + String(snap.gz, 1) + "},";
  json += "\"timestamp\":" + String(snap.timestamp);
  json += "}";

  // Send to Firebase (Clean socket close every cycle)
  if (WiFi.status() == WL_CONNECTED) {
    http.setTimeout(3000);
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
    client.stop();
  } else {
    Serial.println("WiFi dropped, reconnecting...");
    WiFi.setTxPower(WIFI_POWER_8_5dBm);
    WiFi.reconnect();
    delay(500);
  }

  delay(200);
}