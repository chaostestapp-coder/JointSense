import { CONNECTION_STATUS } from "../../services/transports/screeningSchema";

function formatValue(value, unit = "", decimals = null) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "Unavailable";
  }
  const num = Number(value);
  const formatted = decimals !== null ? num.toFixed(decimals) : String(num);
  return unit ? `${formatted} ${unit}` : formatted;
}

function formatBrowserReceiptTime(receivedAtMs) {
  if (!receivedAtMs) return "—";
  return new Date(receivedAtMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function LiveKneeTrendChart({ historyBuffer, isStale, isDemoData }) {
  const validSamples = (historyBuffer || []).filter(
    (s) => s.kneeAngleDeg !== null && s.kneeAngleDeg !== undefined
  );

  if (validSamples.length < 2) {
    return (
      <div className="border border-border rounded-sm bg-surface p-3.5 space-y-2">
        <div className="text-sm font-semibold text-foreground">
          Knee angle live trend (In-session buffer)
        </div>
        <div className="h-28 flex items-center justify-center border border-dashed border-border rounded-sm bg-surface-muted/30 px-4 text-center">
          <span className="text-xs text-muted">
            {validSamples.length === 1
              ? "1 snapshot received. Waiting for additional Firebase updates to plot trend."
              : "Waiting for live Firebase snapshots to build in-session trend."}
          </span>
        </div>
      </div>
    );
  }

  const width = 480;
  const height = 140;
  const padLeft = 32;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 22;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;
  const yMinRaw = Math.min(0, ...validSamples.map((s) => Number(s.kneeAngleDeg)));
  const yMin = yMinRaw < 0 ? Math.floor(yMinRaw / 10) * 10 : 0;
  const yMaxRaw = Math.max(150, ...validSamples.map((s) => Number(s.kneeAngleDeg)));
  const yMax = Math.ceil(yMaxRaw / 10) * 10;
  const ySpan = yMax - yMin || 1;

  const minT = validSamples[0].receivedAtMs;
  const maxT = validSamples[validSamples.length - 1].receivedAtMs;
  const spanT = maxT - minT || 1;

  const pathD = validSamples
    .map((pt, idx) => {
      const x = padLeft + ((pt.receivedAtMs - minT) / spanT) * innerW;
      const clampedDeg = Math.max(yMin, Math.min(yMax, Number(pt.kneeAngleDeg)));
      const y = padTop + (1 - (clampedDeg - yMin) / ySpan) * innerH;
      return `${idx === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div
      className={`border border-border rounded-sm bg-surface p-3.5 space-y-2 ${
        isStale ? "opacity-65" : ""
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-foreground">
          Knee angle live trend (In-session buffer · {validSamples.length}{" "}
          samples)
        </div>
        <div className="flex items-center gap-2">
          {isDemoData && (
            <span className="text-[11px] font-medium px-1.5 py-0.5 bg-warning-bg text-warning-text border border-warning-border rounded-xs">
              Demo
            </span>
          )}
          {isStale && (
            <span className="text-[11px] font-medium px-1.5 py-0.5 bg-warning-bg text-warning-text border border-warning-border rounded-xs">
              Stale
            </span>
          )}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-36"
        role="img"
        aria-label="In-session knee angle trend from received Firebase snapshots"
      >
        {[0, 0.5, 1].map((frac) => {
          const y = padTop + frac * innerH;
          const val = Math.round(yMax - frac * ySpan);
          return (
            <g key={frac}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="var(--border)"
                strokeWidth="1"
              />
              <text
                x={padLeft - 4}
                y={y + 3}
                textAnchor="end"
                fill="var(--muted)"
                fontSize="9"
              >
                {val}°
              </text>
            </g>
          );
        })}
        <path
          d={pathD}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <text x={padLeft} y={height - 5} fill="var(--muted)" fontSize="9">
          {formatBrowserReceiptTime(minT)}
        </text>
        <text
          x={width - padRight}
          y={height - 5}
          textAnchor="end"
          fill="var(--muted)"
          fontSize="9"
        >
          {formatBrowserReceiptTime(maxT)}
        </text>
      </svg>

      <p className="text-xs text-muted">
        Temporary in-browser buffer of actual received Firebase payloads;
        distinct from saved screening history.
      </p>
    </div>
  );
}

export default function SensorVisualisations({ test, telemetry }) {
  const status = telemetry?.connectionStatus || CONNECTION_STATUS.NOT_CONNECTED;
  const isStale = Boolean(telemetry?.isStale);
  const isDemoData = Boolean(telemetry?.isDemoData);
  const hasPayload = Boolean(telemetry?.timing?.receivedAtMs);

  const processed = telemetry?.processed || {};
  const vibration = processed.vibration || {};
  const rawImu = telemetry?.rawImu || {};
  const acc = rawImu.acc || {};
  const gyro = rawImu.gyro || {};
  const timing = telemetry?.timing || {};

  const showWaitingBanner = !hasPayload;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          Live ESP32 sensor readings ({test.shortName})
        </h3>
        <div className="flex items-center gap-3 text-xs text-secondary">
          <span>
            ESP32 timestamp:{" "}
            <strong className="font-mono text-foreground">
              {timing.esp32Timestamp !== null &&
              timing.esp32Timestamp !== undefined
                ? String(timing.esp32Timestamp)
                : "—"}
            </strong>
          </span>
          <span>
            Last received (browser):{" "}
            <strong className="font-mono text-foreground">
              {formatBrowserReceiptTime(timing.receivedAtMs)}
            </strong>
          </span>
        </div>
      </div>

      {isStale && (
        <div
          role="alert"
          className="px-3.5 py-2.5 text-xs bg-warning-bg text-warning-text border border-warning-border rounded-sm"
        >
          <strong>Data stale:</strong> No fresh ESP32 payload arrived within the
          freshness window. Previous values are dimmed and are no longer treated
          as live.
        </div>
      )}

      {showWaitingBanner && (
        <div className="px-3.5 py-3 text-xs bg-surface-muted/40 text-secondary border border-dashed border-border rounded-sm">
          {status === CONNECTION_STATUS.WAITING_FOR_ESP32
            ? "Firebase listener is active, waiting for ESP32 to publish a payload to the database path."
            : status === CONNECTION_STATUS.PERMISSION_DENIED
              ? "Firebase permission denied. Update Realtime Database rules to read this path."
              : status === CONNECTION_STATUS.CONFIG_MISSING
                ? "Firebase Realtime Database configuration is missing in app/.env."
                : "No live sensor payload received yet. Start the sensor listener when the ESP32 is publishing."}
        </div>
      )}

      {/* Processed Measurements vs Raw IMU Readings */}
      <div
        className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${
          isStale ? "opacity-65" : ""
        }`}
      >
        {/* Processed: Knee Movement */}
        <section className="border border-border rounded-sm bg-surface p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">
              Knee movement (Processed)
            </h4>
            <span className="text-[11px] text-muted">
              {isStale ? "Stale" : hasPayload ? "ESP32 computed" : "Awaiting"}
            </span>
          </div>
          <dl className="grid grid-cols-3 gap-2.5">
            <div className="p-2.5 bg-surface-muted/40 border border-border rounded-sm">
              <dt className="text-xs text-secondary">Knee angle</dt>
              <dd className="text-base font-semibold text-foreground mt-0.5">
                {formatValue(processed.kneeAngleDeg, "°", 1)}
              </dd>
            </div>
            <div className="p-2.5 bg-surface-muted/40 border border-border rounded-sm">
              <dt className="text-xs text-secondary">Walking speed</dt>
              <dd className="text-base font-semibold text-foreground mt-0.5">
                {formatValue(processed.walkingSpeedMs, "m/s", 2)}
              </dd>
            </div>
            <div className="p-2.5 bg-surface-muted/40 border border-border rounded-sm">
              <dt className="text-xs text-secondary">Steps</dt>
              <dd className="text-base font-semibold text-foreground mt-0.5">
                {formatValue(processed.steps, "", 0)}
              </dd>
            </div>
          </dl>
        </section>

        {/* Processed: Joint Vibration */}
        <section className="border border-border rounded-sm bg-surface p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">
              Joint vibration (Processed)
            </h4>
            <span className="text-[11px] text-muted">
              {isStale ? "Stale" : hasPayload ? "Piezo features" : "Awaiting"}
            </span>
          </div>
          <dl className="grid grid-cols-3 gap-2.5">
            <div className="p-2.5 bg-surface-muted/40 border border-border rounded-sm">
              <dt className="text-xs text-secondary">RMS</dt>
              <dd className="text-base font-semibold text-foreground mt-0.5">
                {formatValue(vibration.rms, "", 1)}
              </dd>
            </div>
            <div className="p-2.5 bg-surface-muted/40 border border-border rounded-sm">
              <dt className="text-xs text-secondary">Peak</dt>
              <dd className="text-base font-semibold text-foreground mt-0.5">
                {formatValue(vibration.peak, "", 0)}
              </dd>
            </div>
            <div className="p-2.5 bg-surface-muted/40 border border-border rounded-sm">
              <dt className="text-xs text-secondary">Spikes</dt>
              <dd className="text-base font-semibold text-foreground mt-0.5">
                {formatValue(vibration.spikes, "", 0)}
              </dd>
            </div>
          </dl>
        </section>

        {/* Raw: Accelerometer */}
        <section className="border border-border rounded-sm bg-surface p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">
              Accelerometer (Raw IMU)
            </h4>
            <span className="text-[11px] text-muted">acc.x / y / z</span>
          </div>
          <dl className="grid grid-cols-3 gap-2.5 font-mono">
            <div className="p-2 bg-surface-muted/30 border border-border rounded-sm">
              <dt className="text-xs text-secondary font-sans">X</dt>
              <dd className="text-sm font-semibold text-foreground mt-0.5">
                {formatValue(acc.x, "", 2)}
              </dd>
            </div>
            <div className="p-2 bg-surface-muted/30 border border-border rounded-sm">
              <dt className="text-xs text-secondary font-sans">Y</dt>
              <dd className="text-sm font-semibold text-foreground mt-0.5">
                {formatValue(acc.y, "", 2)}
              </dd>
            </div>
            <div className="p-2 bg-surface-muted/30 border border-border rounded-sm">
              <dt className="text-xs text-secondary font-sans">Z</dt>
              <dd className="text-sm font-semibold text-foreground mt-0.5">
                {formatValue(acc.z, "", 2)}
              </dd>
            </div>
          </dl>
        </section>

        {/* Raw: Gyroscope */}
        <section className="border border-border rounded-sm bg-surface p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">
              Gyroscope (Raw IMU)
            </h4>
            <span className="text-[11px] text-muted">gyro.x / y / z</span>
          </div>
          <dl className="grid grid-cols-3 gap-2.5 font-mono">
            <div className="p-2 bg-surface-muted/30 border border-border rounded-sm">
              <dt className="text-xs text-secondary font-sans">X</dt>
              <dd className="text-sm font-semibold text-foreground mt-0.5">
                {formatValue(gyro.x, "", 1)}
              </dd>
            </div>
            <div className="p-2 bg-surface-muted/30 border border-border rounded-sm">
              <dt className="text-xs text-secondary font-sans">Y</dt>
              <dd className="text-sm font-semibold text-foreground mt-0.5">
                {formatValue(gyro.y, "", 1)}
              </dd>
            </div>
            <div className="p-2 bg-surface-muted/30 border border-border rounded-sm">
              <dt className="text-xs text-secondary font-sans">Z</dt>
              <dd className="text-sm font-semibold text-foreground mt-0.5">
                {formatValue(gyro.z, "", 1)}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      {/* Bounded Live Trend Chart (only when >= 2 actual samples exist) */}
      <LiveKneeTrendChart
        historyBuffer={telemetry?.historyBuffer}
        isStale={isStale}
        isDemoData={isDemoData}
      />
    </div>
  );
}
