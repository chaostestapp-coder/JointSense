import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import StatusBadge from "../components/common/StatusBadge";
import { useAuth } from "../context/useAuth";
import { getClinicianProfile } from "../services/authService";
import { getPatientById } from "../services/patientService";
import { getOrCreateScreeningReportPdf } from "../services/reportStorageService";
import {
  subscribeToScreening,
  updateScreeningReview,
} from "../services/screeningService";
import { SCREENING_TESTS } from "../services/transports/screeningSchema";
import { SCREENING_COPY } from "../utils/screeningTranslations";
import { calculateAge, formatClinicalDateTime } from "../utils/formatters";

const OUTCOME_BANNER_TONE = {
  Normal: "bg-success-bg text-success-text border-success-border",
  Monitor: "bg-warning-bg text-warning-text border-warning-border",
  "Elevated Risk": "bg-danger-bg text-danger-text border-danger-border",
  "Pending Review": "bg-surface-muted text-secondary border-border",
};

function formatValue(val, unit = "") {
  if (val === null || val === undefined || val === "") return "Not recorded";
  const num = Number(val);
  if (Number.isNaN(num)) return "Not recorded";
  return unit ? `${num} ${unit}` : String(num);
}

function getLatestKneeSnapshot(guidedTests) {
  if (!guidedTests) return null;
  const order = ["knee_bend_extend", "sit_to_stand_5x", "walk_10m"];
  for (const id of order) {
    const snap = guidedTests[id]?.sensorSnapshot;
    if (snap && snap.processed) {
      return { testId: id, ...snap };
    }
  }
  return null;
}

function getLatestInsoleSnapshot(guidedTests) {
  if (!guidedTests) return null;
  const order = ["walk_10m", "sit_to_stand_5x", "knee_bend_extend"];
  for (const id of order) {
    const snap = guidedTests[id]?.insoleSnapshot;
    if (snap) {
      return { testId: id, ...snap };
    }
  }
  return null;
}

