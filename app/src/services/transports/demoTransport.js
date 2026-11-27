import {
  CONNECTION_STATUS,
  createEmptyTestTelemetry,
  TRANSPORT_TYPES,
} from "./screeningSchema";

/**
 * Isolated Demonstration Telemetry Adapter (`isDemoData: true`).
 *
 * Strictly for UI development preview when no ESP32 hardware is publishing.
 * Every emitted snapshot is flagged `isDemoData: true` and is blocked from
 * being saved as real patient clinical measurements.
 */
export function createDemoTransport() {
  let currentTestId = "walk_10m";
  let connected = false;
  let tick = 0;
  let timer = null;
  let historyBuffer = [];
  const listeners = new Set();

  const buildSnapshot = () => {
    if (!connected) {
      return createEmptyTestTelemetry(currentTestId, {
        sourceType: TRANSPORT_TYPES.DEMO,
        isDemoData: true,
        connectionStatus: CONNECTION_STATUS.NOT_CONNECTED,
        statusMessage:
          "Demo Preview selected. Click Start demo preview to inspect synthetic sample telemetry.",
      });
    }

    const now = Date.now();
    const kneeAngleDeg = Number((38 + 26 * Math.abs(Math.sin(tick * 0.65))).toFixed(1));
    const walkingSpeedMs =
      currentTestId === "walk_10m"
        ? Number((1.05 + 0.14 * Math.sin(tick * 0.4)).toFixed(2))
        : 0;
    const steps = currentTestId === "walk_10m" ? tick * 2 : 0;
    const rms = Number((72 + 18 * Math.abs(Math.cos(tick * 0.8))).toFixed(1));

    const sample = {
      receivedAtMs: now,
      kneeAngleDeg,
      walkingSpeedMs,
      vibrationRms: rms,
    };
    historyBuffer = [...historyBuffer, sample].slice(-30);

    return createEmptyTestTelemetry(currentTestId, {
      sourceType: TRANSPORT_TYPES.DEMO,
      isDemoData: true,
      connectionStatus: CONNECTION_STATUS.DEMO,
      isLive: true,
      isStale: false,
      statusMessage:
        "DEMONSTRATION DATA ONLY — Synthetic sample readings; never saved to patient records.",
      processed: {
        kneeAngleDeg,
        walkingSpeedMs,
        steps,
        vibration: {
          rms,
          peak: Math.round(320 + 95 * Math.abs(Math.sin(tick * 0.9))),
          spikes: tick % 7,
        },
      },
      rawImu: {
        acc: {
          x: Number((0.04 + 0.08 * Math.sin(tick * 0.5)).toFixed(2)),
          y: Number((0.65 + 0.12 * Math.cos(tick * 0.5)).toFixed(2)),
          z: Number((0.74 + 0.05 * Math.sin(tick * 0.3)).toFixed(2)),
        },
        gyro: {
          x: Number((10.2 * Math.sin(tick * 0.6)).toFixed(1)),
          y: Number((-1.4 * Math.cos(tick * 0.4)).toFixed(1)),
          z: Number((0.6 * Math.sin(tick * 0.7)).toFixed(1)),
        },
      },
      timing: {
        esp32Timestamp: 25000 + tick * 500,
        receivedAtMs: now,
      },
      historyBuffer,
    });
  };

  const emit = () => {
    const snap = buildSnapshot();
    listeners.forEach((cb) => cb(snap));
  };

  const stopTimer = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  return {
    type: TRANSPORT_TYPES.DEMO,
    label: "Demo Preview (Synthetic Sample)",
    isConfigured: true,
    getCapabilities() {
      return {
        supportsLiveStream: true,
        rtdbPath: null,
        staleTimeoutMs: 3000,
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(buildSnapshot());
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stopTimer();
      };
    },
    async connect() {
      connected = true;
      tick = 1;
      historyBuffer = [];
      stopTimer();
      emit();
      timer = setInterval(() => {
        tick += 1;
        emit();
      }, 600);
    },
    async disconnect() {
      stopTimer();
      connected = false;
      tick = 0;
      historyBuffer = [];
      emit();
    },
    setActiveTest(testId) {
      currentTestId = testId;
      emit();
    },
    async startTest(testId) {
      currentTestId = testId;
      if (!connected) {
        await this.connect();
      } else {
        emit();
      }
    },
    async pauseTest() {
      stopTimer();
      emit();
    },
    async completeTest() {
      stopTimer();
      emit();
    },
  };
}
