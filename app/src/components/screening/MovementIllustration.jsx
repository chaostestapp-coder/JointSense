import { useState } from "react";
import { Pause, Play } from "lucide-react";

function Walk10mSvg() {
  return (
    <svg
      viewBox="0 0 320 150"
      className="w-full h-auto max-h-44"
      role="img"
      aria-label="Instructional schematic showing a patient walking straight from a 0 metre start line to a 10 metre finish line."
    >
      {/* Walkway surface */}
      <line
        x1="24"
        y1="120"
        x2="296"
        y2="120"
        stroke="var(--border)"
        strokeWidth="2"
      />
      {/* Distance markers */}
      <line x1="40" y1="110" x2="40" y2="126" stroke="var(--accent)" strokeWidth="2" />
      <text x="40" y="140" textAnchor="middle" fill="var(--secondary)" fontSize="10" fontWeight="600">
        0 m (Start)
      </text>

      <line x1="160" y1="114" x2="160" y2="124" stroke="var(--muted)" strokeWidth="1.5" />
      <text x="160" y="140" textAnchor="middle" fill="var(--muted)" fontSize="10">
        5 m
      </text>

      <line x1="280" y1="110" x2="280" y2="126" stroke="var(--accent)" strokeWidth="2" />
      <text x="280" y="140" textAnchor="middle" fill="var(--secondary)" fontSize="10" fontWeight="600">
        10 m (Finish)
      </text>

      {/* Direction arrow */}
      <line
        x1="60"
        y1="26"
        x2="262"
        y2="26"
        stroke="var(--border)"
        strokeWidth="1.5"
        strokeDasharray="4 4"
      />
      <path d="M256 21 L266 26 L256 31" fill="none" stroke="var(--accent)" strokeWidth="1.75" />

      {/* Walking figure */}
      <g className="anim-walk-figure" transform="translate(52, 0)">
        <circle cx="24" cy="44" r="9" fill="none" stroke="var(--foreground)" strokeWidth="2.2" />
        {/* Torso */}
        <line x1="24" y1="53" x2="24" y2="85" stroke="var(--foreground)" strokeWidth="2.4" strokeLinecap="round" />
        {/* Arm */}
        <line x1="24" y1="60" x2="34" y2="75" stroke="var(--secondary)" strokeWidth="2" strokeLinecap="round" />
        {/* Legs pivoting at hip */}
        <g style={{ transformOrigin: "24px 85px" }} className="anim-leg-a">
          <line x1="24" y1="85" x2="24" y2="118" stroke="var(--foreground)" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="24" cy="101" r="3" fill="var(--accent)" />
        </g>
        <g style={{ transformOrigin: "24px 85px" }} className="anim-leg-b">
          <line x1="24" y1="85" x2="24" y2="118" stroke="var(--secondary)" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}

function SitToStandSvg() {
  return (
    <svg
      viewBox="0 0 320 150"
      className="w-full h-auto max-h-44"
      role="img"
      aria-label="Instructional schematic showing a patient rising from a seated chair posture to a full upright standing posture five times."
    >
      {/* Floor */}
      <line x1="24" y1="126" x2="296" y2="126" stroke="var(--border)" strokeWidth="2" />

      {/* Standard armless chair */}
      <path
        d="M84 68 L84 126 M84 96 L124 96 L124 126"
        fill="none"
        stroke="var(--secondary)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Ghost standing target posture */}
      <g opacity="0.28">
        <circle cx="152" cy="36" r="8" fill="none" stroke="var(--secondary)" strokeWidth="1.5" strokeDasharray="3 2" />
        <line x1="152" y1="44" x2="152" y2="82" stroke="var(--secondary)" strokeWidth="1.5" strokeDasharray="3 2" />
        <line x1="152" y1="82" x2="152" y2="125" stroke="var(--secondary)" strokeWidth="1.5" strokeDasharray="3 2" />
      </g>

      {/* Active transitioning figure */}
      <g className="anim-sit-stand">
        <circle cx="114" cy="36" r="9" fill="none" stroke="var(--foreground)" strokeWidth="2.2" />
        {/* Torso */}
        <line x1="114" y1="45" x2="114" y2="80" stroke="var(--foreground)" strokeWidth="2.4" strokeLinecap="round" />
        {/* Crossed arms */}
        <line x1="114" y1="54" x2="127" y2="62" stroke="var(--secondary)" strokeWidth="2" strokeLinecap="round" />
        {/* Thigh + knee + shin */}
        <line x1="114" y1="80" x2="136" y2="82" stroke="var(--foreground)" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="136" cy="82" r="3.2" fill="var(--accent)" />
        <line x1="136" y1="82" x2="136" y2="101" stroke="var(--foreground)" strokeWidth="2.4" strokeLinecap="round" />
      </g>

      {/* Vertical rise arrow & repetition indicator */}
      <path d="M188 94 L188 46 M183 52 L188 44 L193 52" fill="none" stroke="var(--accent)" strokeWidth="1.75" strokeLinecap="round" />
      <rect x="210" y="54" width="76" height="36" rx="3" fill="var(--surface-muted)" stroke="var(--border)" />
      <text x="248" y="70" textAnchor="middle" fill="var(--foreground)" fontSize="11" fontWeight="600">
        5 Cycles
      </text>
      <text x="248" y="83" textAnchor="middle" fill="var(--secondary)" fontSize="9.5">
        Arms crossed
      </text>
    </svg>
  );
}

function KneeBendExtendSvg() {
  return (
    <svg
      viewBox="0 0 320 150"
      className="w-full h-auto max-h-44"
      role="img"
      aria-label="Instructional schematic showing a seated patient flexing and extending their knee through its range of motion."
    >
      {/* Floor & seat support */}
      <line x1="24" y1="130" x2="296" y2="130" stroke="var(--border)" strokeWidth="2" />
      <path
        d="M72 52 L72 130 M72 88 L138 88 L138 130"
        fill="none"
        stroke="var(--secondary)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Seated torso & thigh (stationary) */}
      <circle cx="90" cy="36" r="9" fill="none" stroke="var(--foreground)" strokeWidth="2.2" />
      <line x1="90" y1="45" x2="90" y2="82" stroke="var(--foreground)" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="90" y1="82" x2="148" y2="82" stroke="var(--foreground)" strokeWidth="2.6" strokeLinecap="round" />

      {/* Range of motion arc */}
      <path
        d="M 148 122 A 40 40 0 0 0 188 82"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeDasharray="3 3"
      />

      {/* Moving lower leg pivoting at knee (148, 82) */}
      <g style={{ transformOrigin: "148px 82px" }} className="anim-knee-shin">
        <line x1="148" y1="82" x2="148" y2="124" stroke="var(--foreground)" strokeWidth="2.6" strokeLinecap="round" />
        <line x1="148" y1="124" x2="160" y2="124" stroke="var(--foreground)" strokeWidth="2.4" strokeLinecap="round" />
      </g>

      {/* Knee sensor marker */}
      <circle cx="148" cy="82" r="4" fill="var(--accent)" />

      {/* Labels */}
      <text x="218" y="76" fill="var(--foreground)" fontSize="10.5" fontWeight="600">
        Extend fully
      </text>
      <text x="170" y="122" fill="var(--secondary)" fontSize="10.5">
        Flex to comfort
      </text>
    </svg>
  );
}

export default function MovementIllustration({ testId }) {
  const [isPlaying, setIsPlaying] = useState(true);

  return (
    <div className="bg-surface-muted/40 border border-border rounded-sm p-3.5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-semibold text-secondary">
          Movement demonstration
        </span>
        <button
          type="button"
          onClick={() => setIsPlaying((prev) => !prev)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-secondary hover:text-foreground bg-surface border border-border rounded-[3px]"
        >
          {isPlaying ? (
            <>
              <Pause size={12} strokeWidth={1.75} aria-hidden="true" />
              <span>Pause demo</span>
            </>
          ) : (
            <>
              <Play size={12} strokeWidth={1.75} aria-hidden="true" />
              <span>Play demo</span>
            </>
          )}
        </button>
      </div>

      <div className={isPlaying ? "demo-playing" : ""}>
        {testId === "walk_10m" && <Walk10mSvg />}
        {testId === "sit_to_stand_5x" && <SitToStandSvg />}
        {testId === "knee_bend_extend" && <KneeBendExtendSvg />}
      </div>

      <p className="text-xs text-muted mt-2">
        Instructional visual to explain the movement to the patient. Does not
        represent live patient body tracking.
      </p>
    </div>
  );
}
