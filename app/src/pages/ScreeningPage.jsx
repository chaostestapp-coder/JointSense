import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Pause, Play, RotateCcw } from "lucide-react";
import DeviceStatusBar from "../components/screening/DeviceStatusBar";
import InsoleVisualisations from "../components/screening/InsoleVisualisations";
import MovementIllustration from "../components/screening/MovementIllustration";
import ScreeningSummaryStep from "../components/screening/ScreeningSummaryStep";
import SensorVisualisations from "../components/screening/SensorVisualisations";
import TestStepper from "../components/screening/TestStepper";
import { useAuth } from "../context/useAuth";
import { subscribeToPatients } from "../services/patientService";
import {
  evaluateClinicalScreening,
  saveScreeningWithOfflineFallback,
} from "../services/screeningService";
import { createEmptyInsoleTelemetry } from "../services/transports/insoleSchema";
import { createFirebaseInsoleTransport } from "../services/transports/firebaseInsoleTransport";
import {
  createEmptyTestTelemetry,
  SCREENING_TESTS,
} from "../services/transports/screeningSchema";
import { createFirebaseRtdbTransport } from "../services/transports/firebaseRtdbTransport";

const JOINT_OPTIONS = ["Knee", "Hip", "Shoulder", "Ankle"];
const SIDE_OPTIONS = ["Right", "Left", "Bilateral"];

function createInitialTestStates() {
  return {
    walk_10m: {
      completed: false,
      elapsedSec: null,
      manualValues: { walkDurationSec: "" },
      telemetry: null,
      insoleTelemetry: null,
    },
    sit_to_stand_5x: {
      completed: false,
      elapsedSec: null,
      manualValues: { sitToStandSec: "" },
      telemetry: null,
      insoleTelemetry: null,
    },
    knee_bend_extend: {
      completed: false,
      elapsedSec: null,
      manualValues: { flexionDeg: "", extensionDeficitDeg: "" },
      telemetry: null,
      insoleTelemetry: null,
    },
  };
}

function formatTimer(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1).padStart(4, "0");
  return `${String(mins).padStart(2, "0")}:${secs}`;
}

