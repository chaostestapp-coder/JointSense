/**
 * Smart Insole normalization schema & state contract.
 *
 * Conceptual model only (Sole: pressure distribution, Ankle: ankle angle).
 * Intentionally does NOT guess Firebase field names, units, sensor counts,
 * or physical sole coordinates until confirmed by the hardware team.
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

export function createEmptyInsoleTelemetry(overrides = {}) {
  return {
    deviceType: "smart_insole",
    rtdbPath: overrides.rtdbPath || null,
    connectionStatus:
      overrides.connectionStatus || INSOLE_CONNECTION_STATUS.PENDING_SPECS,
    isLive: Boolean(overrides.isLive),
    isStale: Boolean(overrides.isStale),
    statusMessage:
      overrides.statusMessage ||
      "Smart insole integration is pending hardware specifications (Firebase path, pressure channel schema, and ankle angle unit).",
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
 * Validates and normalizes a raw smart insole payload using an explicit
 * hardware-confirmed mapper function. Never invents fields or units.
 */
export function normalizeInsolePayload(raw, payloadMapper = null) {
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
      reason: "Smart insole payload failed schema normalization.",
    };
  }

  const angleVal =
    mapped.ankle?.angle !== null &&
    mapped.ankle?.angle !== undefined &&
    Number.isFinite(Number(mapped.ankle.angle))
      ? Number(mapped.ankle.angle)
      : null;

  const pressure = mapped.sole?.pressureDistribution || null;

  if (angleVal === null && pressure === null) {
    return {
      valid: false,
      isEmpty: false,
      reason:
        "Smart insole payload contained neither valid pressure distribution nor ankle angle data.",
    };
  }

  return {
    valid: true,
    isEmpty: false,
    reason: "",
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
