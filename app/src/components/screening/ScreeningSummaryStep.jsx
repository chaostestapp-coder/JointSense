import StatusBadge from "../common/StatusBadge";
import { SCREENING_TESTS } from "../../services/transports/screeningSchema";

export default function ScreeningSummaryStep({
  selectedPatient,
  jointType,
  side,
  testStates,
  symptomForm,
  onSymptomChange,
  thresholdEvaluation,
  submitting,
  onBack,
  onSubmit,
}) {
  const hasDemoReadings = Object.values(testStates).some(
    (entry) => entry?.telemetry?.isDemoData
  );

  return (
    <form
      onSubmit={onSubmit}
      className="bg-surface border border-border rounded-sm divide-y divide-border"
    >
      {/* 1. Protocol Completion & Measured Overview */}
      <div className="p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Screening summary & review
            </h2>
            <p className="text-xs text-secondary mt-0.5">
              {selectedPatient
                ? `${selectedPatient.fullName} (${selectedPatient.mrn}) · ${side} ${jointType}`
                : "Select a patient before saving."}
            </p>
          </div>
          <StatusBadge status={thresholdEvaluation.riskLevel} />
        </div>

        {hasDemoReadings && (
          <div
            role="status"
            className="px-3.5 py-2.5 text-xs bg-warning-bg text-warning-text border border-warning-border rounded-sm"
          >
            Demo preview telemetry was active during one or more tests. Synthetic
            demo readings are automatically excluded and will <strong>not</strong>{" "}
            be saved as patient measurements.
          </div>
        )}

        <div
          tabIndex={0}
          role="region"
          aria-labelledby="summary-tests-heading"
          className="clinical-table-region border border-border rounded-sm"
        >
          <table className="clinical-table">
            <thead>
              <tr>
                <th id="summary-tests-heading" scope="col">
                  Assessment test
                </th>
                <th scope="col">Status</th>
                <th scope="col">Timer</th>
                <th scope="col">Recorded clinical values</th>
              </tr>
            </thead>
            <tbody>
              {SCREENING_TESTS.map((test) => {
                const state = testStates[test.id] || {};
                const mv = state.manualValues || {};
                let summaryText = "No manual values entered";

                if (test.id === "walk_10m" && mv.walkDurationSec) {
                  const speed = (10 / Number(mv.walkDurationSec)).toFixed(2);
                  summaryText = `${mv.walkDurationSec} s (${speed} m/s)`;
                } else if (test.id === "sit_to_stand_5x" && mv.sitToStandSec) {
                  summaryText = `${mv.sitToStandSec} s (5 repetitions)`;
                } else if (
                  test.id === "knee_bend_extend" &&
                  (mv.flexionDeg || mv.extensionDeficitDeg)
                ) {
                  summaryText = `Flexion: ${mv.flexionDeg || "—"}°, Ext. deficit: ${
                    mv.extensionDeficitDeg || "0"
                  }°`;
                }

                return (
                  <tr key={test.id}>
                    <th scope="row" className="font-medium text-foreground">
                      {test.name}
                    </th>
                    <td>
                      <StatusBadge
                        status={state.completed ? "Reviewed" : "Pending Review"}
                      />
                    </td>
                    <td className="text-secondary">
                      {state.elapsedSec != null ? `${state.elapsedSec} s` : "—"}
                    </td>
                    <td className="text-secondary">{summaryText}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Symptoms & Final Clinical Inputs */}
      <div className="p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">
          Clinical symptom context
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="summary-pain"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Pain VAS (0–10)
            </label>
            <input
              id="summary-pain"
              name="painScore"
              type="number"
              min={0}
              max={10}
              value={symptomForm.painScore}
              onChange={(e) => onSymptomChange("painScore", e.target.value)}
              placeholder="0–10"
              className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground"
            />
          </div>

          <div>
            <label
              htmlFor="summary-stiffness"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Morning stiffness (min)
            </label>
            <input
              id="summary-stiffness"
              name="morningStiffnessMin"
              type="number"
              min={0}
              max={360}
              value={symptomForm.morningStiffnessMin}
              onChange={(e) =>
                onSymptomChange("morningStiffnessMin", e.target.value)
              }
              placeholder="Minutes"
              className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground"
            />
          </div>

          <div>
            <label
              htmlFor="summary-gait"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Mobility / assistive aid
            </label>
            <select
              id="summary-gait"
              name="gaitStatus"
              value={symptomForm.gaitStatus}
              onChange={(e) => onSymptomChange("gaitStatus", e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground"
            >
              <option value="Unassisted">Unassisted</option>
              <option value="Antalgic / Limp">Antalgic / Limp</option>
              <option value="Cane / Single Crutch">Cane / Single Crutch</option>
              <option value="Walker / Bilateral Support">
                Walker / Bilateral Support
              </option>
              <option value="Non-weight Bearing">Non-weight Bearing</option>
            </select>
          </div>
        </div>

        <fieldset className="flex flex-wrap gap-5 pt-1">
          <legend className="text-sm font-medium text-foreground mb-1.5">
            Observed physical signs
          </legend>
          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={symptomForm.swellingPresent}
              onChange={(e) =>
                onSymptomChange("swellingPresent", e.target.checked)
              }
              className="w-4 h-4 accent-accent"
            />
            <span>Effusion / swelling</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={symptomForm.crepitusPresent}
              onChange={(e) =>
                onSymptomChange("crepitusPresent", e.target.checked)
              }
              className="w-4 h-4 accent-accent"
            />
            <span>Crepitus</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={symptomForm.instabilityReported}
              onChange={(e) =>
                onSymptomChange("instabilityReported", e.target.checked)
              }
              className="w-4 h-4 accent-accent"
            />
            <span>Joint instability</span>
          </label>
        </fieldset>

        <div>
          <label
            htmlFor="summary-observations"
            className="block text-sm font-medium text-foreground mb-1"
          >
            Clinician observations
          </label>
          <textarea
            id="summary-observations"
            rows={3}
            value={symptomForm.clinicalObservations}
            onChange={(e) =>
              onSymptomChange("clinicalObservations", e.target.value)
            }
            placeholder="Additional clinical findings, patient comfort, or test interruptions..."
            className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground"
          />
        </div>
      </div>

      {/* 3. Documented Threshold Screening Output (No ML fabrication) */}
      <div className="p-5 space-y-3 bg-surface-muted/30">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">
            Threshold screening outcome ({thresholdEvaluation.source})
          </h3>
          <span className="text-xs text-secondary">
            {thresholdEvaluation.flaggedCount} of{" "}
            {thresholdEvaluation.evaluatedCount} evaluated criteria flagged
          </span>
        </div>

        <p className="text-sm text-foreground">
          {thresholdEvaluation.summaryRecommendation}
        </p>

        {thresholdEvaluation.thresholds.length > 0 && (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
            {thresholdEvaluation.thresholds.map((item) => (
              <li
                key={item.metric}
                className="px-3 py-2 bg-surface border border-border rounded-sm text-xs flex items-center justify-between gap-2"
              >
                <div>
                  <div className="font-medium text-foreground">{item.metric}</div>
                  <div className="text-muted">Ref: {item.threshold}</div>
                </div>
                <span
                  className={
                    item.flagged
                      ? "font-semibold text-danger-text"
                      : "font-medium text-success-text"
                  }
                >
                  {item.value}
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-muted">
          Screening aid notice: JointSense supports clinician-guided threshold
          screening and is not a standalone diagnostic tool. Automated ML
          classification is not yet integrated.
        </p>
      </div>

      {/* Footer Actions */}
      <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 text-sm font-medium text-secondary hover:text-foreground bg-surface-muted hover:bg-surface-hover border border-border rounded-sm"
        >
          Back to tests
        </button>

        <button
          type="submit"
          disabled={submitting || !selectedPatient}
          className="px-5 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-accent-foreground rounded-sm"
        >
          {submitting ? "Saving screening..." : "Save completed screening"}
        </button>
      </div>
    </form>
  );
}
