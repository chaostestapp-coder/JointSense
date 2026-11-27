import { onValue, ref } from "firebase/database";
import { isRtdbConfigured, rtdb } from "../../config/firebase.js";
import {
  CONNECTION_STATUS,
  createEmptyTestTelemetry,
  parseEsp32KneeSleevePayload,
  TRANSPORT_TYPES,
} from "./screeningSchema.js";

const DEFAULT_RTDB_PATH = "/knee_sleeve/live";
const DEFAULT_STALE_TIMEOUT_MS = 3000;
const MAX_HISTORY_SAMPLES = 40;

export function getConfiguredRtdbPath() {
  return import.meta.env?.VITE_FIREBASE_RTDB_KNEE_SLEEVE_PATH || DEFAULT_RTDB_PATH;
}

export function getConfiguredStaleTimeoutMs() {
  const parsed = Number(import.meta.env?.VITE_FIREBASE_STALE_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_STALE_TIMEOUT_MS;
}

/**
 * Firebase Realtime Database transport for ESP32 knee sleeve live data.
 *
 * Uses one active `onValue` subscription on `/knee_sleeve/live` (configurable
 * via VITE_FIREBASE_RTDB_KNEE_SLEEVE_PATH). Tracks local browser receipt time
 * for stale-data detection without assuming ESP32 timestamp units.
 */
export function createFirebaseRtdbTransport(options = {}) {
  const rtdbInstance = options.rtdb !== undefined ? options.rtdb : rtdb;
  const rtdbConfigured =
    options.isRtdbConfigured !== undefined
      ? options.isRtdbConfigured
      : isRtdbConfigured;
  const rtdbPath = options.rtdbPath || getConfiguredRtdbPath();
  const staleTimeoutMs = options.staleTimeoutMs || getConfiguredStaleTimeoutMs();
  const subscribeImpl = options.onValueImpl || onValue;
  const refImpl = options.refImpl || ref;
  const nowFn = options.nowFn || (() => Date.now());

  let currentTestId = "walk_10m";
  let unsubscribeRtdb = null;
  let staleTimer = null;
  let historyBuffer = [];
  let latestState = null;

  const listeners = new Set();

  const buildBase = (overrides = {}) =>
    createEmptyTestTelemetry(currentTestId, {
      sourceType: TRANSPORT_TYPES.FIREBASE_RTDB,
      isDemoData: false,
      rtdbPath,
      ...overrides,
    });

  latestState = buildBase({
    connectionStatus: rtdbConfigured
      ? CONNECTION_STATUS.NOT_CONNECTED
      : CONNECTION_STATUS.CONFIG_MISSING,
    statusMessage: rtdbConfigured
      ? `Ready to listen to ${rtdbPath} on Firebase Realtime Database.`
      : "Firebase Realtime Database configuration is missing. Check VITE_FIREBASE_DATABASE_URL and Firebase keys in app/.env.",
  });

  const emit = (nextState) => {
    latestState = nextState;
    listeners.forEach((cb) => cb(nextState));
  };

  const stopStaleMonitor = () => {
    if (staleTimer) {
      clearInterval(staleTimer);
      staleTimer = null;
    }
  };

  const startStaleMonitor = () => {
    stopStaleMonitor();
    staleTimer = setInterval(() => {
      if (!latestState?.timing?.receivedAtMs) return;
      const ageMs = nowFn() - latestState.timing.receivedAtMs;
      if (ageMs > staleTimeoutMs && !latestState.isStale) {
        emit({
          ...latestState,
          connectionStatus: CONNECTION_STATUS.STALE,
          isLive: false,
          isStale: true,
          statusMessage: `No new ESP32 payload received in over ${(
            staleTimeoutMs / 1000
          ).toFixed(1)} s. Readings are stale.`,
        });
      }
    }, Math.min(500, Math.max(40, Math.floor(staleTimeoutMs / 4))));
  };

  const handleSnapshotValue = (raw) => {
    const parsed = parseEsp32KneeSleevePayload(raw);

    if (!parsed.valid) {
      if (parsed.isEmpty) {
        stopStaleMonitor();
        emit(
          buildBase({
            connectionStatus: CONNECTION_STATUS.WAITING_FOR_ESP32,
            isLive: false,
            isStale: false,
            statusMessage: `Connected to Firebase listener at ${rtdbPath}, waiting for ESP32 payload.`,
            historyBuffer,
          })
        );
        return;
      }

      emit(
        buildBase({
          connectionStatus: CONNECTION_STATUS.ERROR,
          isLive: false,
          isStale: false,
          statusMessage: parsed.reason,
          historyBuffer,
        })
      );
      return;
    }

    const receivedAtMs = nowFn();
    const sample = {
      receivedAtMs,
      kneeAngleDeg: parsed.processed.kneeAngleDeg,
      walkingSpeedMs: parsed.processed.walkingSpeedMs,
      vibrationRms: parsed.processed.vibration.rms,
    };
    historyBuffer = [...historyBuffer, sample].slice(-MAX_HISTORY_SAMPLES);

    startStaleMonitor();
    emit(
      buildBase({
        connectionStatus: CONNECTION_STATUS.RECEIVING,
        isLive: true,
        isStale: false,
        statusMessage: `Receiving ESP32 payloads from ${rtdbPath}.`,
        processed: parsed.processed,
        rawImu: parsed.rawImu,
        timing: {
          esp32Timestamp: parsed.esp32Timestamp,
          receivedAtMs,
        },
        historyBuffer,
      })
    );
  };

  const handleListenerError = (error) => {
    stopStaleMonitor();
    const code = String(error?.code || error?.message || "").toLowerCase();
    const isPermissionDenied =
      code.includes("permission_denied") || code.includes("permission-denied");

    emit(
      buildBase({
        connectionStatus: isPermissionDenied
          ? CONNECTION_STATUS.PERMISSION_DENIED
          : CONNECTION_STATUS.ERROR,
        isLive: false,
        isStale: false,
        statusMessage: isPermissionDenied
          ? `Firebase Realtime Database permission denied for ${rtdbPath}. Check your RTDB security rules.`
          : error?.message || "Firebase Realtime Database connection error.",
        historyBuffer,
      })
    );
  };

  return {
    type: TRANSPORT_TYPES.FIREBASE_RTDB,
    label: "Wi-Fi + Firebase Realtime Database",
    isConfigured: rtdbConfigured,
    getCapabilities() {
      return {
        supportsLiveStream: true,
        rtdbPath,
        staleTimeoutMs,
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(latestState);
      return () => {
        listeners.delete(listener);
      };
    },
    async connect() {
      if (!rtdbConfigured || !rtdbInstance) {
        const missingState = buildBase({
          connectionStatus: CONNECTION_STATUS.CONFIG_MISSING,
          statusMessage:
            "Firebase Realtime Database configuration is missing. Verify VITE_FIREBASE_DATABASE_URL and Firebase keys in app/.env.",
        });
        emit(missingState);
        throw new Error(missingState.statusMessage);
      }

      if (unsubscribeRtdb) {
        return;
      }

      emit(
        buildBase({
          connectionStatus: CONNECTION_STATUS.CONNECTING,
          statusMessage: `Connecting to Firebase Realtime Database (${rtdbPath})...`,
          historyBuffer,
        })
      );

      const targetRef = refImpl(rtdbInstance, rtdbPath);

      emit(
        buildBase({
          connectionStatus: CONNECTION_STATUS.LISTENER_ACTIVE,
          statusMessage: `Firebase listener active on ${rtdbPath}. Awaiting initial snapshot...`,
          historyBuffer,
        })
      );

      unsubscribeRtdb = subscribeImpl(
        targetRef,
        (snapshot) => {
          handleSnapshotValue(snapshot.val());
        },
        (error) => {
          handleListenerError(error);
        }
      );
    },
    async disconnect() {
      stopStaleMonitor();
      if (unsubscribeRtdb) {
        unsubscribeRtdb();
        unsubscribeRtdb = null;
      }
      historyBuffer = [];
      emit(
        buildBase({
          connectionStatus: rtdbConfigured
            ? CONNECTION_STATUS.NOT_CONNECTED
            : CONNECTION_STATUS.CONFIG_MISSING,
          isLive: false,
          isStale: false,
          statusMessage: rtdbConfigured
            ? `Listener stopped. Click Start sensor listener to subscribe to ${rtdbPath}.`
            : "Firebase Realtime Database configuration is missing.",
        })
      );
    },
    setActiveTest(testId) {
      currentTestId = testId;
      emit({
        ...latestState,
        testId,
      });
    },
    async startTest(testId) {
      currentTestId = testId;
      emit({
        ...latestState,
        testId,
      });
    },
    async pauseTest() {},
    async completeTest() {},
  };
}
