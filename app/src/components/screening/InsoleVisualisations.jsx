import { Footprints } from "lucide-react";
import { INSOLE_CONNECTION_STATUS } from "../../services/transports/insoleSchema";
import StatusBadge from "../common/StatusBadge";

function formatValue(value, unit = "", decimals = null) {
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

function FourRegionPressure({ fsr, isStale }) {
  const regions = [
    { key: "toe", label: "Toe", value: fsr?.toe },
    { key: "inner", label: "Inner", value: fsr?.inner },
    { key: "outer", label: "Outer", value: fsr?.outer },
    { key: "heel", label: "Heel", value: fsr?.heel },
  ];

  const hasAny =
    regions.some((r) => r.value !== null && r.value !== undefined) ||
    (fsr?.total !== null && fsr?.total !== undefined);

  return (
    <div
      className={`border border-border rounded-sm bg-surface p-3.5 space-y-2.5 ${
        isStale ? "opacity-65" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-foreground">
          4-Region FSR pressure distribution
        </div>
        <span className="text-[11px] text-muted">
          {isStale ? "Stale" : hasAny ? "Raw FSR" : "Awaiting data"}
        </span>
      </div>

      {!hasAny ? (
        <div className="h-28 flex items-center justify-center border border-dashed border-border rounded-sm bg-surface-muted/30 px-4 text-center">
          <span className="text-xs text-muted">
            Waiting for smart insole FSR readings.
          </span>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            {regions.map((region) => (
              <div
                key={region.key}
                className="p-2.5 bg-surface-muted/40 border border-border rounded-sm flex items-baseline justify-between gap-2"
              >
                <span className="text-xs text-secondary">{region.label}</span>
                <strong className="text-sm font-mono font-semibold text-foreground">
                  {formatValue(region.value)}
                </strong>
              </div>
            ))}
          </div>
          <div className="p-2.5 bg-surface-muted/60 border border-border rounded-sm flex items-baseline justify-between">
            <span className="text-xs font-medium text-secondary">
              Total FSR pressure
            </span>
            <strong className="text-sm font-mono font-semibold text-foreground">
              {formatValue(fsr?.total)}
            </strong>
          </div>
        </div>
      )}
    </div>
  );
}

function BalanceDistribution({ balance, isStale }) {
  const items = [
    { key: "heelPct", label: "Heel", value: balance?.heelPct },
    { key: "innerPct", label: "Inner", value: balance?.innerPct },
    { key: "outerPct", label: "Outer", value: balance?.outerPct },
    { key: "toePct", label: "Toe", value: balance?.toePct },
  ];
  const hasAny = items.some(
    (item) => item.value !== null && item.value !== undefined
  );

  return (
    <div
      className={`border border-border rounded-sm bg-surface p-3.5 space-y-2.5 ${
        isStale ? "opacity-65" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-foreground">
          Balance distribution
        </div>
        <span className="text-[11px] text-muted">
          {isStale ? "Stale" : hasAny ? "Percentage" : "Awaiting data"}
        </span>
      </div>

      {!hasAny ? (
        <div className="h-28 flex items-center justify-center border border-dashed border-border rounded-sm bg-surface-muted/30 px-4 text-center">
          <span className="text-xs text-muted">
            Waiting for smart insole balance percentages.
          </span>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const pct =
              item.value !== null && item.value !== undefined
                ? Math.max(0, Math.min(100, Number(item.value)))
                : null;
            return (
              <div key={item.key} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-secondary">{item.label}</span>
                  <span className="font-mono font-medium text-foreground">
                    {pct !== null ? `${pct.toFixed(0)}%` : "Unavailable"}
                  </span>
                </div>
                <div className="h-2 bg-surface-muted border border-border rounded-xs overflow-hidden">
                  {pct !== null && (
                    <div
                      className="h-full bg-accent"
                      style={{ width: `${pct}%` }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ShoeAngleTrend({ historyBuffer, isStale }) {
  const validSamples = (historyBuffer || []).filter(
    (s) => s.shoeAngleDeg !== null && s.shoeAngleDeg !== undefined
  );

  if (validSamples.length < 2) {
    return (
      <div className="border border-border rounded-sm bg-surface p-3.5 space-y-2">
        <div className="text-sm font-semibold text-foreground">
          Shoe angle trend (In-session buffer)
        </div>
        <div className="h-28 flex items-center justify-center border border-dashed border-border rounded-sm bg-surface-muted/30 px-4 text-center">
          <span className="text-xs text-muted">
            {validSamples.length === 1
              ? "1 insole snapshot received. Waiting for additional updates to plot trend."
              : "Waiting for live smart insole snapshots to build in-session trend."}
          </span>
        </div>
      </div>
    );
  }

  const width = 480;
  const height = 130;
  const padLeft = 32;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 20;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const vals = validSamples.map((s) => Number(s.shoeAngleDeg));
  const yMin = Math.floor(Math.min(0, ...vals) / 10) * 10;
  const yMax = Math.ceil(Math.max(45, ...vals) / 10) * 10;
  const ySpan = yMax - yMin || 1;

  const minT = validSamples[0].receivedAtMs;
  const maxT = validSamples[validSamples.length - 1].receivedAtMs;
  const spanT = maxT - minT || 1;

  const pathD = validSamples
    .map((pt, idx) => {
      const x = padLeft + ((pt.receivedAtMs - minT) / spanT) * innerW;
      const y =
        padTop + (1 - (Number(pt.shoeAngleDeg) - yMin) / ySpan) * innerH;
      return `${idx === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div
      className={`border border-border rounded-sm bg-surface p-3.5 space-y-2 ${
        isStale ? "opacity-65" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-foreground">
          Shoe angle trend (In-session buffer · {validSamples.length} samples)
        </div>
        {isStale && (
          <span className="text-[11px] font-medium px-1.5 py-0.5 bg-warning-bg text-warning-text border border-warning-border rounded-xs">
            Stale
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-32"
        role="img"
        aria-label="In-session shoe angle trend from received smart insole snapshots"
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
        <text x={padLeft} y={height - 4} fill="var(--muted)" fontSize="9">
          {formatReceiptTime(minT)}
        </text>
        <text
          x={width - padRight}
          y={height - 4}
          textAnchor="end"
          fill="var(--muted)"
          fontSize="9"
        >
          {formatReceiptTime(maxT)}
        </text>
      </svg>
    </div>
  );
}

export default function InsoleVisualisations({ insoleTelemetry, capabilities }) {
  const status =
    insoleTelemetry?.connectionStatus || INSOLE_CONNECTION_STATUS.NOT_CONNECTED;
  const isStale = Boolean(insoleTelemetry?.isStale);
  const processed = insoleTelemetry?.processed || {};
  const rawImu = insoleTelemetry?.rawImu || {};
  const acc = rawImu.acc || {};
  const gyro = rawImu.gyro || {};
  const timing = insoleTelemetry?.timing || {};

  const footContactLabel =
    processed.footContact === true
      ? "In contact"
      : processed.footContact === false
        ? "No contact"
        : "Unavailable";

  return (
    <section
      aria-label="Smart insole measurements and visualizations"
      className="bg-surface border border-border rounded-sm divide-y divide-border"
    >
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <Footprints
            size={16}
            strokeWidth={1.75}
            className="text-secondary shrink-0"
            aria-hidden="true"
          />
          <span className="font-semibold text-sm text-foreground">
            Smart Insole Live Analysis
          </span>
          <StatusBadge status={status} />
          {capabilities?.rtdbPath && (
            <span className="text-muted font-mono">{capabilities.rtdbPath}</span>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-secondary">
          <span>
            Device timestamp:{" "}
            <strong className="font-mono text-foreground">
              {timing.deviceTimestamp !== null &&
              timing.deviceTimestamp !== undefined
                ? String(timing.deviceTimestamp)
                : "—"}
            </strong>
          </span>
          <span>
            Last received:{" "}
            <strong className="font-mono text-foreground">
              {formatReceiptTime(timing.receivedAtMs)}
            </strong>
          </span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div
          className={`grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs ${
            isStale ? "opacity-65" : ""
          }`}
        >
          <div className="p-2.5 bg-surface-muted/40 border border-border rounded-sm">
            <div className="text-secondary">Shoe angle</div>
            <div className="text-base font-semibold text-foreground mt-0.5">
              {formatValue(processed.shoeAngleDeg, "°", 1)}
            </div>
          </div>
          <div className="p-2.5 bg-surface-muted/40 border border-border rounded-sm">
            <div className="text-secondary">Foot contact</div>
            <div className="text-base font-semibold text-foreground mt-0.5">
              {footContactLabel}
            </div>
          </div>
          <div className="p-2.5 bg-surface-muted/40 border border-border rounded-sm">
            <div className="text-secondary">Accelerometer (X, Y, Z)</div>
            <div className="font-mono text-xs font-medium text-foreground mt-1">
              {formatValue(acc.x, "", 2)}, {formatValue(acc.y, "", 2)},{" "}
              {formatValue(acc.z, "", 2)}
            </div>
          </div>
          <div className="p-2.5 bg-surface-muted/40 border border-border rounded-sm">
            <div className="text-secondary">Gyroscope (X, Y, Z)</div>
            <div className="font-mono text-xs font-medium text-foreground mt-1">
              {formatValue(gyro.x, "", 1)}, {formatValue(gyro.y, "", 1)},{" "}
              {formatValue(gyro.z, "", 1)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FourRegionPressure fsr={processed.fsr} isStale={isStale} />
          <BalanceDistribution balance={processed.balance} isStale={isStale} />
        </div>

        <ShoeAngleTrend
          historyBuffer={insoleTelemetry?.historyBuffer}
          isStale={isStale}
        />
      </div>
    </section>
  );
}