export default function ScreeningPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedPatientId = searchParams.get("patientId") || "";

  const [patients, setPatients] = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [error, setError] = useState("");
  const [offlineNotice, setOfflineNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [patientId, setPatientId] = useState(preselectedPatientId);
  const [jointType, setJointType] = useState("Knee");
  const [side, setSide] = useState("Right");

  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [testStates, setTestStates] = useState(createInitialTestStates);
  const [symptomForm, setSymptomForm] = useState({
    painScore: "",
    morningStiffnessMin: "",
    gaitStatus: "Unassisted",
    swellingPresent: false,
    crepitusPresent: false,
    instabilityReported: false,
    clinicalObservations: "",
  });

  // Firebase RTDB live sensor listener (Knee Sleeve)
  const adapter = useMemo(() => createFirebaseRtdbTransport(), []);
  const capabilities = useMemo(() => adapter.getCapabilities(), [adapter]);
  const [telemetry, setTelemetry] = useState(() =>
    createEmptyTestTelemetry(SCREENING_TESTS[0].id)
  );
  const [connectError, setConnectError] = useState("");

  // Independent Smart Insole RTDB listener
  const insoleAdapter = useMemo(() => createFirebaseInsoleTransport(), []);
  const insoleCapabilities = useMemo(
    () => insoleAdapter.getCapabilities(),
    [insoleAdapter]
  );
  const [insoleTelemetry, setInsoleTelemetry] = useState(() =>
    createEmptyInsoleTelemetry()
  );
  const [insoleConnectError, setInsoleConnectError] = useState("");

  // Stopwatch state for the active test
  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const timerStartRef = useRef(0);

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

  // Manage active hardware/demo transport subscription
  useEffect(() => {
    const unsubscribe = adapter.subscribe((snapshot) => {
      setTelemetry(snapshot);
      if (snapshot?.testId) {
        setTestStates((prev) => {
          const existing = prev[snapshot.testId];
          if (!existing) return prev;
          return {
            ...prev,
            [snapshot.testId]: {
              ...existing,
              telemetry: snapshot,
            },
          };
        });
      }
    });

    return () => {
      unsubscribe();
      adapter.disconnect().catch(() => {});
    };
  }, [adapter]);

  // Independent Smart Insole subscription
  useEffect(() => {
    const unsubscribe = insoleAdapter.subscribe((snapshot) => {
      setInsoleTelemetry(snapshot);
      if (snapshot?.timing?.receivedAtMs) {
        const currentTest = SCREENING_TESTS[activeStepIndex];
        if (!currentTest) return;
        setTestStates((prev) => ({
          ...prev,
          [currentTest.id]: {
            ...prev[currentTest.id],
            insoleTelemetry: snapshot,
          },
        }));
      }
    });

    return () => {
      unsubscribe();
      insoleAdapter.disconnect().catch(() => {});
    };
  }, [insoleAdapter, activeStepIndex]);

  // Keep transport notified when active test changes
  useEffect(() => {
    const activeTest = SCREENING_TESTS[activeStepIndex];
    if (activeTest) {
      adapter.setActiveTest(activeTest.id);
    }
  }, [adapter, activeStepIndex]);

  // Stopwatch interval
  useEffect(() => {
    if (!timerRunning) return undefined;
    const interval = setInterval(() => {
      setElapsedSec(
        Number(((Date.now() - timerStartRef.current) / 1000).toFixed(1))
      );
    }, 100);
    return () => clearInterval(interval);
  }, [timerRunning]);

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

  const activeTest = SCREENING_TESTS[activeStepIndex] || null;
  const isSummaryStep = activeStepIndex >= SCREENING_TESTS.length;

  const handleSelectStep = (nextIndex) => {
    setTimerRunning(false);
    setActiveStepIndex(nextIndex);
    const targetTest = SCREENING_TESTS[nextIndex];
    if (targetTest) {
      setElapsedSec(testStates[targetTest.id]?.elapsedSec || 0);
    }
  };

  const handleConnectTransport = async () => {
    if (!selectedPatient) {
      setConnectError("Select a patient before starting the sensor listener.");
      return;
    }
    setConnectError("");
    try {
      await adapter.connect();
    } catch (err) {
      setConnectError(err.message || "Unable to connect to Firebase.");
    }
  };

  const handleDisconnectTransport = async () => {
    setConnectError("");
    await adapter.disconnect();
  };

  const handleConnectInsole = async () => {
    if (!selectedPatient) {
      setInsoleConnectError(
        "Select a patient before starting the smart insole listener."
      );
      return;
    }
    setInsoleConnectError("");
    try {
      await insoleAdapter.connect();
    } catch (err) {
      setInsoleConnectError(
        err.message || "Smart insole listener is not ready yet."
      );
    }
  };

  const handleDisconnectInsole = async () => {
    setInsoleConnectError("");
    await insoleAdapter.disconnect();
  };

  const handleStartTest = async () => {
    if (!activeTest || !selectedPatient) return;
    timerStartRef.current = Date.now() - elapsedSec * 1000;
    setTimerRunning(true);
    setConnectError("");
    try {
      await adapter.startTest(activeTest.id);
    } catch (err) {
      setConnectError(err.message || "Unable to start sensor stream.");
    }
  };

  const handlePauseTest = async () => {
    setTimerRunning(false);
    await adapter.pauseTest();
  };

  const handleResetTest = () => {
    if (!activeTest) return;
    setTimerRunning(false);
    timerStartRef.current = 0;
    setElapsedSec(0);
    setTestStates((prev) => ({
      ...prev,
      [activeTest.id]: {
        ...prev[activeTest.id],
        completed: false,
        elapsedSec: null,
      },
    }));
  };

  const handleManualFieldChange = (testId, field, value) => {
    setTestStates((prev) => ({
      ...prev,
      [testId]: {
        ...prev[testId],
        manualValues: {
          ...prev[testId].manualValues,
          [field]: value,
        },
      },
    }));
  };

  const handleCompleteTest = async () => {
    if (!activeTest) return;
    setTimerRunning(false);
    await adapter.completeTest();

    const capturedDuration = elapsedSec > 0 ? Number(elapsedSec.toFixed(1)) : null;

    setTestStates((prev) => {
      const current = prev[activeTest.id];
      const nextManual = { ...current.manualValues };

      if (
        activeTest.id === "walk_10m" &&
        !nextManual.walkDurationSec &&
        capturedDuration != null
      ) {
        nextManual.walkDurationSec = String(capturedDuration);
      }
      if (
        activeTest.id === "sit_to_stand_5x" &&
        !nextManual.sitToStandSec &&
        capturedDuration != null
      ) {
        nextManual.sitToStandSec = String(capturedDuration);
      }

      return {
        ...prev,
        [activeTest.id]: {
          ...current,
          completed: true,
          elapsedSec: capturedDuration ?? current.elapsedSec,
          manualValues: nextManual,
        },
      };
    });

    const nextIndex = activeStepIndex + 1;
    setActiveStepIndex(nextIndex);
    const nextTest = SCREENING_TESTS[nextIndex];
    setElapsedSec(nextTest ? testStates[nextTest.id]?.elapsedSec || 0 : 0);
  };

  const handleSymptomChange = (field, value) => {
    setSymptomForm((prev) => ({ ...prev, [field]: value }));
  };

  const compiledScreeningData = useMemo(() => {
    const walkState = testStates.walk_10m;
    const sitState = testStates.sit_to_stand_5x;
    const bendState = testStates.knee_bend_extend;

    const walkDurationSec = walkState.manualValues.walkDurationSec;
    const walkRealProcessed =
      !walkState.telemetry?.isDemoData && !walkState.telemetry?.isStale
        ? walkState.telemetry?.processed
        : null;
    const walkSpeedMps =
      walkRealProcessed?.walkingSpeedMs != null
        ? walkRealProcessed.walkingSpeedMs
        : walkDurationSec && Number(walkDurationSec) > 0
          ? Number((10 / Number(walkDurationSec)).toFixed(2))
          : null;

    const sitToStandSec = sitState.manualValues.sitToStandSec;

    const bendRealProcessed =
      !bendState.telemetry?.isDemoData && !bendState.telemetry?.isStale
        ? bendState.telemetry?.processed
        : null;
    const flexionDeg =
      bendState.manualValues.flexionDeg ||
      (bendRealProcessed?.kneeAngleDeg != null
        ? String(bendRealProcessed.kneeAngleDeg)
        : "");

    const extensionDeficitDeg = bendState.manualValues.extensionDeficitDeg;

    return {
      jointType,
      side,
      walkDurationSec,
      walkSpeedMps,
      sitToStandSec,
      flexionDeg,
      extensionDeficitDeg,
      ...symptomForm,
      guidedTests: testStates,
    };
  }, [jointType, side, symptomForm, testStates]);

  const thresholdEvaluation = useMemo(
    () => evaluateClinicalScreening(compiledScreeningData),
    [compiledScreeningData]
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selectedPatient) {
      setError("Select a registered patient to save the screening.");
      return;
    }

    setError("");
    setOfflineNotice("");
    setSubmitting(true);

    try {
      const result = await saveScreeningWithOfflineFallback(user.uid, {
        patientId: selectedPatient.id,
        patientName: selectedPatient.fullName,
        patientMrn: selectedPatient.mrn,
        doctorSnapshot: {
          fullName:
            profile?.fullName || user?.displayName || user?.email || "",
          department:
            profile?.department || "Outpatient Musculoskeletal Clinic",
          specialty: profile?.specialty || "",
          licenseId: profile?.licenseId || "",
        },
        ...compiledScreeningData,
      });

      if (result.mode === "offline_queued") {
        setOfflineNotice(
          "You are currently offline. This screening has been safely queued in local IndexedDB storage and will sync automatically when connectivity returns."
        );
        setSubmitting(false);
        return;
      }

      navigate(`/screenings/${result.id}`);
    } catch (err) {
      setError(err.message || "Unable to save screening record.");
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="pb-4 border-b border-border flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Guided knee screening workflow
          </h1>
          <p className="text-sm text-secondary mt-1">
            Three-part functional assessment with wearable telemetry support and
            threshold-based clinical review.
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

      {offlineNotice && (
        <div
          role="status"
          className="px-4 py-3 text-sm bg-warning-bg text-warning-text border border-warning-border rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2"
        >
          <span>{offlineNotice}</span>
          <Link to="/" className="font-medium underline shrink-0">
            Return to dashboard
          </Link>
        </div>
      )}

      {!loadingPatients && patients.length === 0 ? (
        <div className="bg-surface border border-border rounded-sm p-6 space-y-3">
          <h2 className="text-base font-semibold text-foreground">
            No registered patients available
          </h2>
          <p className="text-sm text-secondary">
            Register a patient in Patient Management before starting a guided
            screening session.
          </p>
          <Link
            to="/patients"
            className="link-button inline-flex items-center px-4 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-accent-foreground rounded-sm"
          >
            Go to patient management
          </Link>
        </div>
      ) : (
        <>
          {/* Step 1: Patient & Joint Context */}
          <section className="bg-surface border border-border rounded-sm p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5 items-end">
              <div className="md:col-span-2">
                <label
                  htmlFor="screening-patient"
                  className="block text-xs font-medium text-secondary mb-1"
                >
                  Patient <span aria-hidden="true">*</span>
                </label>
                <select
                  id="screening-patient"
                  value={patientId}
                  onChange={(e) => handlePatientChange(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground"
                >
                  <option value="">Select a registered patient...</option>
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
                  className="block text-xs font-medium text-secondary mb-1"
                >
                  Target joint
                </label>
                <select
                  id="screening-joint"
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
                  className="block text-xs font-medium text-secondary mb-1"
                >
                  Laterality
                </label>
                <select
                  id="screening-side"
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
          </section>

          {/* Firebase RTDB Live Sensor Status */}
          <DeviceStatusBar
            telemetry={telemetry}
            capabilities={capabilities}
            disabled={!selectedPatient}
            onConnect={handleConnectTransport}
            onDisconnect={handleDisconnectTransport}
            connectError={connectError}
          />

          {!selectedPatient && (
            <div
              role="status"
              className="px-4 py-2.5 text-sm bg-warning-bg text-warning-text border border-warning-border rounded-sm"
            >
              Select a registered patient above before starting the screening
              tests or sensor listener.
            </div>
          )}

          {/* 3-Test + Summary Stepper */}
          <TestStepper
            activeStepIndex={activeStepIndex}
            completedTests={testStates}
            disabled={!selectedPatient}
            onSelectStep={handleSelectStep}
          />

          {/* Active Guided Test Workspace or Summary Step */}
          {!isSummaryStep && activeTest ? (
            <section className="bg-surface border border-border rounded-sm divide-y divide-border">
              {/* Test Header & Instructions + Visual Demonstration */}
              <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                <div className="lg:col-span-7 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold text-foreground">
                      Test {activeTest.order}: {activeTest.name}
                    </h2>
                    <span className="text-xs font-medium text-secondary">
                      {testStates[activeTest.id]?.completed
                        ? "Completed"
                        : "In progress"}
                    </span>
                  </div>

                  <p className="text-sm text-secondary">{activeTest.purpose}</p>

                  <div className="pt-1">
                    <h3 className="text-xs font-semibold text-foreground mb-1.5">
                      Instructions for the patient
                    </h3>
                    <ol className="list-decimal list-inside space-y-1 text-sm text-foreground">
                      {activeTest.patientInstructions.map((step, idx) => (
                        <li key={idx}>{step}</li>
                      ))}
                    </ol>
                  </div>

                  {activeTest.completionCriteria && (
                    <div className="px-3 py-2 bg-surface-muted/50 border border-border rounded-sm text-xs text-secondary">
                      <strong className="text-foreground">How to finish: </strong>
                      {activeTest.completionCriteria}
                    </div>
                  )}

                  {/* Test Controls & Stopwatch */}
                  <div className="pt-3 border-t border-border flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {!timerRunning ? (
                        <button
                          type="button"
                          disabled={!selectedPatient}
                          onClick={handleStartTest}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-accent-foreground rounded-sm"
                        >
                          <Play size={14} strokeWidth={1.75} aria-hidden="true" />
                          <span>Start test</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handlePauseTest}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-foreground bg-surface-muted hover:bg-surface-hover border border-border rounded-sm"
                        >
                          <Pause size={14} strokeWidth={1.75} aria-hidden="true" />
                          <span>Pause</span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={!selectedPatient}
                        onClick={handleResetTest}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-secondary hover:text-foreground bg-surface hover:bg-surface-muted border border-border rounded-sm"
                      >
                        <RotateCcw size={14} strokeWidth={1.75} aria-hidden="true" />
                        <span>Reset</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-sm font-mono font-semibold text-foreground px-2.5 py-1 bg-surface-muted border border-border rounded-sm">
                        {formatTimer(elapsedSec)}
                      </div>
                      <button
                        type="button"
                        disabled={!selectedPatient}
                        onClick={handleCompleteTest}
                        className="px-4 py-2 text-sm font-medium text-foreground bg-surface hover:bg-surface-muted border border-border rounded-sm"
                      >
                        {activeStepIndex === SCREENING_TESTS.length - 1
                          ? "Complete & review summary"
                          : "Complete & next test"}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-5">
                  <MovementIllustration testId={activeTest.id} />
                </div>
              </div>

              {/* Manual / Clinician Reference Entry for Active Test */}
              <div className="px-5 py-3.5 bg-surface-muted/30 flex flex-col sm:flex-row sm:items-end gap-4">
                {activeTest.id === "walk_10m" && (
                  <div className="w-full sm:w-64">
                    <label
                      htmlFor="manual-walk-sec"
                      className="block text-xs font-medium text-secondary mb-1"
                    >
                      Recorded 10 m walk time (seconds)
                    </label>
                    <input
                      id="manual-walk-sec"
                      type="number"
                      step="0.1"
                      min="1"
                      max="180"
                      value={testStates.walk_10m.manualValues.walkDurationSec}
                      onChange={(e) =>
                        handleManualFieldChange(
                          "walk_10m",
                          "walkDurationSec",
                          e.target.value
                        )
                      }
                      placeholder="Auto-fills on Complete or enter"
                      className="w-full px-3 py-1.5 bg-surface border border-border rounded-sm text-sm text-foreground"
                    />
                  </div>
                )}

                {activeTest.id === "sit_to_stand_5x" && (
                  <div className="w-full sm:w-64">
                    <label
                      htmlFor="manual-sts-sec"
                      className="block text-xs font-medium text-secondary mb-1"
                    >
                      Recorded 5x sit-to-stand time (seconds)
                    </label>
                    <input
                      id="manual-sts-sec"
                      type="number"
                      step="0.1"
                      min="1"
                      max="180"
                      value={testStates.sit_to_stand_5x.manualValues.sitToStandSec}
                      onChange={(e) =>
                        handleManualFieldChange(
                          "sit_to_stand_5x",
                          "sitToStandSec",
                          e.target.value
                        )
                      }
                      placeholder="Auto-fills on Complete or enter"
                      className="w-full px-3 py-1.5 bg-surface border border-border rounded-sm text-sm text-foreground"
                    />
                  </div>
                )}

                {activeTest.id === "knee_bend_extend" && (
                  <>
                    <div className="w-full sm:w-52">
                      <label
                        htmlFor="manual-flexion-deg"
                        className="block text-xs font-medium text-secondary mb-1"
                      >
                        Peak knee flexion (degrees)
                      </label>
                      <input
                        id="manual-flexion-deg"
                        type="number"
                        min="0"
                        max="180"
                        value={testStates.knee_bend_extend.manualValues.flexionDeg}
                        onChange={(e) =>
                          handleManualFieldChange(
                            "knee_bend_extend",
                            "flexionDeg",
                            e.target.value
                          )
                        }
                        placeholder="e.g., 118"
                        className="w-full px-3 py-1.5 bg-surface border border-border rounded-sm text-sm text-foreground"
                      />
                    </div>
                    <div className="w-full sm:w-52">
                      <label
                        htmlFor="manual-ext-deg"
                        className="block text-xs font-medium text-secondary mb-1"
                      >
                        Extension deficit (degrees)
                      </label>
                      <input
                        id="manual-ext-deg"
                        type="number"
                        min="0"
                        max="90"
                        value={
                          testStates.knee_bend_extend.manualValues
                            .extensionDeficitDeg
                        }
                        onChange={(e) =>
                          handleManualFieldChange(
                            "knee_bend_extend",
                            "extensionDeficitDeg",
                            e.target.value
                          )
                        }
                        placeholder="0 = full extension"
                        className="w-full px-3 py-1.5 bg-surface border border-border rounded-sm text-sm text-foreground"
                      />
                    </div>
                  </>
                )}

                <p className="text-xs text-muted">
                  Clinician-entered measurements are saved directly to the
                  patient&apos;s screening record; demo telemetry is excluded.
                </p>
              </div>

              {/* Sensor Visualisations Area (Relevant to Active Test Only) */}
              <div className="p-5 space-y-5">
                <SensorVisualisations
                  test={activeTest}
                  telemetry={telemetry}
                  manualValues={testStates[activeTest.id]?.manualValues}
                />

                <InsoleVisualisations
                  insoleTelemetry={insoleTelemetry}
                  capabilities={insoleCapabilities}
                  disabled={!selectedPatient}
                  onConnect={handleConnectInsole}
                  onDisconnect={handleDisconnectInsole}
                  connectError={insoleConnectError}
                />
              </div>
            </section>
          ) : (
            <ScreeningSummaryStep
              selectedPatient={selectedPatient}
              jointType={jointType}
              side={side}
              testStates={testStates}
              symptomForm={symptomForm}
              onSymptomChange={handleSymptomChange}
              thresholdEvaluation={thresholdEvaluation}
              submitting={submitting}
              onBack={() => handleSelectStep(SCREENING_TESTS.length - 1)}
              onSubmit={handleSubmit}
            />
          )}
        </>
      )}
    </div>
  );
}
