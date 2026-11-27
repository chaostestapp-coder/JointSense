import { createDemoTransport } from "./demoTransport";
import { createFirebaseRtdbTransport } from "./firebaseRtdbTransport";
import {
  CONNECTION_STATUS,
  createEmptyTestTelemetry,
  TRANSPORT_TYPES,
} from "./screeningSchema";

export function createManualTransport() {
  let currentTestId = "walk_10m";
  const listeners = new Set();

  const buildSnapshot = () =>
    createEmptyTestTelemetry(currentTestId, {
      sourceType: TRANSPORT_TYPES.MANUAL,
      isDemoData: false,
      connectionStatus: CONNECTION_STATUS.NOT_CONNECTED,
      statusMessage:
        "Manual clinical entry mode. Switch to Firebase Realtime Database to receive live ESP32 sensor payloads.",
    });

  const emit = () => {
    const snap = buildSnapshot();
    listeners.forEach((cb) => cb(snap));
  };

  return {
    type: TRANSPORT_TYPES.MANUAL,
    label: "Manual Entry (No Live Stream)",
    isConfigured: true,
    getCapabilities() {
      return {
        supportsLiveStream: false,
        rtdbPath: null,
        staleTimeoutMs: 3000,
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(buildSnapshot());
      return () => {
        listeners.delete(listener);
      };
    },
    async connect() {
      emit();
    },
    async disconnect() {
      emit();
    },
    setActiveTest(testId) {
      currentTestId = testId;
      emit();
    },
    async startTest(testId) {
      currentTestId = testId;
      emit();
    },
    async pauseTest() {},
    async completeTest() {},
  };
}

export function createScreeningTransport(transportType) {
  switch (transportType) {
    case TRANSPORT_TYPES.FIREBASE_RTDB:
      return createFirebaseRtdbTransport();
    case TRANSPORT_TYPES.DEMO:
      return createDemoTransport();
    case TRANSPORT_TYPES.MANUAL:
    default:
      return createManualTransport();
  }
}