export default function ScreeningResultPage() {
  const { screeningId } = useParams();
  const { profile } = useAuth();

  const [screening, setScreening] = useState(null);
  const [patient, setPatient] = useState(null);
  const [fetchedDoctor, setFetchedDoctor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [reviewStatus, setReviewStatus] = useState("Pending Review");
  const [followUpPlan, setFollowUpPlan] = useState("");
  const [clinicianNotes, setClinicianNotes] = useState("");
  const [savingReview, setSavingReview] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfNotice, setPdfNotice] = useState("");
  const [pdfError, setPdfError] = useState("");

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

  useEffect(() => {
    if (!screening?.patientId) return;
    let active = true;
    getPatientById(screening.patientId)
      .then((rec) => {
        if (active) setPatient(rec);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [screening?.patientId]);

  const doctor = screening?.doctorSnapshot?.fullName
    ? screening.doctorSnapshot
    : profile?.fullName
      ? profile
      : fetchedDoctor;

  useEffect(() => {
    if (!screening || screening.doctorSnapshot?.fullName || profile?.fullName) {
      return undefined;
    }
    if (!screening.doctorId) return undefined;
    let active = true;
    getClinicianProfile(screening.doctorId)
      .then((docProfile) => {
        if (active && docProfile) setFetchedDoctor(docProfile);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [screening, profile]);

  const handleDownloadPdf = async (forceRegenerate = false) => {
    if (!screening) return;
    setPdfError("");
    setPdfNotice("");
    setPdfBusy(true);

    try {
      const result = await getOrCreateScreeningReportPdf({
        screening,
        patient,
        doctor,
        forceRegenerate,
      });
      setPdfNotice(
        result.mode === "downloaded_existing"
          ? "Downloaded stored PDF report."
          : result.mode === "generated_and_uploaded"
            ? "Generated PDF report, saved to cloud storage, and started download."
            : "Generated and downloaded PDF report locally."
      );
    } catch (err) {
      setPdfError(err.message || "Unable to generate or download PDF report.");
    } finally {
      setPdfBusy(false);
    }
  };

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

  const age = patient?.dateOfBirth ? calculateAge(patient.dateOfBirth) : null;
  const kneeSnap =
    screening.sensors?.kneeSleeve?.latestSnapshot ||
    getLatestKneeSnapshot(screening.guidedTests);
  const insoleSnap =
    screening.sensors?.smartInsole?.latestSnapshot ||
    getLatestInsoleSnapshot(screening.guidedTests);
  const kneeInterrupted = Boolean(
    screening.sensors?.kneeSleeve?.wasInterrupted || kneeSnap?.wasInterrupted
  );
  const insoleInterrupted = Boolean(
    screening.sensors?.smartInsole?.wasInterrupted || insoleSnap?.wasInterrupted
  );
  const hasStoredReport =
    screening.report?.status === "available" &&
    Boolean(screening.report?.storagePath);

  const flexionPercent =
    screening.flexionDeg != null && screening.referenceFlexion
      ? Math.round((screening.flexionDeg / screening.referenceFlexion) * 100)
      : null;

  const summaryHeadline =
    screening.evaluatedCount != null
      ? `${screening.flaggedCount ?? 0} of ${screening.evaluatedCount} thresholds flagged`
      : screening.compositeIndex != null
        ? `${screening.compositeIndex} / 100`
        : "Not recorded";

  const banner =
    SCREENING_COPY.en.outcomeBanners[screening.riskLevel] ||
    SCREENING_COPY.en.outcomeBanners["Pending Review"];
  const bannerTone =
    OUTCOME_BANNER_TONE[screening.riskLevel] ||
    OUTCOME_BANNER_TONE["Pending Review"];

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={screening.patientId ? `/patients/${screening.patientId}` : "/"}
          className="no-print inline-flex items-center gap-1.5 text-sm text-secondary hover:text-foreground mb-3"
        >
          <ArrowLeft size={15} strokeWidth={1.75} aria-hidden="true" />
          {screening.patientId ? "Return to patient history" : "Back to dashboard"}
        </Link>

        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-4 border-b border-border">
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

          <div className="flex flex-wrap items-center gap-2.5 no-print shrink-0">
            <button
              type="button"
              disabled={pdfBusy}
              onClick={() => handleDownloadPdf(false)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-accent-foreground rounded-sm"
            >
              <Download size={15} strokeWidth={1.75} aria-hidden="true" />
              <span>{pdfBusy ? "Preparing PDF..." : "Download PDF"}</span>
            </button>

            {hasStoredReport && (
              <button
                type="button"
                disabled={pdfBusy}
                onClick={() => handleDownloadPdf(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-secondary hover:text-foreground bg-surface hover:bg-surface-muted border border-border rounded-sm"
              >
                <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" />
                <span>Regenerate PDF</span>
              </button>
            )}

            {screening.patientId && (
              <Link
                to={`/patients/${screening.patientId}`}
                className="link-button px-3.5 py-2 text-sm font-medium text-foreground bg-surface hover:bg-surface-muted border border-border rounded-sm"
              >
                View patient profile
              </Link>
            )}
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

      {pdfError && (
        <div
          role="alert"
          className="px-4 py-2.5 text-sm bg-danger-bg text-danger-text border border-danger-border rounded-sm"
        >
          {pdfError}
        </div>
      )}

      {pdfNotice && (
        <div
          role="status"
          className="px-4 py-2.5 text-sm bg-success-bg text-success-text border border-success-border rounded-sm"
        >
          {pdfNotice}
        </div>
      )}

      {/* Plain-Language Traffic-Light Action Banner */}
      <div className={`px-4 py-3 border rounded-sm ${bannerTone}`}>
        <div className="text-sm font-semibold">{banner.title}</div>
        <div className="text-sm mt-0.5">{banner.message}</div>
      </div>

      {/* Patient & Clinician Context */}
      <section className="bg-surface border border-border rounded-sm">
        <div className="px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">
            Patient & clinician details
          </h2>
          <span className="text-xs text-secondary">
            PDF Report:{" "}
            <strong className="text-foreground">
              {hasStoredReport
                ? `Stored (${screening.report.fileName})`
                : "Not yet generated"}
            </strong>
          </span>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:gap-px bg-border">
          <div className="bg-surface px-4 py-3">
            <dt className="text-xs text-secondary">Patient name / MRN</dt>
            <dd className="text-sm font-medium text-foreground mt-0.5">
              {screening.patientName} ({screening.patientMrn})
            </dd>
          </div>
          <div className="bg-surface px-4 py-3">
            <dt className="text-xs text-secondary">Age / Target joint</dt>
            <dd className="text-sm font-medium text-foreground mt-0.5">
              {age !== null ? `${age} years · ` : ""}
              {screening.side} {screening.jointType}
            </dd>
          </div>
          <div className="bg-surface px-4 py-3">
            <dt className="text-xs text-secondary">Doctor</dt>
            <dd className="text-sm font-medium text-foreground mt-0.5">
              {doctor?.fullName || "Not recorded"}
            </dd>
          </div>
          <div className="bg-surface px-4 py-3">
            <dt className="text-xs text-secondary">Clinic / Specialisation</dt>
            <dd className="text-sm font-medium text-foreground mt-0.5">
              {doctor?.department || "Outpatient Musculoskeletal Clinic"}
              {doctor?.specialty ? ` · ${doctor.specialty}` : ""}
            </dd>
          </div>
        </dl>
      </section>

      {/* Assessment Summary Strip */}
      <section className="bg-surface border border-border rounded-sm divide-y divide-border">
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
          <div className="p-4">
            <div className="text-xs text-secondary">Threshold summary</div>
            <div className="text-lg font-semibold text-foreground mt-1">
              {summaryHeadline}
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs text-secondary">Screening classification</div>
            <div className="mt-1.5">
              <StatusBadge status={screening.riskLevel} />
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs text-secondary">Evaluation method</div>
            <div className="text-sm font-medium text-foreground mt-1.5">
              {screening.analysisSource || "Threshold Screening Rubric"}
            </div>
          </div>
        </div>

        <div className="p-4 space-y-2.5">
          <div className="text-xs text-secondary">Screening guidance</div>
          <p className="text-sm text-foreground">{screening.recommendation}</p>
          <div className="pt-2 border-t border-border grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <div>
              <span className="text-secondary">Knee sleeve: </span>
              <strong className="text-foreground">
                {kneeSnap
                  ? kneeInterrupted
                    ? "Captured (interrupted)"
                    : "Captured"
                  : "Unavailable"}
              </strong>
            </div>
            <div>
              <span className="text-secondary">Smart insole: </span>
              <strong className="text-foreground">
                {insoleSnap
                  ? insoleInterrupted
                    ? "Captured (interrupted)"
                    : "Captured"
                  : "Unavailable"}
              </strong>
            </div>
            <div>
              <span className="text-secondary">OA Risk Model: </span>
              <strong className="text-foreground">
                {screening.mlAssessment
                  ? `${screening.mlAssessment.riskBand} (${screening.mlAssessment.probabilityPct}%)`
                  : "Not available"}
              </strong>
            </div>
          </div>

          {screening.mlAssessment && (
            <div className="pt-2 border-t border-border space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-foreground">
                  OA risk prediction (Logistic Regression ·{" "}
                  {screening.mlAssessment.measuredFeaturesCount}/
                  {screening.mlAssessment.totalFeatures} live features)
                </span>
                <span className="font-mono font-semibold text-foreground">
                  {screening.mlAssessment.probabilityPct}% probability
                </span>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {(screening.mlAssessment.explanations || [])
                  .filter((f) => !f.usedFallback)
                  .slice(0, 4)
                  .map((f) => (
                    <span
                      key={f.name}
                      className="px-2 py-0.5 bg-surface-muted border border-border rounded-xs text-secondary"
                    >
                      {f.label}:{" "}
                      <strong className="text-foreground">
                        {Number(f.raw).toFixed(2)}
                      </strong>{" "}
                      ({f.increasesRisk ? "↑ risk" : "↓ risk"})
                    </span>
                  ))}
              </div>
            </div>
          )}
          <p className="text-xs text-muted">
            JointSense provides threshold-based screening assistance and does
            not establish a confirmed clinical diagnosis.
          </p>
        </div>
      </section>

      {/* Guided Test Completion Breakdown */}
      {screening.guidedTests && (
        <section className="bg-surface border border-border rounded-sm">
          <div className="px-4 py-3 border-b border-border">
            <h2
              id="guided-tests-heading"
              className="text-base font-semibold text-foreground"
            >
              Guided protocol summary (3 tests)
            </h2>
          </div>
          <div
            tabIndex={0}
            role="region"
            aria-labelledby="guided-tests-heading"
            className="clinical-table-region"
          >
            <table className="clinical-table">
              <thead>
                <tr>
                  <th scope="col">Test</th>
                  <th scope="col">Completion</th>
                  <th scope="col">Timer</th>
                  <th scope="col">Knee sleeve source</th>
                  <th scope="col">Smart insole source</th>
                </tr>
              </thead>
              <tbody>
                {SCREENING_TESTS.map((test) => {
                  const entry = screening.guidedTests?.[test.id];
                  return (
                    <tr key={test.id}>
                      <th scope="row" className="font-medium text-foreground">
                        {test.name}
                      </th>
                      <td>
                        <StatusBadge
                          status={entry?.completed ? "Reviewed" : "Pending Review"}
                        />
                      </td>
                      <td className="text-secondary">
                        {entry?.elapsedSec != null ? `${entry.elapsedSec} s` : "—"}
                      </td>
                      <td className="text-secondary">
                        {entry?.sensorSnapshot?.sourceType ||
                          "Clinician / Manual"}
                      </td>
                      <td className="text-secondary">
                        {entry?.insoleSnapshot?.deviceType || "Not captured"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Knee Sleeve Analysis */}
      <section className="bg-surface border border-border rounded-sm">
        <div className="px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">
            Knee sleeve analysis
          </h2>
          <div className="flex items-center gap-2 text-xs">
            {kneeInterrupted && (
              <span className="px-2 py-0.5 bg-warning-bg text-warning-text border border-warning-border rounded-xs">
                Stream interrupted
              </span>
            )}
            <span className="text-muted font-mono">
              {kneeSnap?.rtdbPath || "/knee_sleeve/live"}
            </span>
          </div>
        </div>
        {!kneeSnap ? (
          <div className="px-4 py-5 text-sm text-secondary">
            Knee sleeve sensor data was unavailable during this screening.
          </div>
        ) : (
          <dl className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:gap-px bg-border text-sm">
            <div className="bg-surface px-4 py-3">
              <dt className="text-xs text-secondary">Knee angle</dt>
              <dd className="font-medium text-foreground mt-0.5">
                {formatValue(kneeSnap.processed?.kneeAngleDeg, "°")}
              </dd>
            </div>
            <div className="bg-surface px-4 py-3">
              <dt className="text-xs text-secondary">Walking speed</dt>
              <dd className="font-medium text-foreground mt-0.5">
                {formatValue(kneeSnap.processed?.walkingSpeedMs, "m/s")}
              </dd>
            </div>
            <div className="bg-surface px-4 py-3">
              <dt className="text-xs text-secondary">Steps</dt>
              <dd className="font-medium text-foreground mt-0.5">
                {formatValue(kneeSnap.processed?.steps)}
              </dd>
            </div>
            <div className="bg-surface px-4 py-3">
              <dt className="text-xs text-secondary">ESP32 timestamp</dt>
              <dd className="font-mono text-xs text-foreground mt-1">
                {kneeSnap.timing?.esp32Timestamp ?? "Not recorded"}
              </dd>
            </div>
            <div className="bg-surface px-4 py-3">
              <dt className="text-xs text-secondary">Vibration RMS</dt>
              <dd className="font-medium text-foreground mt-0.5">
                {formatValue(kneeSnap.processed?.vibration?.rms)}
              </dd>
            </div>
            <div className="bg-surface px-4 py-3">
              <dt className="text-xs text-secondary">Vibration peak / spikes</dt>
              <dd className="font-medium text-foreground mt-0.5">
                {formatValue(kneeSnap.processed?.vibration?.peak)} /{" "}
                {formatValue(kneeSnap.processed?.vibration?.spikes)}
              </dd>
            </div>
            <div className="bg-surface px-4 py-3">
              <dt className="text-xs text-secondary">Accelerometer (X, Y, Z)</dt>
              <dd className="font-mono text-xs text-foreground mt-1">
                {formatValue(kneeSnap.rawImu?.acc?.x)},{" "}
                {formatValue(kneeSnap.rawImu?.acc?.y)},{" "}
                {formatValue(kneeSnap.rawImu?.acc?.z)}
              </dd>
            </div>
            <div className="bg-surface px-4 py-3">
              <dt className="text-xs text-secondary">Gyroscope (X, Y, Z)</dt>
              <dd className="font-mono text-xs text-foreground mt-1">
                {formatValue(kneeSnap.rawImu?.gyro?.x)},{" "}
                {formatValue(kneeSnap.rawImu?.gyro?.y)},{" "}
                {formatValue(kneeSnap.rawImu?.gyro?.z)}
              </dd>
            </div>
          </dl>
        )}
      </section>

      {/* Smart Insole Analysis */}
      <section className="bg-surface border border-border rounded-sm">
        <div className="px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">
            Smart insole analysis
          </h2>
          <div className="flex items-center gap-2 text-xs">
            {insoleInterrupted && (
              <span className="px-2 py-0.5 bg-warning-bg text-warning-text border border-warning-border rounded-xs">
                Stream interrupted
              </span>
            )}
            <span className="text-muted font-mono">
              {insoleSnap?.rtdbPath || "/shoe/live"}
            </span>
          </div>
        </div>
        {!insoleSnap ? (
          <div className="px-4 py-5 text-sm text-secondary">
            Smart insole sensor data was unavailable during this screening.
          </div>
        ) : (
          <dl className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:gap-px bg-border text-sm">
            <div className="bg-surface px-4 py-3">
              <dt className="text-xs text-secondary">Shoe angle</dt>
              <dd className="font-medium text-foreground mt-0.5">
                {formatValue(
                  insoleSnap.processed?.shoeAngleDeg ?? insoleSnap.ankle?.angle,
                  "°"
                )}
              </dd>
            </div>
            <div className="bg-surface px-4 py-3">
              <dt className="text-xs text-secondary">Foot contact</dt>
              <dd className="font-medium text-foreground mt-0.5">
                {insoleSnap.processed?.footContact === true
                  ? "In contact"
                  : insoleSnap.processed?.footContact === false
                    ? "No contact"
                    : "Not recorded"}
              </dd>
            </div>
            <div className="bg-surface px-4 py-3">
              <dt className="text-xs text-secondary">Total pressure</dt>
              <dd className="font-medium text-foreground mt-0.5">
                {formatValue(
                  insoleSnap.processed?.fsr?.total ??
                    insoleSnap.sole?.pressureDistribution?.aggregatedValue
                )}
              </dd>
            </div>
            <div className="bg-surface px-4 py-3">
              <dt className="text-xs text-secondary">Device timestamp</dt>
              <dd className="font-mono text-xs text-foreground mt-1">
                {insoleSnap.timing?.deviceTimestamp ?? "Not recorded"}
              </dd>
            </div>
            <div className="bg-surface px-4 py-3 col-span-2">
              <dt className="text-xs text-secondary">
                Regional pressure (Heel / Inner / Outer / Toe)
              </dt>
              <dd className="font-mono text-xs text-foreground mt-1">
                {formatValue(insoleSnap.processed?.fsr?.heel)} /{" "}
                {formatValue(insoleSnap.processed?.fsr?.inner)} /{" "}
                {formatValue(insoleSnap.processed?.fsr?.outer)} /{" "}
                {formatValue(insoleSnap.processed?.fsr?.toe)}
              </dd>
            </div>
            <div className="bg-surface px-4 py-3 col-span-2">
              <dt className="text-xs text-secondary">
                Balance distribution (Heel / Inner / Outer / Toe)
              </dt>
              <dd className="font-mono text-xs text-foreground mt-1">
                {formatValue(insoleSnap.processed?.balance?.heelPct, "%")} /{" "}
                {formatValue(insoleSnap.processed?.balance?.innerPct, "%")} /{" "}
                {formatValue(insoleSnap.processed?.balance?.outerPct, "%")} /{" "}
                {formatValue(insoleSnap.processed?.balance?.toePct, "%")}
              </dd>
            </div>
            <div className="bg-surface px-4 py-3 col-span-2">
              <dt className="text-xs text-secondary">Accelerometer (X, Y, Z)</dt>
              <dd className="font-mono text-xs text-foreground mt-1">
                {formatValue(insoleSnap.rawImu?.acc?.x)},{" "}
                {formatValue(insoleSnap.rawImu?.acc?.y)},{" "}
                {formatValue(insoleSnap.rawImu?.acc?.z)}
              </dd>
            </div>
            <div className="bg-surface px-4 py-3 col-span-2">
              <dt className="text-xs text-secondary">Gyroscope (X, Y, Z)</dt>
              <dd className="font-mono text-xs text-foreground mt-1">
                {formatValue(insoleSnap.rawImu?.gyro?.x)},{" "}
                {formatValue(insoleSnap.rawImu?.gyro?.y)},{" "}
                {formatValue(insoleSnap.rawImu?.gyro?.z)}
              </dd>
            </div>
          </dl>
        )}
      </section>

      {/* Measurements Comparison Table */}
      <section className="bg-surface border border-border rounded-sm">
        <div className="px-4 py-3 border-b border-border">
          <h2
            id="measurements-heading"
            className="text-base font-semibold text-foreground"
          >
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
                  10-metre walk speed
                </th>
                <td className="font-medium">
                  {screening.walkSpeedMps != null
                    ? `${screening.walkSpeedMps} m/s`
                    : "Not recorded"}
                </td>
                <td className="text-secondary">
                  {screening.walkDurationSec != null
                    ? `Completed in ${screening.walkDurationSec} s · `
                    : ""}
                  Threshold reference: &ge; 1.00 m/s
                </td>
              </tr>
              <tr>
                <th scope="row" className="font-medium text-foreground">
                  5x Sit-to-Stand time
                </th>
                <td className="font-medium">
                  {screening.sitToStandSec != null
                    ? `${screening.sitToStandSec} s`
                    : "Not recorded"}
                </td>
                <td className="text-secondary">Threshold reference: &le; 15.0 s</td>
              </tr>
              <tr>
                <th scope="row" className="font-medium text-foreground">
                  Active flexion ROM
                </th>
                <td className="font-medium">
                  {screening.flexionDeg != null
                    ? `${screening.flexionDeg}°`
                    : "Not recorded"}
                </td>
                <td className="text-secondary">
                  Reference baseline: {screening.referenceFlexion || 135}°
                  {flexionPercent !== null ? ` (${flexionPercent}% of baseline)` : ""}
                </td>
              </tr>
              <tr>
                <th scope="row" className="font-medium text-foreground">
                  Extension deficit
                </th>
                <td>
                  {screening.extensionDeficitDeg != null
                    ? `${screening.extensionDeficitDeg}°`
                    : "Not recorded"}
                </td>
                <td className="text-secondary">Target: 0° full extension</td>
              </tr>
              <tr>
                <th scope="row" className="font-medium text-foreground">
                  Pain score (VAS)
                </th>
                <td>
                  {screening.painScore != null
                    ? `${screening.painScore} / 10`
                    : "Not recorded"}
                </td>
                <td className="text-secondary">
                  Patient-reported visual analog score
                </td>
              </tr>
              <tr>
                <th scope="row" className="font-medium text-foreground">
                  Morning stiffness
                </th>
                <td>
                  {screening.morningStiffnessMin != null
                    ? `${screening.morningStiffnessMin} minutes`
                    : "Not recorded"}
                </td>
                <td className="text-secondary">
                  Duration prior to functional loosening
                </td>
              </tr>
              <tr>
                <th scope="row" className="font-medium text-foreground">
                  Effusion / Swelling
                </th>
                <td>{screening.swellingPresent ? "Present" : "Absent"}</td>
                <td className="text-secondary">
                  Physical palpation and visual check
                </td>
              </tr>
              <tr>
                <th scope="row" className="font-medium text-foreground">
                  Crepitus
                </th>
                <td>{screening.crepitusPresent ? "Present" : "Absent"}</td>
                <td className="text-secondary">
                  During passive or active joint articulation
                </td>
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
