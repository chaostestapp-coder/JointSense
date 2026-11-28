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

// Display EMA Smoothing Variables
float emaHeel = 0, emaToe = 0, emaInner = 0, emaOuter = 0;
const float ALPHA = 0.30f;

// MPU Calibration & Angle Variables
float shoeAngle = 0.0f;
unsigned long lastMpuTime = 0;
float gyroBiasX = 0.0f, gyroBiasY = 0.0f, gyroBiasZ = 0.0f;

// Thump-Proof Step Detection Variables
unsigned long stepCount = 0;
bool footOnGround = false;
bool validSwingStarted = false;
bool walkingActive = false;
int pendingStrides = 0;

unsigned long lastStepTime = 0;
unsigned long liftTime = 0;
unsigned long lastCandidateTime = 0;

float swingDeg = 0.0f;
float peakSwingGyro = 0.0f;

int medBuf[5] = {0, 0, 0, 0, 0};
int medIdx = 0;
int stanceSamples = 0;
int liftSamples = 0;

float peakVal = 0.0f;
float valleyVal = 0.0f;

// Tuning Thresholds
const int   MIN_ABS_PRESSURE = 600;         // Needs actual body weight, not light taps
const float MIN_STEP_SPAN    = 900.0f;      // Min pressure drop/rise between lift & strike
const unsigned long MIN_SWING_MS     = 180; // Rejects quick taps/flickers
const unsigned long MAX_SWING_MS     = 1500;// Rejects sitting foot-dangle then landing
const float MIN_SWING_DEG    = 35.0f;       // Min total rotation (deg) while cleanly in the air
const float MIN_SWING_GYRO   = 70.0f;       // Min peak angular speed (deg/s) during air swing
const unsigned long STEP_DEBOUNCE_MS = 500; // Min gap between two strikes of the same foot
const unsigned long WALK_CONFIRM_MS  = 1800;// Max gap between stride 1 & 2 to confirm walking
const unsigned long WALK_TIMEOUT_MS  = 2200;// Stops walking mode after 2.2s idle
const int LIFT_HOLD_SAMPLES   = 2;          // 50ms unload to catch full swing early
const int STANCE_HOLD_SAMPLES = 3;          // 75ms solid load to confirm foot strike

int median5(int a, int b, int c, int d, int e) {
  int arr[5] = {a, b, c, d, e};
  for (int i = 1; i < 5; i++) {
    int key = arr[i];
    int j = i - 1;
    while (j >= 0 && arr[j] > key) {
      arr[j + 1] = arr[j];
      j--;
    }
    arr[j + 1] = key;
  }
  return arr[2];
}

// Trimmed mean (10 reads, drops min & max spike, averages middle 8)
int readFSR(int pin) {
  analogRead(pin); // Dummy read clears ADC crosstalk
  delayMicroseconds(100);
  long sum = 0;
  int minVal = 4096;
  int maxVal = -1;
  for (int i = 0; i < 10; i++) {
    int v = analogRead(pin);
    sum += v;
    if (v < minVal) minVal = v;
    if (v > maxVal) maxVal = v;
    delayMicroseconds(50);
  }
  int avg = (sum - minVal - maxVal) / 8;
  return (avg < 80) ? 0 : avg; // Deadzone cuts static floor noise
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

    ax = rAx / 16384.0f; ay = rAy / 16384.0f; az = rAz / 16384.0f;
    gx = rGx / 131.0f;   gy = rGy / 131.0f;   gz = rGz / 131.0f;
    return true;
  }
  return false;
}

