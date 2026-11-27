import { useState } from "react";
import { ChevronDown, ChevronUp, Footprints, Wifi } from "lucide-react";
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

function formatMetric(value, unit = "", decimals = null) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "Unavailable";
  }
  const num = Number(value);
  const formatted = decimals !== null ? num.toFixed(decimals) : String(num);
  return unit ? `${formatted} ${unit}` : formatted;
}

function formatReceiptTime(receivedAtMs) {
  if (!receivedAtMs) return "—";
  return new Date(receivedAtMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatFootContact(footContact) {
  if (footContact === true) return "In contact";
  if (footContact === false) return "No contact";
  return "Unavailable";
}

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
  const [showInsoleDetails, setShowInsoleDetails] = useState(false);

  const kneeStatus =
    telemetry?.connectionStatus || CONNECTION_STATUS.NOT_CONNECTED;
  const insoleStatus =
    insoleTelemetry?.connectionStatus || INSOLE_CONNECTION_STATUS.NOT_CONNECTED;

  const isKneeRunning = ACTIVE_KNEE_STATES.has(kneeStatus);
  const isInsoleRunning = ACTIVE_INSOLE_STATES.has(insoleStatus);
  const isAnyRunning = isKneeRunning || isInsoleRunning;

  const kp = telemetry?.processed || {};
  const kTiming = telemetry?.timing || {};
  const isKneeStale = Boolean(telemetry?.isStale);

  const ip = insoleTelemetry?.processed || {};
  const fsr = ip.fsr || {};
  const balance = ip.balance || {};
  const iAcc = insoleTelemetry?.rawImu?.acc || {};
  const iGyro = insoleTelemetry?.rawImu?.gyro || {};
  const iTiming = insoleTelemetry?.timing || {};
  const isInsoleStale = Boolean(insoleTelemetry?.isStale);

  return (
    <section
      aria-label="Sensor monitoring"
      className="bg-surface border border-border rounded-sm divide-y divide-border"
    >
      {/* Top Bar: Heading + Combined Listener Controls */}
      <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Sensor monitoring
          </h2>
          <p className="text-xs text-secondary mt-0.5">
            Both knee sleeve and smart insole contribute to this screening.
            Screening continues normally if either device is unavailable.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
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

      {/* Dual-Sensor Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">
        {/* Knee Sleeve Panel */}
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
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
            </div>

            <div className="flex items-center gap-2">
              {capabilities?.rtdbPath && (
                <span className="text-[11px] text-muted font-mono">
                  {capabilities.rtdbPath}
                </span>
              )}
              {isKneeRunning && onDisconnectKnee && (
                <button
                  type="button"
                  onClick={onDisconnectKnee}
                  className="px-2 py-1 text-[11px] font-medium text-secondary hover:text-foreground bg-surface-muted border border-border rounded-sm"
                >
                  Stop
                </button>
              )}
            </div>
          </div>

          <dl
            className={`grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs ${
              isKneeStale ? "opacity-65" : ""
            }`}
          >
            <div className="p-2 bg-surface-muted/40 border border-border rounded-sm">
              <dt className="text-secondary">Knee angle</dt>
              <dd className="text-sm font-semibold text-foreground mt-0.5">
                {formatMetric(kp.kneeAngleDeg, "°", 1)}
              </dd>
            </div>
            <div className="p-2 bg-surface-muted/40 border border-border rounded-sm">
              <dt className="text-secondary">Walking speed</dt>
              <dd className="text-sm font-semibold text-foreground mt-0.5">
                {formatMetric(kp.walkingSpeedMs, "m/s", 2)}
              </dd>
            </div>
            <div className="p-2 bg-surface-muted/40 border border-border rounded-sm">
              <dt className="text-secondary">Steps</dt>
              <dd className="text-sm font-semibold text-foreground mt-0.5">
                {formatMetric(kp.steps, "", 0)}
              </dd>
            </div>
            <div className="p-2 bg-surface-muted/40 border border-border rounded-sm">
              <dt className="text-secondary">Vibration RMS</dt>
              <dd className="text-sm font-semibold text-foreground mt-0.5">
                {formatMetric(kp.vibration?.rms)}
              </dd>
            </div>
            <div className="p-2 bg-surface-muted/40 border border-border rounded-sm col-span-2 sm:col-span-2">
              <dt className="text-secondary">Last data received</dt>
              <dd className="text-sm font-mono font-medium text-foreground mt-0.5">
                {formatReceiptTime(kTiming.receivedAtMs)}
              </dd>
            </div>
          </dl>

          {telemetry?.statusMessage && (
            <p className="text-xs text-secondary">{telemetry.statusMessage}</p>
          )}

          {connectError && (
            <div
              role="alert"
              className="px-3 py-1.5 text-xs bg-danger-bg text-danger-text border border-danger-border rounded-sm"
            >
              {connectError}
            </div>
          )}
        </div>

        {/* Smart Insole Panel */}
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
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
            </div>

            <div className="flex items-center gap-2">
              {insoleCapabilities?.rtdbPath && (
                <span className="text-[11px] text-muted font-mono">
                  {insoleCapabilities.rtdbPath}
                </span>
              )}
              {isInsoleRunning && onDisconnectInsole && (
                <button
                  type="button"
                  onClick={onDisconnectInsole}
                  className="px-2 py-1 text-[11px] font-medium text-secondary hover:text-foreground bg-surface-muted border border-border rounded-sm"
                >
                  Stop
                </button>
              )}
            </div>
          </div>

          <dl
            className={`grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs ${
              isInsoleStale ? "opacity-65" : ""
            }`}
          >
            <div className="p-2 bg-surface-muted/40 border border-border rounded-sm">
              <dt className="text-secondary">Shoe angle</dt>
              <dd className="text-sm font-semibold text-foreground mt-0.5">
                {formatMetric(ip.shoeAngleDeg, "°", 1)}
              </dd>
            </div>
            <div className="p-2 bg-surface-muted/40 border border-border rounded-sm">
              <dt className="text-secondary">Foot contact</dt>
              <dd className="text-sm font-semibold text-foreground mt-0.5">
                {formatFootContact(ip.footContact)}
              </dd>
            </div>
            <div className="p-2 bg-surface-muted/40 border border-border rounded-sm">
              <dt className="text-secondary">Total pressure</dt>
              <dd className="text-sm font-semibold text-foreground mt-0.5">
                {formatMetric(fsr.total)}
              </dd>
            </div>
            <div className="p-2 bg-surface-muted/40 border border-border rounded-sm col-span-2">
              <dt className="text-secondary">
                Pressure (Heel / Inner / Outer / Toe)
              </dt>
              <dd className="text-xs font-mono font-medium text-foreground mt-1">
                {formatMetric(fsr.heel)} / {formatMetric(fsr.inner)} /{" "}
                {formatMetric(fsr.outer)} / {formatMetric(fsr.toe)}
              </dd>
            </div>
            <div className="p-2 bg-surface-muted/40 border border-border rounded-sm">
              <dt className="text-secondary">Last data received</dt>
              <dd className="text-sm font-mono font-medium text-foreground mt-0.5">
                {formatReceiptTime(iTiming.receivedAtMs)}
              </dd>
            </div>
          </dl>

          {/* Expandable secondary details for IMU & balance */}
          <div>
            <button
              type="button"
              aria-expanded={showInsoleDetails}
              onClick={() => setShowInsoleDetails((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-link hover:underline"
            >
              {showInsoleDetails ? (
                <>
                  <ChevronUp size={14} strokeWidth={1.75} aria-hidden="true" />
                  <span>Hide IMU & balance details</span>
                </>
              ) : (
                <>
                  <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
                  <span>Show IMU & balance details</span>
                </>
              )}
            </button>

            {showInsoleDetails && (
              <dl className="mt-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="p-2 bg-surface-muted/30 border border-border rounded-sm">
                  <dt className="text-secondary">
                    Balance (Heel / Inner / Outer / Toe)
                  </dt>
                  <dd className="font-mono text-foreground mt-1">
                    {formatMetric(balance.heelPct, "%")} /{" "}
                    {formatMetric(balance.innerPct, "%")} /{" "}
                    {formatMetric(balance.outerPct, "%")} /{" "}
                    {formatMetric(balance.toePct, "%")}
                  </dd>
                </div>
                <div className="p-2 bg-surface-muted/30 border border-border rounded-sm">
                  <dt className="text-secondary">Accelerometer (X, Y, Z)</dt>
                  <dd className="font-mono text-foreground mt-1">
                    {formatMetric(iAcc.x, "", 2)}, {formatMetric(iAcc.y, "", 2)}
                    , {formatMetric(iAcc.z, "", 2)}
                  </dd>
                </div>
                <div className="p-2 bg-surface-muted/30 border border-border rounded-sm">
                  <dt className="text-secondary">Gyroscope (X, Y, Z)</dt>
                  <dd className="font-mono text-foreground mt-1">
                    {formatMetric(iGyro.x, "", 1)},{" "}
                    {formatMetric(iGyro.y, "", 1)},{" "}
                    {formatMetric(iGyro.z, "", 1)}
                  </dd>
                </div>
              </dl>
            )}
          </div>

          {insoleTelemetry?.statusMessage && (
            <p className="text-xs text-secondary">
              {insoleTelemetry.statusMessage}
            </p>
          )}

          {insoleConnectError && (
            <div
              role="alert"
              className="px-3 py-1.5 text-xs bg-danger-bg text-danger-text border border-danger-border rounded-sm"
            >
              {insoleConnectError}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
