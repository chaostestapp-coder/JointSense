import { onValue, ref } from "firebase/database";
import { isRtdbConfigured, rtdb } from "../../config/firebase.js";
import {
  createEmptyInsoleTelemetry,
  INSOLE_CONNECTION_STATUS,
  mapShoeInsolePayload,
  normalizeInsolePayload,
} from "./insoleSchema.js";

const DEFAULT_SHOE_RTDB_PATH = "/shoe/live";
const DEFAULT_STALE_TIMEOUT_MS = 3000;
const MAX_HISTORY_SAMPLES = 40;

export function getConfiguredInsoleRtdbPath() {
  return (
    import.meta.env?.VITE_FIREBASE_RTDB_SHOE_PATH ||
    import.meta.env?.VITE_FIREBASE_RTDB_INSOLE_PATH ||
    DEFAULT_SHOE_RTDB_PATH
  );
}

export function getConfiguredInsoleStaleTimeoutMs() {
  const parsed = Number(import.meta.env?.VITE_FIREBASE_INSOLE_STALE_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_STALE_TIMEOUT_MS;
}

/**
 * Independent Firebase Realtime Database transport for the Smart Insole.
 *
 * Does NOT subscribe to any path unless `VITE_FIREBASE_RTDB_INSOLE_PATH` (or
 * explicit `rtdbPath` option) AND a confirmed `payloadMapper` are provided.
 */
export function createFirebaseInsoleTransport(options = {}) {
  const rtdbInstance = options.rtdb !== undefined ? options.rtdb : rtdb;
  const rtdbConfigured =
    options.isRtdbConfigured !== undefined
      ? options.isRtdbConfigured
      : isRtdbConfigured;
  const rtdbPath =
    options.rtdbPath !== undefined
      ? options.rtdbPath
      : getConfiguredInsoleRtdbPath();
  const staleTimeoutMs =
    options.staleTimeoutMs || getConfiguredInsoleStaleTimeoutMs();
  const payloadMapper =
    options.payloadMapper !== undefined
      ? options.payloadMapper
      : mapShoeInsolePayload;
  const subscribeImpl = options.onValueImpl || onValue;
  const refImpl = options.refImpl || ref;
  const nowFn = options.nowFn || (() => Date.now());

  const hasPath = Boolean(rtdbPath && String(rtdbPath).trim());
  const hasMapper = typeof payloadMapper === "function";
  const isIntegrationReady = Boolean(rtdbConfigured && hasPath && hasMapper);

  let unsubscribeRtdb = null;
  let staleTimer = null;
  let historyBuffer = [];
  const listeners = new Set();

  const buildInitialStatus = () => {
    if (!rtdbConfigured) {
      return {
        connectionStatus: INSOLE_CONNECTION_STATUS.NOT_CONFIGURED,
        statusMessage:
          "Firebase Realtime Database is not configured in app/.env.",
      };
    }
    if (!hasPath || !hasMapper) {
      return {
        connectionStatus: INSOLE_CONNECTION_STATUS.PENDING_SPECS,
        statusMessage:
          "Smart insole integration is pending hardware specifications (RTDB path, pressure sensor schema, and ankle angle format).",
      };
    }
    return {
      connectionStatus: INSOLE_CONNECTION_STATUS.NOT_CONNECTED,
      statusMessage: `Ready to listen to ${rtdbPath} for smart insole readings.`,
    };
  };

  let latestState = createEmptyInsoleTelemetry({
    rtdbPath: hasPath ? rtdbPath : null,
    ...buildInitialStatus(),
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
          connectionStatus: INSOLE_CONNECTION_STATUS.STALE,
          isLive: false,
          isStale: true,
          statusMessage: `No new smart insole payload received in over ${(
            staleTimeoutMs / 1000
          ).toFixed(1)} s. Readings are stale.`,
        });
      }
    }, Math.min(500, Math.max(40, Math.floor(staleTimeoutMs / 4))));
  };

  const handleSnapshotValue = (raw) => {
    const parsed = normalizeInsolePayload(raw, payloadMapper);

    if (!parsed.valid) {
      if (parsed.isEmpty) {
        stopStaleMonitor();
        emit(
          createEmptyInsoleTelemetry({
            rtdbPath,
            connectionStatus: INSOLE_CONNECTION_STATUS.WAITING_FOR_HARDWARE,
            isLive: false,
            isStale: false,
            statusMessage: `Firebase listener active on ${rtdbPath}; waiting for smart insole payload.`,
            historyBuffer,
          })
        );
        return;
      }

      emit(
        createEmptyInsoleTelemetry({
          rtdbPath,
          connectionStatus: INSOLE_CONNECTION_STATUS.ERROR,
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
      shoeAngleDeg: parsed.processed?.shoeAngleDeg ?? parsed.ankle.angle,
      ankleAngle: parsed.ankle.angle,
      ankleUnit: parsed.ankle.unit,
      totalPressure: parsed.processed?.fsr?.total ?? null,
      footContact: parsed.processed?.footContact ?? null,
    };
    historyBuffer = [...historyBuffer, sample].slice(-MAX_HISTORY_SAMPLES);

    startStaleMonitor();
    emit(
      createEmptyInsoleTelemetry({
        rtdbPath,
        connectionStatus: INSOLE_CONNECTION_STATUS.RECEIVING,
        isLive: true,
        isStale: false,
        statusMessage: `Receiving smart insole payloads from ${rtdbPath}.`,
        processed: parsed.processed,
        rawImu: parsed.rawImu,
        sole: parsed.sole,
        ankle: parsed.ankle,
        timing: {
          deviceTimestamp: parsed.deviceTimestamp,
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
      createEmptyInsoleTelemetry({
        rtdbPath: hasPath ? rtdbPath : null,
        connectionStatus: isPermissionDenied
          ? INSOLE_CONNECTION_STATUS.PERMISSION_DENIED
          : INSOLE_CONNECTION_STATUS.ERROR,
        isLive: false,
        isStale: false,
        statusMessage: isPermissionDenied
          ? `Firebase Realtime Database permission denied for ${rtdbPath}.`
          : error?.message || "Smart insole Firebase connection error.",
        historyBuffer,
      })
    );
  };

  return {
    deviceType: "smart_insole",
    isIntegrationReady,
    getCapabilities() {
      return {
        rtdbPath: hasPath ? rtdbPath : null,
        staleTimeoutMs,
        hasMapper,
        isIntegrationReady,
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
      if (!isIntegrationReady || !rtdbInstance) {
        const initState = createEmptyInsoleTelemetry({
          rtdbPath: hasPath ? rtdbPath : null,
          ...buildInitialStatus(),
        });
        emit(initState);
        throw new Error(initState.statusMessage);
      }

      if (unsubscribeRtdb) return;

      emit(
        createEmptyInsoleTelemetry({
          rtdbPath,
          connectionStatus: INSOLE_CONNECTION_STATUS.CONNECTING,
          statusMessage: `Connecting to smart insole path (${rtdbPath})...`,
          historyBuffer,
        })
      );

      const targetRef = refImpl(rtdbInstance, rtdbPath);

      emit(
        createEmptyInsoleTelemetry({
          rtdbPath,
          connectionStatus: INSOLE_CONNECTION_STATUS.LISTENER_ACTIVE,
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
        createEmptyInsoleTelemetry({
          rtdbPath: hasPath ? rtdbPath : null,
          ...buildInitialStatus(),
        })
      );
    },
  };
}
