import { Footprints, Wifi } from "lucide-react";
import { CONNECTION_STATUS } from "../../services/transports/screeningSchema";
import { INSOLE_CONNECTION_STATUS } from "../../services/transports/insoleSchema";
import StatusBadge from "../common/StatusBadge";

const ACTIVE_KNEE_STATES = new Set([
  CONNECTION_STATUS.CONNECTING,
  CONNECTION_STATUS.LISTENER_ACTIVE,
  CONNECTION_STATUS.WAITING_FOR_ESP32,
  CONNECTION_STATUS.RECEIVING,
  CONNECTION_STATUS.STALE,
]);

const ACTIVE_INSOLE_STATES = new Set([
  INSOLE_CONNECTION_STATUS.CONNECTING,
  INSOLE_CONNECTION_STATUS.LISTENER_ACTIVE,
  INSOLE_CONNECTION_STATUS.WAITING_FOR_HARDWARE,
  INSOLE_CONNECTION_STATUS.RECEIVING,
  INSOLE_CONNECTION_STATUS.STALE,
]);

export default function DeviceStatusBar({
  telemetry,
  capabilities,
  insoleTelemetry,
  insoleCapabilities,
  disabled = false,
  onConnectAll,
  onDisconnectAll,
  onDisconnectKnee,
  onDisconnectInsole,
  connectError,
  insoleConnectError,
}) {
  const kneeStatus =
    telemetry?.connectionStatus || CONNECTION_STATUS.NOT_CONNECTED;
  const insoleStatus =
    insoleTelemetry?.connectionStatus || INSOLE_CONNECTION_STATUS.NOT_CONNECTED;

  const isKneeRunning = ACTIVE_KNEE_STATES.has(kneeStatus);
  const isInsoleRunning = ACTIVE_INSOLE_STATES.has(insoleStatus);
  const isAnyRunning = isKneeRunning || isInsoleRunning;

  return (
    <section
      aria-label="Sensor monitoring"
      className="bg-surface border border-border rounded-sm divide-y divide-border"
    >
      {/* Top Bar: Heading + Start/Stop Listener Controls */}
      <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex items-center gap-2">
            <Wifi
              size={15}
              strokeWidth={1.75}
              className="text-secondary shrink-0"
              aria-hidden="true"
            />
            <span className="text-sm font-semibold text-foreground">
              Knee Sleeve
            </span>
            <StatusBadge status={kneeStatus} />
            {capabilities?.rtdbPath && (
              <span className="text-[11px] text-muted font-mono hidden sm:inline">
                {capabilities.rtdbPath}
              </span>
            )}
            {isKneeRunning && onDisconnectKnee && (
              <button
                type="button"
                onClick={onDisconnectKnee}
                className="px-2 py-0.5 text-[11px] font-medium text-secondary hover:text-foreground bg-surface-muted border border-border rounded-sm"
              >
                Stop
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Footprints
              size={15}
              strokeWidth={1.75}
              className="text-secondary shrink-0"
              aria-hidden="true"
            />
            <span className="text-sm font-semibold text-foreground">
              Smart Insole
            </span>
            <StatusBadge status={insoleStatus} />
            {insoleCapabilities?.rtdbPath && (
              <span className="text-[11px] text-muted font-mono hidden sm:inline">
                {insoleCapabilities.rtdbPath}
              </span>
            )}
            {isInsoleRunning && onDisconnectInsole && (
              <button
                type="button"
                onClick={onDisconnectInsole}
                className="px-2 py-0.5 text-[11px] font-medium text-secondary hover:text-foreground bg-surface-muted border border-border rounded-sm"
              >
                Stop
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isAnyRunning ? (
            <button
              type="button"
              disabled={disabled}
              onClick={onConnectAll}
              className="px-3.5 py-2 text-xs font-medium bg-accent hover:bg-accent-hover text-accent-foreground rounded-sm"
            >
              Start sensor listener
            </button>
          ) : (
            <button
              type="button"
              onClick={onDisconnectAll}
              className="px-3.5 py-2 text-xs font-medium text-secondary hover:text-foreground bg-surface-muted hover:bg-surface-hover border border-border rounded-sm"
            >
              Stop sensor listeners
            </button>
          )}
        </div>
      </div>

      {(connectError || insoleConnectError) && (
        <div className="px-4 py-2 space-y-1 bg-danger-bg text-danger-text text-xs" role="alert">
          {connectError && <div>Knee sleeve: {connectError}</div>}
          {insoleConnectError && <div>Smart insole: {insoleConnectError}</div>}
        </div>
      )}
    </section>
  );
}
