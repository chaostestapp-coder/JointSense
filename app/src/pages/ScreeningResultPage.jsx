import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, Printer } from "lucide-react";
import StatusBadge from "../components/common/StatusBadge";
import {
  subscribeToScreening,
  updateScreeningReview,
} from "../services/screeningService";
import { formatClinicalDateTime } from "../utils/formatters";

export default function ScreeningResultPage() {
  const { screeningId } = useParams();

  const [screening, setScreening] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [reviewStatus, setReviewStatus] = useState("Pending Review");
  const [followUpPlan, setFollowUpPlan] = useState("");
  const [clinicianNotes, setClinicianNotes] = useState("");
  const [savingReview, setSavingReview] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    if (!screeningId) return undefined;
    const unsubscribe = subscribeToScreening(
      screeningId,
      (record) => {
        setScreening(record);
        if (record) {
          setReviewStatus(record.reviewStatus || "Pending Review");
          setFollowUpPlan(record.followUpPlan || "");
          setClinicianNotes(record.clinicianNotes || "");
        }
        setLoading(false);
      },
      (err) => {
        setError(err.message || "Unable to load screening result.");
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [screeningId]);

  const handleSaveReview = async (event) => {
    event.preventDefault();
    setError("");
    setSaveMessage("");
    setSavingReview(true);

    try {
      await updateScreeningReview(screeningId, {
        reviewStatus,
        followUpPlan,
        clinicianNotes,
      });
      setSaveMessage("Clinician review saved.");
    } catch (err) {
      setError(err.message || "Unable to save clinician review.");
    } finally {
      setSavingReview(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-sm p-8 text-center text-sm text-secondary">
        Loading screening result...
      </div>
    );
  }

  if (!screening) {
    return (
      <div className="bg-surface border border-border rounded-sm p-8 space-y-3">
        <h1 className="text-lg font-semibold text-foreground">
          Screening record not found
        </h1>
        <p className="text-sm text-secondary">
          The requested screening report does not exist or may have been deleted.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-link hover:underline"
        >
          <ArrowLeft size={15} strokeWidth={1.75} aria-hidden="true" />
          Back to dashboard
        </Link>
      </div>
    );
  }

  const flexionPercent = screening.referenceFlexion
    ? Math.round((screening.flexionDeg / screening.referenceFlexion) * 100)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={screening.patientId ? `/patients/${screening.patientId}` : "/"}
          className="no-print inline-flex items-center gap-1.5 text-sm text-secondary hover:text-foreground mb-3"
        >
          <ArrowLeft size={15} strokeWidth={1.75} aria-hidden="true" />
          {screening.patientId ? "Back to patient details" : "Back to dashboard"}
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-border">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-semibold text-foreground">
                {screening.side} {screening.jointType} screening report
              </h1>
              <StatusBadge status={screening.riskLevel} />
              <StatusBadge status={screening.reviewStatus} />
            </div>
            <p className="text-sm text-secondary mt-1">
              Patient:{" "}
              <Link
                to={`/patients/${screening.patientId}`}
                className="font-medium text-foreground hover:underline"
              >
                {screening.patientName}
              </Link>{" "}
              (<span className="font-mono">{screening.patientMrn}</span>) &middot;
              Recorded {formatClinicalDateTime(screening.createdAt)}
            </p>
          </div>

          <div className="flex items-center gap-2.5 no-print shrink-0">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-foreground bg-surface hover:bg-surface-muted border border-border rounded-sm"
            >
              <Printer size={15} strokeWidth={1.75} aria-hidden="true" />
              Print report
            </button>
            <Link
              to={`/screening?patientId=${screening.patientId}`}
              className="link-button px-4 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-accent-foreground rounded-sm"
            >
              New screening
            </Link>
          </div>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="px-4 py-2.5 text-sm bg-danger-bg text-danger-text border border-danger-border rounded-sm"
        >
          {error}
        </div>
      )}

      {/* Assessment Summary Strip */}
      <section className="bg-surface border border-border rounded-sm divide-y divide-border">
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
          <div className="p-4">
            <div className="text-xs text-secondary">Composite screening index</div>
            <div className="text-2xl font-semibold text-foreground mt-1">
              {screening.compositeIndex}{" "}
              <span className="text-sm font-normal text-muted">/ 100</span>
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs text-secondary">Risk classification</div>
            <div className="mt-1.5">
              <StatusBadge status={screening.riskLevel} />
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs text-secondary">Evaluation method</div>
            <div className="text-sm font-medium text-foreground mt-1.5">
              {screening.analysisSource || "Clinical Baseline Rubric"}
            </div>
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-secondary mb-1">Clinical recommendation</div>
          <p className="text-sm text-foreground">{screening.recommendation}</p>
        </div>
      </section>

      {/* Measurements Comparison Table */}
      <section className="bg-surface border border-border rounded-sm">
        <div className="px-4 py-3 border-b border-border">
          <h2 id="measurements-heading" className="text-base font-semibold text-foreground">
            Recorded measurements & examination findings
          </h2>
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-labelledby="measurements-heading"
          className="clinical-table-region"
        >
          <table className="clinical-table">
            <thead>
              <tr>
                <th scope="col">Parameter</th>
                <th scope="col">Recorded value</th>
                <th scope="col">Reference / Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="font-medium text-foreground">
                  Active flexion ROM
                </th>
                <td className="font-medium">{screening.flexionDeg}°</td>
                <td className="text-secondary">
                  Reference baseline: {screening.referenceFlexion || 135}°
                  {flexionPercent !== null ? ` (${flexionPercent}% of baseline)` : ""}
                  {screening.contralateralFlexionDeg != null
                    ? ` · Contralateral: ${screening.contralateralFlexionDeg}°`
                    : ""}
                </td>
              </tr>
              <tr>
                <th scope="row" className="font-medium text-foreground">
                  Extension deficit
                </th>
                <td>{screening.extensionDeficitDeg}°</td>
                <td className="text-secondary">Target: 0° full extension</td>
              </tr>
              <tr>
                <th scope="row" className="font-medium text-foreground">
                  Pain score (VAS)
                </th>
                <td>{screening.painScore} / 10</td>
                <td className="text-secondary">Patient-reported visual analog score</td>
              </tr>
              <tr>
                <th scope="row" className="font-medium text-foreground">
                  Morning stiffness
                </th>
                <td>{screening.morningStiffnessMin} minutes</td>
                <td className="text-secondary">Duration prior to functional loosening</td>
              </tr>
              <tr>
                <th scope="row" className="font-medium text-foreground">
                  Effusion / Swelling
                </th>
                <td>{screening.swellingPresent ? "Present" : "Absent"}</td>
                <td className="text-secondary">Physical palpation and visual check</td>
              </tr>
              <tr>
                <th scope="row" className="font-medium text-foreground">
                  Crepitus
                </th>
                <td>{screening.crepitusPresent ? "Present" : "Absent"}</td>
                <td className="text-secondary">During passive joint articulation</td>
              </tr>
              <tr>
                <th scope="row" className="font-medium text-foreground">
                  Instability reported
                </th>
                <td>{screening.instabilityReported ? "Yes" : "No"}</td>
                <td className="text-secondary">Subjective giving-way episodes</td>
              </tr>
              <tr>
                <th scope="row" className="font-medium text-foreground">
                  Gait / Mobility status
                </th>
                <td>{screening.gaitStatus || "Unassisted"}</td>
                <td className="text-secondary">Observed ambulation</td>
              </tr>
            </tbody>
          </table>
        </div>

        {screening.clinicalObservations && (
          <div className="px-4 py-3.5 border-t border-border">
            <div className="text-xs text-secondary mb-1">
              Examiner observations during screening
            </div>
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {screening.clinicalObservations}
            </p>
          </div>
        )}
      </section>

      {/* Clinician Review Form */}
      <section className="bg-surface border border-border rounded-sm">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">
            Clinician review & follow-up disposition
          </h2>
        </div>

        <form onSubmit={handleSaveReview} className="p-5 space-y-4">
          {saveMessage && (
            <div
              role="status"
              className="px-3 py-2 text-sm bg-success-bg text-success-text border border-success-border rounded-sm"
            >
              {saveMessage}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="review-status"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Review status
              </label>
              <select
                id="review-status"
                value={reviewStatus}
                onChange={(e) => setReviewStatus(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground"
              >
                <option value="Pending Review">Pending Review</option>
                <option value="Reviewed">Reviewed</option>
                <option value="Follow-up Scheduled">Follow-up Scheduled</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="followup-plan"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Follow-up plan
              </label>
              <input
                id="followup-plan"
                type="text"
                value={followUpPlan}
                onChange={(e) => setFollowUpPlan(e.target.value)}
                placeholder="e.g., Weight-bearing AP/lateral X-ray, PT referral in 4 weeks"
                className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="clinician-notes"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Clinician assessment notes
            </label>
            <textarea
              id="clinician-notes"
              rows={3}
              value={clinicianNotes}
              onChange={(e) => setClinicianNotes(e.target.value)}
              placeholder="Diagnostic impression, conservative management plan, or imaging orders..."
              className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground"
            />
          </div>

          <div className="flex justify-end no-print">
            <button
              type="submit"
              disabled={savingReview}
              className="px-4 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-accent-foreground rounded-sm"
            >
              {savingReview ? "Saving review..." : "Save review"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
