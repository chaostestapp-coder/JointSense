/**
 * Smart Insole (/shoe/live) normalization schema & state contract.
 *
 * Normalizes the ESP32 shoe insole Realtime Database payload:
 * {
 *   acc: { x, y, z },
 *   balance: { heel_pct, inner_pct, outer_pct, toe_pct },
 *   foot_contact: boolean,
 *   fsr: { heel, inner, outer, toe, total },
 *   gyro: { x, y, z },
 *   shoe_angle_deg: number,
 *   timestamp: number
 * }
 *
 * Missing or non-finite fields remain null (never fabricated as 0).
 * Valid 0 and false measurements are preserved as real values.
 */

export const INSOLE_CONNECTION_STATUS = {
  NOT_CONFIGURED: "Not configured",
  PENDING_SPECS: "Pending hardware specifications",
  NOT_CONNECTED: "Not connected",
  CONNECTING: "Connecting to Firebase",
  LISTENER_ACTIVE: "Firebase listener active",
  WAITING_FOR_HARDWARE: "Waiting for insole data",
  RECEIVING: "Receiving insole data",
  STALE: "Data stale",
  PERMISSION_DENIED: "Firebase permission denied",
  ERROR: "Connection error",
};

function toFiniteNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toBooleanOrNull(value) {
  if (typeof value === "boolean") return value;
  return null;
}

export function createEmptyInsoleTelemetry(overrides = {}) {
  return {
    deviceType: "smart_insole",
    rtdbPath: overrides.rtdbPath || null,
    connectionStatus:
      overrides.connectionStatus || INSOLE_CONNECTION_STATUS.NOT_CONNECTED,
    isLive: Boolean(overrides.isLive),
    isStale: Boolean(overrides.isStale),
    statusMessage:
      overrides.statusMessage ||
      "Click Start sensor listener to subscribe to smart insole readings.",
    processed: {
      shoeAngleDeg: null,
      footContact: null,
      fsr: {
        heel: null,
        inner: null,
        outer: null,
        toe: null,
        total: null,
      },
      balance: {
        heelPct: null,
        innerPct: null,
        outerPct: null,
        toePct: null,
      },
      ...overrides.processed,
    },
    rawImu: {
      acc: { x: null, y: null, z: null },
      gyro: { x: null, y: null, z: null },
      ...overrides.rawImu,
    },
    sole: {
      pressureDistribution: null,
      ...overrides.sole,
    },
    ankle: {
      angle: null,
      unit: null,
      reference: null,
      ...overrides.ankle,
    },
    timing: {
      deviceTimestamp: null,
      receivedAtMs: null,
      ...overrides.timing,
    },
    historyBuffer: overrides.historyBuffer || [],
  };
}

/**
 * Default hardware-confirmed mapper for `/shoe/live`.
 */