// 40Hz Background Task: Swing-Verified FSR + Gyro Step Counter
void sensorTask(void *pvParameters) {
  for (;;) {
    int rawHeel  = readFSR(FSR_HEEL);
    int rawToe   = readFSR(FSR_TOE);
    int rawInner = readFSR(FSR_INNER);
    int rawOuter = readFSR(FSR_OUTER);
    int rawTotal = rawHeel + rawToe + rawInner + rawOuter;

    unsigned long now = millis();

    // 1. Read MPU6050 (bias-corrected gyro + pitch angle)
    float ax = 0, ay = 0, az = 0, gx = 0, gy = 0, gz = 0;
    bool mpuOK = readMPU(ax, ay, az, gx, gy, gz);

    float dt = (now - lastMpuTime) / 1000.0f;
    if (dt > 0.5f || dt <= 0.0f) dt = 0.025f;
    lastMpuTime = now;

    float gyroMag = 0.0f;
    if (mpuOK) {
      gx -= gyroBiasX;
      gy -= gyroBiasY;
      gz -= gyroBiasZ;

      float accAngle = atan2(ay, sqrt(ax * ax + az * az)) * 180.0f / PI;
      shoeAngle = 0.90f * (shoeAngle + gx * dt) + 0.10f * accAngle;
      gyroMag = sqrt(gx * gx + gy * gy + gz * gz);
    }

    // 2. 5-Sample Median Filter on FSR total (rejects EMI spikes)
    medBuf[medIdx] = rawTotal;
    medIdx = (medIdx + 1) % 5;
    int cleanTotal = median5(medBuf[0], medBuf[1], medBuf[2], medBuf[3], medBuf[4]);

    // 3. Adaptive Peak & Valley Envelope
    if (cleanTotal > peakVal) {
      peakVal = cleanTotal;
    } else {
      peakVal = peakVal * 0.990f + cleanTotal * 0.010f;
    }

    if (cleanTotal < valleyVal) {
      valleyVal = cleanTotal;
    } else {
      valleyVal = valleyVal * 0.990f + cleanTotal * 0.010f;
    }

    float span = peakVal - valleyVal;
    float highThresh = valleyVal + 0.65f * span;
    float midThresh  = valleyVal + 0.45f * span;
    float lowThresh  = valleyVal + 0.30f * span;

    bool isUnloaded = (cleanTotal < 200) || (span >= MIN_STEP_SPAN && cleanTotal < lowThresh);
    bool isLoaded   = (span >= MIN_STEP_SPAN) && (cleanTotal > highThresh) && (cleanTotal >= MIN_ABS_PRESSURE);

    // Reset walking state if user stops walking
    if (walkingActive && (now - lastStepTime > WALK_TIMEOUT_MS)) {
      walkingActive = false;
    }
    if (pendingStrides > 0 && (now - lastCandidateTime > WALK_CONFIRM_MS)) {
      pendingStrides = 0;
    }

    // 4. Thump-Proof Gait State Machine
    if (footOnGround) {
      if (isUnloaded) {
        liftSamples++;
        stanceSamples = 0;
        if (liftSamples >= LIFT_HOLD_SAMPLES) {
          footOnGround = false;
          validSwingStarted = true;
          liftTime = now;
          swingDeg = 0.0f;
          peakSwingGyro = 0.0f;
          liftSamples = 0;
        }
      } else {
        liftSamples = 0;
      }
    } else {
      // Foot is in the air: integrate rotation ONLY while cleanly unloaded (ignores impact shock)
      if (validSwingStarted && mpuOK && (cleanTotal < 300 || (span >= MIN_STEP_SPAN && cleanTotal < midThresh))) {
        if (gyroMag > 25.0f) {
          swingDeg += gyroMag * dt;
        }
        if (gyroMag > peakSwingGyro) {
          peakSwingGyro = gyroMag;
        }
      }

      // Check for confirmed weight-bearing foot strike
      if (isLoaded) {
        stanceSamples++;
        liftSamples = 0;
        if (stanceSamples >= STANCE_HOLD_SAMPLES) {
          unsigned long swingDuration = now - liftTime;
          bool isRealSwing = validSwingStarted &&
                             (swingDuration >= MIN_SWING_MS) &&
                             (swingDuration <= MAX_SWING_MS) &&
                             (swingDeg >= MIN_SWING_DEG) &&
                             (peakSwingGyro >= MIN_SWING_GYRO);

          if (isRealSwing && (now - lastStepTime > STEP_DEBOUNCE_MS)) {
            if (walkingActive) {
              stepCount++;
              lastStepTime = now;
            } else if (pendingStrides == 1 && (now - lastCandidateTime <= WALK_CONFIRM_MS)) {
              walkingActive = true;
              stepCount += 2; // Commits both stride 1 and stride 2
              pendingStrides = 0;
              lastStepTime = now;
            } else {
              pendingStrides = 1;
              lastCandidateTime = now;
              lastStepTime = now;
            }
          }

          footOnGround = true;
          validSwingStarted = false;
          swingDeg = 0.0f;
          peakSwingGyro = 0.0f;
          stanceSamples = 0;
        }
      } else {
        stanceSamples = 0;
      }
    }

    // 5. EMA Smoothing for clean dashboard display
    emaHeel  = ALPHA * rawHeel  + (1.0f - ALPHA) * emaHeel;
    emaToe   = ALPHA * rawToe   + (1.0f - ALPHA) * emaToe;
    emaInner = ALPHA * rawInner + (1.0f - ALPHA) * emaInner;
    emaOuter = ALPHA * rawOuter + (1.0f - ALPHA) * emaOuter;

    int heel  = (emaHeel  < 80) ? 0 : (int)emaHeel;
    int toe   = (emaToe   < 80) ? 0 : (int)emaToe;
    int inner = (emaInner < 80) ? 0 : (int)emaInner;
    int outer = (emaOuter < 80) ? 0 : (int)emaOuter;

    int totalPressure = heel + toe + inner + outer;
    float heelPct  = (totalPressure > 100) ? ((float)heel  / totalPressure) * 100.0f : 0.0f;
    float toePct   = (totalPressure > 100) ? ((float)toe   / totalPressure) * 100.0f : 0.0f;
    float innerPct = (totalPressure > 100) ? ((float)inner / totalPressure) * 100.0f : 0.0f;
    float outerPct = (totalPressure > 100) ? ((float)outer / totalPressure) * 100.0f : 0.0f;

    // 6. Thread-safe copy to shared struct
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
  Wire.setTimeOut(50);  // Prevents I2C hang on loose wire

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
    Serial.println("Shoe MPU6050 ERROR! Check D21/D22 and 3V3/GND.");
  }

  // Auto-calibrate gyro zero-bias (keep shoe still for 1s at boot)
  float sumGx = 0, sumGy = 0, sumGz = 0;
  float ax = 0, ay = 0, az = 0, gx = 0, gy = 0, gz = 0;
  int validSamples = 0;
  for (int i = 0; i < 25; i++) {
    if (readMPU(ax, ay, az, gx, gy, gz)) {
      sumGx += gx; sumGy += gy; sumGz += gz;
      validSamples++;
    }
    delay(5);
  }
  if (validSamples > 0) {
    gyroBiasX = sumGx / validSamples;
    gyroBiasY = sumGy / validSamples;
    gyroBiasZ = sumGz / validSamples;
    shoeAngle = atan2(ay, sqrt(ax * ax + az * az)) * 180.0f / PI;
  }

  // Initial FSR baseline
  int initTotal = readFSR(FSR_HEEL) + readFSR(FSR_TOE) + readFSR(FSR_INNER) + readFSR(FSR_OUTER);
  for (int i = 0; i < 5; i++) medBuf[i] = initTotal;
  peakVal = initTotal;
  valleyVal = initTotal;
  footOnGround = (initTotal >= MIN_ABS_PRESSURE);

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

  // Start 40Hz Sensor + Step Task on Core 1
  xTaskCreatePinnedToCore(sensorTask, "SensorTask", 4096, NULL, 2, NULL, 1);
}

void loop() {
  ShoeData snap;
  portENTER_CRITICAL(&dataMux);
  snap = sharedData;
  portEXIT_CRITICAL(&dataMux);

  // Exact same Firebase JSON format
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

  // Send to Firebase
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