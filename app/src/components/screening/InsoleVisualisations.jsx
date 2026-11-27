import { Footprints } from "lucide-react";
import { INSOLE_CONNECTION_STATUS } from "../../services/transports/insoleSchema";
import StatusBadge from "../common/StatusBadge";

const ACTIVE_INSOLE_STATES = new Set([
  INSOLE_CONNECTION_STATUS.CONNECTING,
  INSOLE_CONNECTION_STATUS.LISTENER_ACTIVE,
  INSOLE_CONNECTION_STATUS.WAITING_FOR_HARDWARE,
  INSOLE_CONNECTION_STATUS.RECEIVING,
  INSOLE_CONNECTION_STATUS.STALE,
]);

function formatReceiptTime(receivedAtMs) {
  if (!receivedAtMs) return "—";
  return new Date(receivedAtMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function SolePressureDistribution({ pressureDistribution, isStale }) {
  if (!pressureDistribution) {
    return (
      <div className="border border-border rounded-sm bg-surface p-3.5 space-y-2">
        <div className="text-sm font-semibold text-foreground">
          Sole: Pressure distribution
        </div>
        <div className="h-28 flex items-center justify-center border border-dashed border-border rounded-sm bg-surface-muted/30 px-4 text-center">
          <span className="text-xs text-muted">
            Pressure distribution unavailable — awaiting confirmed FSR channel
            count, sensor positions, foot side, and pressure units from hardware
            team.
          </span>
        </div>
      </div>
    );
  }

  const { mode, unit, footSide, channels, aggregatedValue, label } =
    pressureDistribution;

  return (
    <div
      className={`border border-border rounded-sm bg-surface p-3.5 space-y-2.5 ${
        isStale ? "opacity-65" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-foreground">
          Sole: Pressure distribution
          {footSide ? ` (${footSide})` : ""}
        </div>
        <span className="text-[11px] text-muted">
          {isStale ? "Stale" : mode || "Verified"}
        </span>
      </div>

      {Array.isArray(channels) && channels.length > 0 ? (
        <dl className="divide-y divide-border text-xs">
          {channels.map((ch) => (
            <div key={ch.id} className="py-1.5 flex items-center justify-between">
              <dt className="text-secondary">{ch.label}</dt>
              <dd className="font-medium text-foreground">
                {ch.value} {unit || ""}
              </dd>
            </div>
          ))}
        </dl>
      ) : aggregatedValue !== null && aggregatedValue !== undefined ? (
        <div className="p-2.5 bg-surface-muted/40 border border-border rounded-sm flex items-baseline justify-between">
          <span className="text-xs text-secondary">
            {label || "Aggregated pressure"}
          </span>
          <strong className="text-base font-semibold text-foreground">
            {aggregatedValue} {unit || ""}
          </strong>
        </div>
      ) : (
        <div className="text-xs text-muted">
          No pressure channels present in latest insole payload.
        </div>
      )}
    </div>
  );
}

export function AnkleAngleDisplay({ ankle, historyBuffer, isStale }) {
  const hasAngle = ankle?.angle !== null && ankle?.angle !== undefined;
  const validSamples = (historyBuffer || []).filter(
    (s) => s.ankleAngle !== null && s.ankleAngle !== undefined
  );

  return (
    <div
      className={`border border-border rounded-sm bg-surface p-3.5 space-y-2.5 ${
        isStale ? "opacity-65" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-foreground">
          Ankle: Ankle angle
        </div>
        <span className="text-[11px] text-muted">
          {isStale ? "Stale" : hasAngle ? "Insole IMU" : "Awaiting spec"}
        </span>
      </div>

      {!hasAngle ? (
        <div className="h-28 flex items-center justify-center border border-dashed border-border rounded-sm bg-surface-muted/30 px-4 text-center">
          <span className="text-xs text-muted">
            Ankle angle unavailable — awaiting confirmed field name, unit, and
            zero-reference specification from hardware team.
          </span>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="p-2.5 bg-surface-muted/40 border border-border rounded-sm flex items-baseline justify-between">
            <span className="text-xs text-secondary">
              {ankle.reference || "Measured ankle angle"}
            </span>
            <strong className="text-base font-semibold text-foreground">
              {ankle.angle} {ankle.unit || ""}
            </strong>
          </div>
          {validSamples.length >= 2 && (
            <div className="text-xs text-muted">
              In-session buffer: {validSamples.length} verified samples recorded.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function InsoleVisualisations({
  insoleTelemetry,
  capabilities,
  disabled = false,
  onConnect,
  onDisconnect,
  connectError,
}) {
  const status =
    insoleTelemetry?.connectionStatus ||
    INSOLE_CONNECTION_STATUS.PENDING_SPECS;
  const isListenerRunning = ACTIVE_INSOLE_STATES.has(status);
  const canConnect = Boolean(capabilities?.isIntegrationReady);

  return (
    <section
      aria-label="Smart insole integration status and measurements"
      className="bg-surface border border-border rounded-sm divide-y divide-border"
    >
      <div className="px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Footprints
              size={16}
              strokeWidth={1.75}
              className="text-secondary shrink-0"
              aria-hidden="true"
            />
            <span className="font-semibold text-sm text-foreground">
              Smart Insole (Independent Device)
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

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-muted">
            Last received:{" "}
            <strong className="font-mono text-foreground">
              {formatReceiptTime(insoleTelemetry?.timing?.receivedAtMs)}
            </strong>
          </span>

          {!isListenerRunning ? (
            <button
              type="button"
              disabled={disabled || !canConnect}
              onClick={onConnect}
              title={
                canConnect
                  ? "Start smart insole listener"
                  : "Awaiting confirmed smart insole Firebase path and payload schema"
              }
              className="px-3 py-1.5 text-xs font-medium text-foreground bg-surface-muted hover:bg-surface-hover border border-border rounded-sm"
            >
              Start insole listener
            </button>
          ) : (
            <button
              type="button"
              onClick={onDisconnect}
              className="px-3 py-1.5 text-xs font-medium text-secondary hover:text-foreground bg-surface-muted hover:bg-surface-hover border border-border rounded-sm"
            >
              Stop insole listener
            </button>
          )}
        </div>
      </div>

      {insoleTelemetry?.statusMessage && (
        <div className="px-4 py-2 text-xs text-secondary bg-surface-muted/40">
          {insoleTelemetry.statusMessage}
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

      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <SolePressureDistribution
          pressureDistribution={insoleTelemetry?.sole?.pressureDistribution}
          isStale={Boolean(insoleTelemetry?.isStale)}
        />
        <AnkleAngleDisplay
          ankle={insoleTelemetry?.ankle}
          historyBuffer={insoleTelemetry?.historyBuffer}
          isStale={Boolean(insoleTelemetry?.isStale)}
        />
      </div>
    </section>
  );
}
