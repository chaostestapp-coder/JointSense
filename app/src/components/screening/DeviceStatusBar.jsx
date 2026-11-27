import { Wifi } from "lucide-react";
import { CONNECTION_STATUS } from "../../services/transports/screeningSchema";
import StatusBadge from "../common/StatusBadge";

const ACTIVE_LISTENER_STATES = new Set([
  CONNECTION_STATUS.CONNECTING,
  CONNECTION_STATUS.LISTENER_ACTIVE,
  CONNECTION_STATUS.WAITING_FOR_ESP32,
  CONNECTION_STATUS.RECEIVING,
  CONNECTION_STATUS.STALE,
]);

export default function DeviceStatusBar({
  telemetry,
  capabilities,
  disabled = false,
  onConnect,
  onDisconnect,
  connectError,
}) {
  const status = telemetry?.connectionStatus || CONNECTION_STATUS.NOT_CONNECTED;
  const isListenerRunning = ACTIVE_LISTENER_STATES.has(status);

  return (
    <section
      aria-label="Firebase sensor listener status"
      className="bg-surface border border-border rounded-sm divide-y divide-border"
    >
      <div className="px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <Wifi
              size={16}
              strokeWidth={1.75}
              className="text-secondary shrink-0"
              aria-hidden="true"
            />
            <span className="font-semibold text-sm text-foreground">
              Firebase Realtime Database
            </span>
          </div>

          <span className="text-secondary">
            Status: <StatusBadge status={status} />
          </span>

          {capabilities?.rtdbPath && (
            <span className="text-muted font-mono">
              Path: {capabilities.rtdbPath}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isListenerRunning ? (
            <button
              type="button"
              disabled={disabled}
              onClick={onConnect}
              className="px-3 py-1.5 text-xs font-medium bg-accent hover:bg-accent-hover text-accent-foreground rounded-sm"
            >
              Start sensor listener
            </button>
          ) : (
            <button
              type="button"
              onClick={onDisconnect}
              className="px-3 py-1.5 text-xs font-medium text-secondary hover:text-foreground bg-surface-muted hover:bg-surface-hover border border-border rounded-sm"
            >
              Stop sensor listener
            </button>
          )}
        </div>
      </div>

      {telemetry?.statusMessage && (
        <div className="px-4 py-2 text-xs text-secondary bg-surface-muted/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span>{telemetry.statusMessage}</span>
          <span className="text-muted">
            ESP32 publishes to Firebase; React listens via RTDB (stale timeout:{" "}
            {((capabilities?.staleTimeoutMs || 3000) / 1000).toFixed(1)} s).
          </span>
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
