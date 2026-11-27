import StatusBadge from "../common/StatusBadge";
import { SCREENING_TESTS } from "../../services/transports/screeningSchema";
import { getTest3Copy, SCREENING_COPY } from "../../utils/screeningTranslations";

const OUTCOME_BANNER_TONE = {
  Normal: "bg-success-bg text-success-text border-success-border",
  Monitor: "bg-warning-bg text-warning-text border-warning-border",
  "Elevated Risk": "bg-danger-bg text-danger-text border-danger-border",
  "Pending Review": "bg-surface-muted text-secondary border-border",
};

export default function ScreeningSummaryStep({
  lang = "en",
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
  const copy = SCREENING_COPY[lang] || SCREENING_COPY.en;
  const banner =
    copy.outcomeBanners[thresholdEvaluation.riskLevel] ||
    copy.outcomeBanners["Pending Review"];
  const bannerTone =
    OUTCOME_BANNER_TONE[thresholdEvaluation.riskLevel] ||
    OUTCOME_BANNER_TONE["Pending Review"];

  const selectedPain =
    symptomForm.painScore !== "" && symptomForm.painScore != null
      ? Number(symptomForm.painScore)
      : null;

  return (
    <form
      onSubmit={onSubmit}
      className="bg-surface border border-border rounded-sm divide-y divide-border"
    >
      {/* Traffic-Light Outcome Banner */}
      <div className="p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {selectedPatient
                ? `${selectedPatient.fullName} (${selectedPatient.mrn})`
                : "Screening Summary"}
            </h2>
            <p className="text-xs text-secondary mt-0.5">
              {side} {jointType}
            </p>
          </div>
          <StatusBadge status={thresholdEvaluation.riskLevel} />
        </div>

        <div className={`px-4 py-3 border rounded-sm ${bannerTone}`}>
          <div className="text-sm font-semibold">{banner.title}</div>
          <div className="text-sm mt-0.5">{banner.message}</div>
        </div>

        {/* Compact 3-Test Completion Summary */}
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
                  Test
                </th>
                <th scope="col">Status</th>
                <th scope="col">Time</th>
                <th scope="col">Recorded value</th>
              </tr>
            </thead>
            <tbody>
              {SCREENING_TESTS.map((test) => {
                const state = testStates[test.id] || {};
                const mv = state.manualValues || {};
                const testCopy =
                  test.id === "knee_bend_extend"
                    ? getTest3Copy(lang, jointType)
                    : copy.tests[test.id];
                let summaryText = "Not entered";

                if (test.id === "walk_10m" && mv.walkDurationSec) {
                  const speed = (10 / Number(mv.walkDurationSec)).toFixed(2);
                  summaryText = `${mv.walkDurationSec} s (${speed} m/s)`;
                } else if (test.id === "sit_to_stand_5x" && mv.sitToStandSec) {
                  summaryText = `${mv.sitToStandSec} s`;
                } else if (
                  test.id === "knee_bend_extend" &&
                  (mv.flexionDeg || mv.extensionDeficitDeg)
                ) {
                  summaryText = `Bend ${mv.flexionDeg || "0"} deg`;
                }

                return (
                  <tr key={test.id}>
                    <th scope="row" className="font-medium text-foreground">
                      {testCopy?.name || test.name}
                    </th>
                    <td>
                      <StatusBadge
                        status={state.completed ? "Reviewed" : "Pending Review"}
                      />
                    </td>
                    <td className="text-secondary">
                      {state.elapsedSec != null ? `${state.elapsedSec} s` : "None"}
                    </td>
                    <td className="text-secondary">{summaryText}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Simple Pain & Symptom Inputs */}
      <div className="p-5 space-y-5">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">
            {copy.painLabel}
          </legend>
          <div className="grid grid-cols-11 gap-1.5 pt-1">
            {Array.from({ length: 11 }, (_, num) => {
              const isSelected = selectedPain === num;
              return (
                <button
                  key={num}
                  type="button"
                  onClick={() => onSymptomChange("painScore", String(num))}
                  className={`min-h-11 text-sm font-semibold rounded-sm border transition-colors ${
                    isSelected
                      ? "bg-accent text-accent-foreground border-accent"
                      : "bg-surface text-foreground border-border hover:bg-surface-muted"
                  }`}
                >
                  {num}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="summary-stiffness"
              className="block text-sm font-medium text-foreground mb-1"
            >
              {copy.stiffnessLabel}
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
              placeholder="0"
              className="w-full px-3 py-2.5 bg-surface border border-border rounded-sm text-sm text-foreground"
            />
          </div>

          <div>
            <label
              htmlFor="summary-gait"
              className="block text-sm font-medium text-foreground mb-1"
            >
              {copy.gaitLabel}
            </label>
            <select
              id="summary-gait"
              name="gaitStatus"
              value={symptomForm.gaitStatus}
              onChange={(e) => onSymptomChange("gaitStatus", e.target.value)}
              className="w-full px-3 py-2.5 bg-surface border border-border rounded-sm text-sm text-foreground"
            >
              <option value="Unassisted">No aid</option>
              <option value="Antalgic / Limp">Limping</option>
              <option value="Cane / Single Crutch">Stick or single crutch</option>
              <option value="Walker / Bilateral Support">Walker</option>
              <option value="Non-weight Bearing">Unable to bear weight</option>
            </select>
          </div>
        </div>

        <fieldset className="flex flex-wrap gap-5 pt-1">
          <legend className="text-sm font-medium text-foreground mb-2">
            {copy.signsLegend}
          </legend>
          <label className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer py-1">
            <input
              type="checkbox"
              checked={symptomForm.swellingPresent}
              onChange={(e) =>
                onSymptomChange("swellingPresent", e.target.checked)
              }
              className="w-5 h-5 accent-accent"
            />
            <span>{copy.swellingLabel}</span>
          </label>
          <label className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer py-1">
            <input
              type="checkbox"
              checked={symptomForm.crepitusPresent}
              onChange={(e) =>
                onSymptomChange("crepitusPresent", e.target.checked)
              }
              className="w-5 h-5 accent-accent"
            />
            <span>{copy.crepitusLabel}</span>
          </label>
          <label className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer py-1">
            <input
              type="checkbox"
              checked={symptomForm.instabilityReported}
              onChange={(e) =>
                onSymptomChange("instabilityReported", e.target.checked)
              }
              className="w-5 h-5 accent-accent"
            />
            <span>{copy.instabilityLabel}</span>
          </label>
        </fieldset>

        <div>
          <label
            htmlFor="summary-observations"
            className="block text-sm font-medium text-foreground mb-1"
          >
            {copy.notesLabel}
          </label>
          <textarea
            id="summary-observations"
            rows={2}
            value={symptomForm.clinicalObservations}
            onChange={(e) =>
              onSymptomChange("clinicalObservations", e.target.value)
            }
            placeholder={copy.notesPlaceholder}
            className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground"
          />
        </div>

        <p className="text-xs text-muted">
          Screening aid only. Not a confirmed medical diagnosis.
        </p>
      </div>

      {/* Footer Actions */}
      <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-12 px-5 py-2.5 text-sm font-medium text-secondary hover:text-foreground bg-surface-muted hover:bg-surface-hover border border-border rounded-sm"
        >
          {copy.backToTests}
        </button>

        <button
          type="submit"
          disabled={submitting || !selectedPatient}
          className="min-h-12 px-6 py-2.5 text-base font-medium bg-accent hover:bg-accent-hover text-accent-foreground rounded-sm"
        >
          {submitting ? copy.savingScreening : copy.saveScreening}
        </button>
      </div>
    </form>
  );
}