export function mapShoeInsolePayload(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const recognizedKeys = [
    "shoe_angle_deg",
    "foot_contact",
    "fsr",
    "balance",
    "acc",
    "gyro",
    "timestamp",
  ];
  const hasAnyRecognizedKey = recognizedKeys.some((key) => key in raw);
  if (!hasAnyRecognizedKey) {
    return null;
  }

  const fsrRaw = raw.fsr && typeof raw.fsr === "object" ? raw.fsr : {};
  const balRaw =
    raw.balance && typeof raw.balance === "object" ? raw.balance : {};
  const accRaw = raw.acc && typeof raw.acc === "object" ? raw.acc : {};
  const gyroRaw = raw.gyro && typeof raw.gyro === "object" ? raw.gyro : {};

  const shoeAngleDeg = toFiniteNumberOrNull(raw.shoe_angle_deg);
  const footContact = toBooleanOrNull(raw.foot_contact);

  const fsr = {
    heel: toFiniteNumberOrNull(fsrRaw.heel),
    inner: toFiniteNumberOrNull(fsrRaw.inner),
    outer: toFiniteNumberOrNull(fsrRaw.outer),
    toe: toFiniteNumberOrNull(fsrRaw.toe),
    total: toFiniteNumberOrNull(fsrRaw.total),
  };

  const balance = {
    heelPct: toFiniteNumberOrNull(balRaw.heel_pct),
    innerPct: toFiniteNumberOrNull(balRaw.inner_pct),
    outerPct: toFiniteNumberOrNull(balRaw.outer_pct),
    toePct: toFiniteNumberOrNull(balRaw.toe_pct),
  };

  const rawImu = {
    acc: {
      x: toFiniteNumberOrNull(accRaw.x),
      y: toFiniteNumberOrNull(accRaw.y),
      z: toFiniteNumberOrNull(accRaw.z),
    },
    gyro: {
      x: toFiniteNumberOrNull(gyroRaw.x),
      y: toFiniteNumberOrNull(gyroRaw.y),
      z: toFiniteNumberOrNull(gyroRaw.z),
    },
  };

  const channels = [
    { id: "heel", label: "Heel", value: fsr.heel },
    { id: "inner", label: "Inner", value: fsr.inner },
    { id: "outer", label: "Outer", value: fsr.outer },
    { id: "toe", label: "Toe", value: fsr.toe },
  ].filter((c) => c.value !== null);

  const hasPressureData = channels.length > 0 || fsr.total !== null;

  return {
    processed: {
      shoeAngleDeg,
      footContact,
      fsr,
      balance,
    },
    rawImu,
    sole: {
      pressureDistribution: hasPressureData
        ? {
            mode: "4-region",
            unit: null,
            channels,
            aggregatedValue: fsr.total,
            label: "Total pressure",
          }
        : null,
    },
    ankle: {
      angle: shoeAngleDeg,
      unit: shoeAngleDeg !== null ? "deg" : null,
      reference: "Shoe angle",
    },
    deviceTimestamp:
      raw.timestamp !== undefined && raw.timestamp !== null
        ? raw.timestamp
        : null,
  };
}

/**
 * Validates and normalizes a raw smart insole payload.
 */
export function normalizeInsolePayload(raw, payloadMapper = mapShoeInsolePayload) {
  if (raw === null || raw === undefined) {
    return { valid: false, isEmpty: true, reason: "No data at insole path." };
  }

  if (typeof raw !== "object" || Array.isArray(raw)) {
    return {
      valid: false,
      isEmpty: false,
      reason: "Invalid smart insole payload: expected a JSON object.",
    };
  }

  if (typeof payloadMapper !== "function") {
    return {
      valid: false,
      isEmpty: false,
      reason:
        "Smart insole payload received, but no hardware-confirmed schema mapper is registered yet.",
    };
  }

  const mapped = payloadMapper(raw);
  if (!mapped || typeof mapped !== "object") {
    return {
      valid: false,
      isEmpty: false,
      reason:
        "Unexpected smart insole payload structure: none of the expected fields were found.",
    };
  }

  const angleVal =
    mapped.ankle?.angle !== null &&
    mapped.ankle?.angle !== undefined &&
    Number.isFinite(Number(mapped.ankle.angle))
      ? Number(mapped.ankle.angle)
      : null;

  const pressure = mapped.sole?.pressureDistribution || null;
  const processed = mapped.processed || {
    shoeAngleDeg: angleVal,
    footContact: null,
    fsr: { heel: null, inner: null, outer: null, toe: null, total: null },
    balance: { heelPct: null, innerPct: null, outerPct: null, toePct: null },
  };
  const rawImu = mapped.rawImu || {
    acc: { x: null, y: null, z: null },
    gyro: { x: null, y: null, z: null },
  };

  const hasAnyImu = [
    rawImu.acc?.x,
    rawImu.acc?.y,
    rawImu.acc?.z,
    rawImu.gyro?.x,
    rawImu.gyro?.y,
    rawImu.gyro?.z,
  ].some((v) => v !== null && v !== undefined);

  if (
    angleVal === null &&
    pressure === null &&
    processed.footContact === null &&
    !hasAnyImu
  ) {
    return {
      valid: false,
      isEmpty: false,
      reason:
        "Smart insole payload contained no recognized sensor measurements.",
    };
  }

  return {
    valid: true,
    isEmpty: false,
    reason: "",
    processed,
    rawImu,
    sole: {
      pressureDistribution: pressure,
    },
    ankle: {
      angle: angleVal,
      unit: mapped.ankle?.unit || null,
      reference: mapped.ankle?.reference || null,
    },
    deviceTimestamp:
      mapped.deviceTimestamp !== undefined && mapped.deviceTimestamp !== null
        ? mapped.deviceTimestamp
        : null,
  };
}
