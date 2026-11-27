import { CONNECTION_STATUS } from "../../services/transports/screeningSchema";
import { INSOLE_CONNECTION_STATUS } from "../../services/transports/insoleSchema";

function formatMetric(value, unit = "", decimals = null) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
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

function CombinedMovementChart({
  kneeHistory,
  insoleHistory,
  isKneeStale,
  isInsoleStale,
}) {
  const kneePts = (kneeHistory || []).filter(
    (s) => s.kneeAngleDeg !== null && s.kneeAngleDeg !== undefined
  );
  const shoePts = (insoleHistory || []).filter(
    (s) => s.shoeAngleDeg !== null && s.shoeAngleDeg !== undefined
  );

  const hasKnee = kneePts.length >= 2;
  const hasShoe = shoePts.length >= 2;

  if (!hasKnee && !hasShoe) {
    return (
      <div className="border border-border rounded-sm bg-surface p-4 space-y-2">
        <div className="text-sm font-semibold text-foreground">
          Joint & shoe angle trend
        </div>
        <div className="h-32 flex items-center justify-center border border-dashed border-border rounded-sm bg-surface-muted/30 px-4 text-center">
          <span className="text-xs text-muted">
            Waiting for live knee sleeve or smart insole updates to plot
            combined movement trend.
          </span>
        </div>
      </div>
    );
  }

  const width = 560;
  const height = 165;
  const padLeft = 36;
  const padRight = 14;
  const padTop = 14;
  const padBottom = 24;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const allAngles = [
    ...kneePts.map((s) => Number(s.kneeAngleDeg)),
    ...shoePts.map((s) => Number(s.shoeAngleDeg)),
  ];
  const yMin = Math.floor(Math.min(0, ...allAngles) / 10) * 10;
  const yMax = Math.ceil(Math.max(90, ...allAngles) / 10) * 10;
  const ySpan = yMax - yMin || 1;

  const allTimes = [
    ...kneePts.map((s) => s.receivedAtMs),
    ...shoePts.map((s) => s.receivedAtMs),
  ];
  const minT = Math.min(...allTimes);
  const maxT = Math.max(...allTimes);
  const spanT = maxT - minT || 1;

  const buildPath = (pts, key) =>
    pts
      .map((pt, idx) => {
        const x = padLeft + ((pt.receivedAtMs - minT) / spanT) * innerW;
        const val = Math.max(yMin, Math.min(yMax, Number(pt[key])));
        const y = padTop + (1 - (val - yMin) / ySpan) * innerH;
        return `${idx === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");

  return (
    <div className="border border-border rounded-sm bg-surface p-4 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-foreground">
          Combined knee & shoe angle trend
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-secondary">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block w-3.5 h-0.5 bg-accent"
              aria-hidden="true"
            />
            <span>
              Knee angle{isKneeStale ? " (stale)" : ""}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block w-3.5 h-0.5 border-t-2 border-dashed border-info-strong"
              aria-hidden="true"
            />
            <span>
              Shoe angle{isInsoleStale ? " (stale)" : ""}
            </span>
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-40"
        role="img"
        aria-label="Combined knee angle and shoe angle trend over time"
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
                x={padLeft - 6}
                y={y + 3}
                textAnchor="end"
                fill="var(--muted)"
                fontSize="10"
              >
                {val}°
              </text>
            </g>
          );
        })}

        {hasKnee && (
          <path
            d={buildPath(kneePts, "kneeAngleDeg")}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={isKneeStale ? 0.45 : 1}
          />
        )}

        {hasShoe && (
          <path
            d={buildPath(shoePts, "shoeAngleDeg")}
            fill="none"
            stroke="var(--info-strong)"
            strokeWidth="2"
            strokeDasharray="5 3"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={isInsoleStale ? 0.45 : 1}
          />
        )}

        <text x={padLeft} y={height - 5} fill="var(--muted)" fontSize="10">
          {formatReceiptTime(minT)}
        </text>
        <text
          x={width - padRight}
          y={height - 5}
          textAnchor="end"
          fill="var(--muted)"
          fontSize="10"
        >
          {formatReceiptTime(maxT)}
        </text>
      </svg>
    </div>
  );
}

export default function SensorVisualisations({
  test,
  telemetry,
  insoleTelemetry,
}) {
  const kp = telemetry?.processed || {};
  const ip = insoleTelemetry?.processed || {};
  const isKneeStale = Boolean(telemetry?.isStale);
  const isInsoleStale = Boolean(insoleTelemetry?.isStale);

  const kneeOffline =
    !telemetry?.timing?.receivedAtMs &&
    telemetry?.connectionStatus !== CONNECTION_STATUS.RECEIVING;
  const insoleOffline =
    !insoleTelemetry?.timing?.receivedAtMs &&
    insoleTelemetry?.connectionStatus !== INSOLE_CONNECTION_STATUS.RECEIVING;

  const footContactLabel =
    ip.footContact === true
      ? "In contact"
      : ip.footContact === false
        ? "No contact"
        : "—";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          Combined sensor overview ({test.shortName})
        </h3>
        <span className="text-xs text-muted">
          Last update:{" "}
          <strong className="font-mono text-foreground">
            {formatReceiptTime(
              Math.max(
                telemetry?.timing?.receivedAtMs || 0,
                insoleTelemetry?.timing?.receivedAtMs || 0
              ) || null
            )}
          </strong>
        </span>
      </div>

      {(kneeOffline || insoleOffline) && (
        <p className="text-xs text-secondary">
          {kneeOffline && insoleOffline
            ? "Start the sensor listener above to stream live knee sleeve and smart insole data."
            : kneeOffline
              ? "Knee sleeve data not yet received; showing available smart insole readings."
              : "Smart insole data not yet received; showing available knee sleeve readings."}
        </p>
      )}

      {/* Single-column combined summary metrics */}
      <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 text-xs">
        <div
          className={`p-3 bg-surface-muted/40 border border-border rounded-sm ${
            isKneeStale ? "opacity-65" : ""
          }`}
        >
          <dt className="text-secondary">Knee angle</dt>
          <dd className="text-base font-semibold text-foreground mt-0.5">
            {formatMetric(kp.kneeAngleDeg, "°", 1)}
          </dd>
        </div>

        <div
          className={`p-3 bg-surface-muted/40 border border-border rounded-sm ${
            isKneeStale ? "opacity-65" : ""
          }`}
        >
          <dt className="text-secondary">Speed / Steps</dt>
          <dd className="text-base font-semibold text-foreground mt-0.5">
            {formatMetric(kp.walkingSpeedMs, "m/s", 2)} ·{" "}
            {formatMetric(kp.steps, "", 0)}
          </dd>
        </div>

        <div
          className={`p-3 bg-surface-muted/40 border border-border rounded-sm ${
            isKneeStale ? "opacity-65" : ""
          }`}
        >
          <dt className="text-secondary">Joint vibration</dt>
          <dd className="text-base font-semibold text-foreground mt-0.5">
            {formatMetric(kp.vibration?.rms)}
          </dd>
        </div>

        <div
          className={`p-3 bg-surface-muted/40 border border-border rounded-sm ${
            isInsoleStale ? "opacity-65" : ""
          }`}
        >
          <dt className="text-secondary">Shoe angle</dt>
          <dd className="text-base font-semibold text-foreground mt-0.5">
            {formatMetric(ip.shoeAngleDeg, "°", 1)}
          </dd>
        </div>

        <div
          className={`p-3 bg-surface-muted/40 border border-border rounded-sm col-span-2 sm:col-span-1 ${
            isInsoleStale ? "opacity-65" : ""
          }`}
        >
          <dt className="text-secondary">Foot contact / Pressure</dt>
          <dd className="text-base font-semibold text-foreground mt-0.5">
            {footContactLabel} · {formatMetric(ip.fsr?.total)}
          </dd>
        </div>
      </dl>

      <CombinedMovementChart
        kneeHistory={telemetry?.historyBuffer}
        insoleHistory={insoleTelemetry?.historyBuffer}
        isKneeStale={isKneeStale}
        isInsoleStale={isInsoleStale}
      />
    </div>
  );
}
