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
  insoleStatus,
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
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Wifi
              size={16}
              strokeWidth={1.75}
              className="text-secondary shrink-0"
              aria-hidden="true"
            />
            <span className="font-semibold text-sm text-foreground">
              Knee Sleeve Sensor
            </span>
          </div>

          <StatusBadge status={status} />

          {insoleStatus && (
            <span className="px-2 py-0.5 text-xs text-secondary bg-surface-muted border border-border rounded-[3px]">
              {insoleStatus}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isListenerRunning ? (
            <button
              type="button"
              disabled={disabled}
              onClick={onConnect}
              className="px-3.5 py-2 text-xs font-medium bg-accent hover:bg-accent-hover text-accent-foreground rounded-sm"
            >
              Start sensor listener
            </button>
          ) : (
            <button
              type="button"
              onClick={onDisconnect}
              className="px-3.5 py-2 text-xs font-medium text-secondary hover:text-foreground bg-surface-muted hover:bg-surface-hover border border-border rounded-sm"
            >
              Stop sensor listener
            </button>
          )}
        </div>
      </div>

      {telemetry?.statusMessage && (
        <div className="px-4 py-2 text-xs text-secondary bg-surface-muted/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span>{telemetry.statusMessage}</span>
          {capabilities?.rtdbPath && (
            <span className="text-muted font-mono">
              {capabilities.rtdbPath}
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
