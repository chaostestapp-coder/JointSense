/**
 * Canonical internal screening protocol & normalized sensor telemetry contract.
 * Keeps UI components independent of transport and separates processed metrics
 * from raw IMU readings.
 */

export const SCREENING_TESTS = [
  {
    id: "walk_10m",
    order: 1,
    name: "10-Metre Walk Test",
    shortName: "10m Walk",
    purpose:
      "Assess functional gait velocity, knee excursion during stride, and step count over a straight 10-metre walkway.",
    patientInstructions: [
      "Stand behind the 0-metre start marker in comfortable footwear.",
      "Walk at your normal, safe pace past the 10-metre finish marker.",
      "Do not stop abruptly at the line; slow down after crossing the 10 m mark.",
    ],
    completionCriteria:
      "Click 'Complete & next test' as soon as the patient crosses the 10-metre finish line. Elapsed time and live sensor readings are saved automatically.",
    supportedVisuals: ["kneeMovement", "jointVibration", "rawImu", "liveTrend"],
  },
  {
    id: "sit_to_stand_5x",
    order: 2,
    name: "Five-Times Sit-to-Stand Test",
    shortName: "5x Sit-to-Stand",
    purpose:
      "Evaluate lower-limb functional transitions, knee flexion/extension excursions, and joint vibration across five standing rises.",
    patientInstructions: [
      "Sit upright near the front edge of a standard armless chair with feet flat on the floor.",
      "Cross your arms over your chest if safe to do so.",
      "Stand up fully and sit back down five consecutive times as steadily as you can.",
    ],
    completionCriteria:
      "Count 5 full stand-and-sit cycles, then click 'Complete & next test' when the patient finishes the 5th repetition.",
    supportedVisuals: ["kneeMovement", "jointVibration", "rawImu", "liveTrend"],
  },
  {
    id: "knee_bend_extend",
    order: 3,
    name: "Knee Bend-and-Extend Test",
    shortName: "Knee Bend & Extend",
    purpose:
      "Measure active flexion/extension angle and capture piezo vibration features during controlled knee articulation.",
    patientInstructions: [
      "Sit comfortably with your thigh supported and lower leg hanging freely.",
      "Slowly straighten your knee as far as comfortable, then bend it back as far as you can.",
      "Repeat smoothly 3 times while reporting any pain, stiffness, or catching.",
    ],
    completionCriteria:
      "After 3 controlled bend-and-extend cycles, click 'Complete & review summary' to record the test and review results.",
    supportedVisuals: ["kneeMovement", "jointVibration", "rawImu", "liveTrend"],
  },
];

export const TRANSPORT_TYPES = {
  FIREBASE_RTDB: "firebase_rtdb",
  MANUAL: "manual",
  DEMO: "demo",
};

export const CONNECTION_STATUS = {
  NOT_CONNECTED: "Not connected",
  CONNECTING: "Connecting to Firebase",
  LISTENER_ACTIVE: "Firebase listener active",
  WAITING_FOR_ESP32: "Waiting for ESP32 data",
  RECEIVING: "Receiving sensor data",
  STALE: "Data stale",
  PERMISSION_DENIED: "Firebase permission denied",
  CONFIG_MISSING: "Firebase configuration missing",
  ERROR: "Connection error",
  DEMO: "Demo Preview",
};

function toFiniteNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Validates and parses the expected ESP32 Realtime Database JSON payload:
 * {
 *   knee_angle_deg, walking_speed_ms, steps,
 *   vibration: { rms, peak, spikes },
 *   acc: { x, y, z },
 *   gyro: { x, y, z },
 *   timestamp
 * }
 *
 * Missing or null fields stay null (never fabricated as 0).
 */
export function parseEsp32KneeSleevePayload(raw) {
  if (raw === null || raw === undefined) {
    return { valid: false, isEmpty: true, reason: "No data at Firebase path." };
  }

  if (typeof raw !== "object" || Array.isArray(raw)) {
    return {
      valid: false,
      isEmpty: false,
      reason: "Invalid ESP32 payload: expected a JSON object.",
    };
  }

  const recognizedKeys = [
    "knee_angle_deg",
    "walking_speed_ms",
    "steps",
    "vibration",
    "acc",
    "gyro",
    "timestamp",
  ];
  const hasAnyRecognizedKey = recognizedKeys.some((key) => key in raw);
  if (!hasAnyRecognizedKey) {
    return {
      valid: false,
      isEmpty: false,
      reason:
        "Unexpected Firebase payload structure: none of the expected ESP32 fields were found.",
    };
  }

  const vib =
    raw.vibration && typeof raw.vibration === "object" ? raw.vibration : {};
  const acc = raw.acc && typeof raw.acc === "object" ? raw.acc : {};
  const gyro = raw.gyro && typeof raw.gyro === "object" ? raw.gyro : {};

  return {
    valid: true,
    isEmpty: false,
    reason: "",
    processed: {
      kneeAngleDeg: toFiniteNumberOrNull(raw.knee_angle_deg),
      walkingSpeedMs: toFiniteNumberOrNull(raw.walking_speed_ms),
      steps: toFiniteNumberOrNull(raw.steps),
      vibration: {
        rms: toFiniteNumberOrNull(vib.rms),
        peak: toFiniteNumberOrNull(vib.peak),
        spikes: toFiniteNumberOrNull(vib.spikes),
      },
    },
    rawImu: {
      acc: {
        x: toFiniteNumberOrNull(acc.x),
        y: toFiniteNumberOrNull(acc.y),
        z: toFiniteNumberOrNull(acc.z),
      },
      gyro: {
        x: toFiniteNumberOrNull(gyro.x),
        y: toFiniteNumberOrNull(gyro.y),
        z: toFiniteNumberOrNull(gyro.z),
      },
    },
    esp32Timestamp:
      raw.timestamp !== undefined && raw.timestamp !== null
        ? raw.timestamp
        : null,
  };
}

export function createEmptyTestTelemetry(testId, overrides = {}) {
  return {
    testId,
    sourceType: overrides.sourceType || TRANSPORT_TYPES.FIREBASE_RTDB,
    isDemoData: Boolean(overrides.isDemoData),
    connectionStatus:
      overrides.connectionStatus || CONNECTION_STATUS.NOT_CONNECTED,
    isLive: Boolean(overrides.isLive),
    isStale: Boolean(overrides.isStale),
    rtdbPath: overrides.rtdbPath || null,
    statusMessage:
      overrides.statusMessage ||
      "Click Start sensor listener to subscribe to Firebase Realtime Database.",
    processed: {
      kneeAngleDeg: null,
      walkingSpeedMs: null,
      steps: null,
      vibration: {
        rms: null,
        peak: null,
        spikes: null,
      },
      ...overrides.processed,
    },
    rawImu: {
      acc: { x: null, y: null, z: null },
      gyro: { x: null, y: null, z: null },
      ...overrides.rawImu,
    },
    timing: {
      esp32Timestamp: null,
      receivedAtMs: null,
      ...overrides.timing,
    },
    historyBuffer: overrides.historyBuffer || [],
  };
}
