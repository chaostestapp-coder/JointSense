import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useAuth } from "../context/useAuth";
import { subscribeToPatients } from "../services/patientService";
import {
  createScreening,
  evaluateClinicalScreening,
  isExternalScreeningApiConfigured,
  requestExternalScreeningAnalysis,
} from "../services/screeningService";
import StatusBadge from "../components/common/StatusBadge";

const JOINT_OPTIONS = ["Knee", "Hip", "Shoulder", "Ankle"];
const SIDE_OPTIONS = ["Right", "Left", "Bilateral"];
const GAIT_OPTIONS = [
  "Unassisted",
  "Antalgic / Limp",
  "Cane / Single Crutch",
  "Walker / Bilateral Support",
  "Non-weight Bearing",
];

export default function ScreeningPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedPatientId = searchParams.get("patientId") || "";

  const [patients, setPatients] = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [patientId, setPatientId] = useState(preselectedPatientId);
  const [jointType, setJointType] = useState("Knee");
  const [side, setSide] = useState("Right");
  const [gaitStatus, setGaitStatus] = useState("Unassisted");

  const [painScore, setPainScore] = useState("3");
  const [flexionDeg, setFlexionDeg] = useState("120");
  const [extensionDeficitDeg, setExtensionDeficitDeg] = useState("0");
  const [contralateralFlexionDeg, setContralateralFlexionDeg] = useState("");
  const [morningStiffnessMin, setMorningStiffnessMin] = useState("10");

  const [swellingPresent, setSwellingPresent] = useState(false);
  const [crepitusPresent, setCrepitusPresent] = useState(false);
  const [instabilityReported, setInstabilityReported] = useState(false);
  const [clinicalObservations, setClinicalObservations] = useState("");

  const [externalResult, setExternalResult] = useState(null);
  const [runningExternal, setRunningExternal] = useState(false);

  useEffect(() => {
    if (!user?.uid) return undefined;
    const unsubscribe = subscribeToPatients(
      user.uid,
      (list) => {
        setPatients(list);
        if (preselectedPatientId) {
          const match = list.find((p) => p.id === preselectedPatientId);
          if (match) {
            if (match.primaryJoint) setJointType(match.primaryJoint);
            if (match.affectedSide) setSide(match.affectedSide);
          }
        }
        setLoadingPatients(false);
      },
      (err) => {
        setError(err.message || "Unable to load patient list.");
        setLoadingPatients(false);
      }
    );
    return () => unsubscribe();
  }, [user?.uid, preselectedPatientId]);

  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === patientId) || null,
    [patients, patientId]
  );

  const handlePatientChange = (nextPatientId) => {
    setPatientId(nextPatientId);
    const match = patients.find((p) => p.id === nextPatientId);
    if (match) {
      if (match.primaryJoint) setJointType(match.primaryJoint);
      if (match.affectedSide) setSide(match.affectedSide);
    }
  };

  const baselinePreview = useMemo(
    () =>
      evaluateClinicalScreening({
        jointType,
        painScore,
        flexionDeg,
        extensionDeficitDeg,
        morningStiffnessMin,
        swellingPresent,
        crepitusPresent,
        instabilityReported,
      }),
    [
      jointType,
      painScore,
      flexionDeg,
      extensionDeficitDeg,
      morningStiffnessMin,
      swellingPresent,
      crepitusPresent,
      instabilityReported,
    ]
  );

  const handleRunExternalApi = async () => {
    if (!selectedPatient) {
      setError("Select a patient before running external analysis.");
      return;
    }
    setError("");
    setRunningExternal(true);
    try {
      const data = await requestExternalScreeningAnalysis({
        patientId: selectedPatient.id,
        patientMrn: selectedPatient.mrn,
        jointType,
        side,
        painScore: Number(painScore),
        flexionDeg: Number(flexionDeg),
        extensionDeficitDeg: Number(extensionDeficitDeg),
        morningStiffnessMin: Number(morningStiffnessMin),
        swellingPresent,
        crepitusPresent,
        instabilityReported,
        gaitStatus,
      });
      setExternalResult(data);
    } catch (err) {
      setError(err.message || "External screening API request failed.");
    } finally {
      setRunningExternal(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selectedPatient) {
      setError("Select a registered patient to save the screening.");
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      const screeningId = await createScreening(user.uid, {
        patientId: selectedPatient.id,
        patientName: selectedPatient.fullName,
        patientMrn: selectedPatient.mrn,
        jointType,
        side,
        gaitStatus,
        painScore,
        flexionDeg,
        extensionDeficitDeg,
        contralateralFlexionDeg,
        morningStiffnessMin,
        swellingPresent,
        crepitusPresent,
        instabilityReported,
        clinicalObservations,
        externalAnalysis: externalResult,
      });

      navigate(`/screenings/${screeningId}`);
    } catch (err) {
      setError(err.message || "Unable to save joint screening.");
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-border flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Joint screening assessment
          </h1>
          <p className="text-sm text-secondary mt-1">
            Record goniometric range of motion, pain score, and physical
            examination findings.
          </p>
        </div>
        <Link
          to="/patients"
          className="text-sm font-medium text-link hover:underline shrink-0"
        >
          Manage patient directory
        </Link>
      </div>

      {error && (
        <div
          role="alert"
          className="px-4 py-2.5 text-sm bg-danger-bg text-danger-text border border-danger-border rounded-sm"
        >
          {error}
        </div>
      )}

      {!loadingPatients && patients.length === 0 ? (
        <div className="bg-surface border border-border rounded-sm p-6 space-y-3">
          <h2 className="text-base font-semibold text-foreground">
            No registered patients available
          </h2>
          <p className="text-sm text-secondary">
            Register a patient in Patient Management before recording a joint
            screening.
          </p>
          <Link
            to="/patients"
            className="link-button inline-flex items-center px-4 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-accent-foreground rounded-sm"
          >
            Go to patient management
          </Link>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="bg-surface border border-border rounded-sm divide-y divide-border"
        >
          {/* Section 1: Patient & Joint Context */}
          <div className="p-5 space-y-4">
            <h2 className="text-base font-semibold text-foreground">
              1. Patient & joint selection
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-2">
                <label
                  htmlFor="screening-patient"
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  Patient <span aria-hidden="true">*</span>
                </label>
                <select
                  id="screening-patient"
                  name="patientId"
                  required
                  value={patientId}
                  onChange={(e) => handlePatientChange(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground"
                >
                  <option value="">Select a patient...</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} ({p.mrn})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="screening-joint"
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  Joint <span aria-hidden="true">*</span>
                </label>
                <select
                  id="screening-joint"
                  name="jointType"
                  required
                  value={jointType}
                  onChange={(e) => setJointType(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground"
                >
                  {JOINT_OPTIONS.map((joint) => (
                    <option key={joint} value={joint}>
                      {joint}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="screening-side"
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  Laterality <span aria-hidden="true">*</span>
                </label>
                <select
                  id="screening-side"
                  name="side"
                  required
                  value={side}
                  onChange={(e) => setSide(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground"
                >
                  {SIDE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Objective Measurements */}
          <div className="p-5 space-y-4">
            <h2 className="text-base font-semibold text-foreground">
              2. Range of motion & symptom metrics
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label
                  htmlFor="screening-flexion"
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  Active flexion (deg) <span aria-hidden="true">*</span>
                </label>
                <input
                  id="screening-flexion"
                  name="flexionDeg"
                  type="number"
                  min={0}
                  max={180}
                  required
                  value={flexionDeg}
                  onChange={(e) => setFlexionDeg(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground"
                />
                <span className="block text-xs text-muted mt-1">
                  Ref: {baselinePreview.referenceFlexion}°
                </span>
              </div>

              <div>
                <label
                  htmlFor="screening-extension"
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  Extension deficit (deg) <span aria-hidden="true">*</span>
                </label>
                <input
                  id="screening-extension"
                  name="extensionDeficitDeg"
                  type="number"
                  min={0}
                  max={90}
                  required
                  value={extensionDeficitDeg}
                  onChange={(e) => setExtensionDeficitDeg(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground"
                />
              </div>

              <div>
                <label
                  htmlFor="screening-contralateral"
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  Contralateral flexion (deg)
                </label>
                <input
                  id="screening-contralateral"
                  name="contralateralFlexionDeg"
                  type="number"
                  min={0}
                  max={180}
                  value={contralateralFlexionDeg}
                  onChange={(e) => setContralateralFlexionDeg(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground"
                />
              </div>

              <div>
                <label
                  htmlFor="screening-pain"
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  Pain VAS (0–10) <span aria-hidden="true">*</span>
                </label>
                <input
                  id="screening-pain"
                  name="painScore"
                  type="number"
                  min={0}
                  max={10}
                  required
                  value={painScore}
                  onChange={(e) => setPainScore(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground"
                />
              </div>

              <div>
                <label
                  htmlFor="screening-stiffness"
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  Morning stiffness (min) <span aria-hidden="true">*</span>
                </label>
                <input
                  id="screening-stiffness"
                  name="morningStiffnessMin"
                  type="number"
                  min={0}
                  max={360}
                  required
                  value={morningStiffnessMin}
                  onChange={(e) => setMorningStiffnessMin(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Physical Examination & Notes */}
          <div className="p-5 space-y-4">
            <h2 className="text-base font-semibold text-foreground">
              3. Physical examination & functional status
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <fieldset className="space-y-2.5">
                <legend className="text-sm font-medium text-foreground mb-1">
                  Clinical findings observed
                </legend>

                <label className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={swellingPresent}
                    onChange={(e) => setSwellingPresent(e.target.checked)}
                    className="w-4 h-4 accent-accent"
                  />
                  <span>Joint effusion / visible swelling present</span>
                </label>

                <label className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={crepitusPresent}
                    onChange={(e) => setCrepitusPresent(e.target.checked)}
                    className="w-4 h-4 accent-accent"
                  />
                  <span>Palpable or audible crepitus during passive ROM</span>
                </label>

                <label className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={instabilityReported}
                    onChange={(e) => setInstabilityReported(e.target.checked)}
                    className="w-4 h-4 accent-accent"
                  />
                  <span>Patient reports instability or giving-way episodes</span>
                </label>
              </fieldset>

              <div>
                <label
                  htmlFor="screening-gait"
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  Gait / weight-bearing status
                </label>
                <select
                  id="screening-gait"
                  name="gaitStatus"
                  value={gaitStatus}
                  onChange={(e) => setGaitStatus(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground"
                >
                  {GAIT_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="screening-observations"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Examiner observations
              </label>
              <textarea
                id="screening-observations"
                name="clinicalObservations"
                rows={3}
                value={clinicalObservations}
                onChange={(e) => setClinicalObservations(e.target.value)}
                placeholder="Joint line tenderness, end-feel quality, ligamentous laxity notes..."
                className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground"
              />
            </div>
          </div>

          {/* Section 4: Assessment Preview & Save */}
          <div className="p-5 bg-surface-muted/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <span className="text-sm font-medium text-foreground">
                  Calculated baseline index:{" "}
                  {(externalResult || baselinePreview).compositeIndex}/100
                </span>
                <StatusBadge
                  status={(externalResult || baselinePreview).riskLevel}
                />
              </div>
              <p className="text-xs text-secondary max-w-2xl">
                {(externalResult || baselinePreview).summaryRecommendation}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {isExternalScreeningApiConfigured && (
                <button
                  type="button"
                  disabled={runningExternal}
                  onClick={handleRunExternalApi}
                  className="px-3.5 py-2 text-sm font-medium text-foreground bg-surface hover:bg-surface-hover border border-border rounded-sm"
                >
                  {runningExternal ? "Analyzing..." : "Run external API analysis"}
                </button>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-accent-foreground rounded-sm"
              >
                {submitting ? "Saving screening..." : "Save & open result"}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
