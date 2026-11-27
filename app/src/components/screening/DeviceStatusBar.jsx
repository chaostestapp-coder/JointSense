import { Radio, Wifi } from "lucide-react";
import {
  CONNECTION_STATUS,
  TRANSPORT_TYPES,
} from "../../services/transports/screeningSchema";
import StatusBadge from "../common/StatusBadge";

const ACTIVE_LISTENER_STATES = new Set([
  CONNECTION_STATUS.CONNECTING,
  CONNECTION_STATUS.LISTENER_ACTIVE,
  CONNECTION_STATUS.WAITING_FOR_ESP32,
  CONNECTION_STATUS.RECEIVING,
  CONNECTION_STATUS.STALE,
  CONNECTION_STATUS.DEMO,
]);

export default function DeviceStatusBar({
  transportType,
  onChangeTransport,
  telemetry,
  capabilities,
  onConnect,
  onDisconnect,
  connectError,
}) {
  const isDemo = Boolean(telemetry?.isDemoData);
  const status = telemetry?.connectionStatus || CONNECTION_STATUS.NOT_CONNECTED;
  const isListenerRunning = ACTIVE_LISTENER_STATES.has(status);

  const TransportIcon =
    transportType === TRANSPORT_TYPES.FIREBASE_RTDB ? Wifi : Radio;

  return (
    <section
      aria-label="Firebase sensor listener status"
      className="bg-surface border border-border rounded-sm divide-y divide-border"
    >
      <div className="px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <TransportIcon
              size={16}
              strokeWidth={1.75}
              className="text-secondary shrink-0"
              aria-hidden="true"
            />
            <label
              htmlFor="transport-selector"
              className="text-xs font-medium text-secondary"
            >
              Data source
            </label>
            <select
              id="transport-selector"
              value={transportType}
              onChange={(e) => onChangeTransport(e.target.value)}
              className="px-2.5 py-1.5 bg-surface border border-border rounded-sm text-sm text-foreground"
            >
              <option value={TRANSPORT_TYPES.FIREBASE_RTDB}>
                Wi-Fi + Firebase Realtime Database
              </option>
              <option value={TRANSPORT_TYPES.MANUAL}>
                Manual Entry (No Live Stream)
              </option>
              <option value={TRANSPORT_TYPES.DEMO}>
                Demo Preview (Sample Data Only)
              </option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="text-secondary">
              Status: <StatusBadge status={status} />
            </span>
            {transportType === TRANSPORT_TYPES.FIREBASE_RTDB &&
              capabilities?.rtdbPath && (
                <span className="text-muted font-mono">
                  Path: {capabilities.rtdbPath}
                </span>
              )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {transportType !== TRANSPORT_TYPES.MANUAL &&
            (!isListenerRunning ? (
              <button
                type="button"
                onClick={onConnect}
                className="px-3 py-1.5 text-xs font-medium bg-accent hover:bg-accent-hover text-accent-foreground rounded-sm"
              >
                {transportType === TRANSPORT_TYPES.DEMO
                  ? "Start demo preview"
                  : "Start sensor listener"}
              </button>
            ) : (
              <button
                type="button"
                onClick={onDisconnect}
                className="px-3 py-1.5 text-xs font-medium text-secondary hover:text-foreground bg-surface-muted hover:bg-surface-hover border border-border rounded-sm"
              >
                {transportType === TRANSPORT_TYPES.DEMO
                  ? "Stop demo preview"
                  : "Stop sensor listener"}
              </button>
            ))}
        </div>
      </div>

      {isDemo && (
        <div
          role="status"
          className="px-4 py-2 text-xs bg-warning-bg text-warning-text border-t border-warning-border"
        >
          <strong>DEMONSTRATION DATA ONLY:</strong> Synthetic sample readings are
          displayed for interface preview. Demo readings are blocked from saving
          as real patient measurements.
        </div>
      )}

      {!isDemo && telemetry?.statusMessage && (
        <div className="px-4 py-2 text-xs text-secondary bg-surface-muted/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span>{telemetry.statusMessage}</span>
          {transportType === TRANSPORT_TYPES.FIREBASE_RTDB && (
            <span className="text-muted">
              ESP32 publishes to Firebase; React listens via RTDB (stale timeout:{" "}
              {((capabilities?.staleTimeoutMs || 3000) / 1000).toFixed(1)} s).
            </span>
          )}
        </div>
      )}

      {connectError && (
        <div
          role="alert"
          className="px-4 py-2 text-xs bg-danger-bg text-danger-text"
        >
          {connectError}
        </div>
      )}
    </section>
  );
}
