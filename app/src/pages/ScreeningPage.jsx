import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import DeviceStatusBar from "../components/screening/DeviceStatusBar";
import MovementIllustration from "../components/screening/MovementIllustration";
import ScreeningSummaryStep from "../components/screening/ScreeningSummaryStep";
import SensorVisualisations from "../components/screening/SensorVisualisations";
import TestStepper from "../components/screening/TestStepper";
import { useAuth } from "../context/useAuth";
import { useLanguage } from "../context/useLanguage";
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
import { getTest3Copy, SCREENING_COPY } from "../utils/screeningTranslations";
import {
  isSpeechSynthesisSupported,
  speakText,
  stopSpeaking,
} from "../utils/speechHelper";

const JOINT_OPTIONS = ["Knee"];
const SIDE_OPTIONS = ["Right", "Left", "Bilateral"];

function createInitialTestStates() {
  return {
    walk_10m: {
      completed: false,
      elapsedSec: null,
      manualValues: { walkDurationSec: "" },
      telemetry: null,
      insoleTelemetry: null,
      kneeInterrupted: false,
      insoleInterrupted: false,
    },
    sit_to_stand_5x: {
      completed: false,
      elapsedSec: null,
      manualValues: { sitToStandSec: "" },
      telemetry: null,
      insoleTelemetry: null,
      kneeInterrupted: false,
      insoleInterrupted: false,
    },
    knee_bend_extend: {
      completed: false,
      elapsedSec: null,
      manualValues: { flexionDeg: "", extensionDeficitDeg: "" },
      telemetry: null,
      insoleTelemetry: null,
      kneeInterrupted: false,
      insoleInterrupted: false,
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
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedPatientId = searchParams.get("patientId") || "";

  const copy = SCREENING_COPY[lang] || SCREENING_COPY.en;

  const [patients, setPatients] = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [error, setError] = useState("");
  const [offlineNotice, setOfflineNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [patientId, setPatientId] = useState(preselectedPatientId);
  const [jointType, setJointType] = useState("Knee");
  const [side, setSide] = useState("Right");

  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const activeStepIndexRef = useRef(0);
  useEffect(() => {
    activeStepIndexRef.current = activeStepIndex;
  }, [activeStepIndex]);
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

  // Doctor live sensor drawer (collapsed by default for ASHA clarity)
  const [showDoctorView, setShowDoctorView] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechError, setSpeechError] = useState("");

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
  const [sessionKneeSamples, setSessionKneeSamples] = useState([]);
  const [sessionInsoleSamples, setSessionInsoleSamples] = useState([]);

  // Stopwatch state for the active test
  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const timerStartRef = useRef(0);

  const speechSupported = isSpeechSynthesisSupported();

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

  useEffect(() => {
    const unsubscribe = adapter.subscribe((snapshot) => {
      setTelemetry(snapshot);
      if (
        snapshot?.isLive &&
        snapshot?.timing?.receivedAtMs &&
        activeStepIndexRef.current < SCREENING_TESTS.length
      ) {
        setSessionKneeSamples((prevSamples) =>
          [
            ...prevSamples,
            {
              receivedAtMs: snapshot.timing.receivedAtMs,
              kneeAngleDeg: snapshot.processed?.kneeAngleDeg ?? null,
              vibrationRms: snapshot.processed?.vibration?.rms ?? null,
              vibrationSpikes: snapshot.processed?.vibration?.spikes ?? null,
            },
          ].slice(-300)
        );
      }

      if (snapshot?.testId) {
        setTestStates((prev) => {
          const existing = prev[snapshot.testId];
          if (!existing) return prev;

          if (snapshot.isLive && snapshot.timing?.receivedAtMs) {
            const liveAngle = snapshot.processed?.kneeAngleDeg;
            const nextPeak =
              snapshot.testId === "knee_bend_extend" &&
              liveAngle != null &&
              Number.isFinite(Number(liveAngle))
                ? Math.max(
                    existing.peakFlexionDeg ?? -Infinity,
                    Number(liveAngle)
                  )
                : existing.peakFlexionDeg;

            return {
              ...prev,
              [snapshot.testId]: {
                ...existing,
                telemetry: snapshot,
                kneeInterrupted: false,
                ...(nextPeak !== undefined && nextPeak !== -Infinity
                  ? { peakFlexionDeg: Number(nextPeak.toFixed(1)) }
                  : {}),
              },
            };
          }

          // Retain last valid live reading if sensor goes stale or disconnects mid-test
          if (existing.telemetry?.timing?.receivedAtMs) {
            return {
              ...prev,
              [snapshot.testId]: {
                ...existing,
                kneeInterrupted:
                  Boolean(snapshot.isStale) || existing.kneeInterrupted,
              },
            };
          }

          return prev;
        });
      }
    });

    return () => {
      unsubscribe();
      adapter.disconnect().catch(() => {});
    };
  }, [adapter]);

  useEffect(() => {
    const unsubscribe = insoleAdapter.subscribe((snapshot) => {
      setInsoleTelemetry(snapshot);
      if (
        snapshot?.isLive &&
        snapshot?.timing?.receivedAtMs &&
        activeStepIndexRef.current < SCREENING_TESTS.length
      ) {
        setSessionInsoleSamples((prevSamples) =>
          [
            ...prevSamples,
            {
              receivedAtMs: snapshot.timing.receivedAtMs,
              shoeAngleDeg: snapshot.processed?.shoeAngleDeg ?? null,
            },
          ].slice(-300)
        );
      }

      const currentTest = SCREENING_TESTS[activeStepIndexRef.current];
      if (!currentTest) return;

      setTestStates((prev) => {
        const existing = prev[currentTest.id];
        if (!existing) return prev;

        if (snapshot?.isLive && snapshot?.timing?.receivedAtMs) {
          return {
            ...prev,
            [currentTest.id]: {
              ...existing,
              insoleTelemetry: snapshot,
              insoleInterrupted: false,
            },
          };
        }

        // Retain last valid live reading if insole goes stale or disconnects mid-test
        if (existing.insoleTelemetry?.timing?.receivedAtMs) {
          return {
            ...prev,
            [currentTest.id]: {
              ...existing,
              insoleInterrupted:
                Boolean(snapshot?.isStale) || existing.insoleInterrupted,
            },
          };
        }

        return prev;
      });
    });

    return () => {
      unsubscribe();
      insoleAdapter.disconnect().catch(() => {});
    };
  }, [insoleAdapter]);

  useEffect(() => {
    const activeTest = SCREENING_TESTS[activeStepIndex];
    if (activeTest) {
      adapter.setActiveTest(activeTest.id);
    }
  }, [adapter, activeStepIndex]);

  useEffect(() => {
    if (!timerRunning) return undefined;
    const interval = setInterval(() => {
      setElapsedSec(
        Number(((Date.now() - timerStartRef.current) / 1000).toFixed(1))
      );
    }, 100);
    return () => clearInterval(interval);
  }, [timerRunning]);

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  const stopSpeech = () => {
    stopSpeaking();
    setIsSpeaking(false);
  };

  const handleToggleSpeech = (testCopy) => {
    if (!speechSupported || !testCopy) return;
    setSpeechError("");
    if (isSpeaking) {
      stopSpeech();
      return;
    }

    const text = `${testCopy.name}. ${testCopy.instructions.join(" ")}`;
    speakText(text, lang, {
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
      onError: (msg) => {
        setIsSpeaking(false);
        setSpeechError(msg);
      },
    });
  };

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
    stopSpeech();
    setTimerRunning(false);
    setActiveStepIndex(nextIndex);
    const targetTest = SCREENING_TESTS[nextIndex];
    if (targetTest) {
      setElapsedSec(testStates[targetTest.id]?.elapsedSec || 0);
    }
  };

  const handleConnectAllSensors = async () => {
    if (!selectedPatient) {
      setConnectError("Select a patient before starting the sensor listeners.");
      return;
    }
    setConnectError("");
    setInsoleConnectError("");

    const [kneeRes, insoleRes] = await Promise.allSettled([
      adapter.connect(),
      insoleAdapter.connect(),
    ]);

    if (kneeRes.status === "rejected") {
      setConnectError(
        kneeRes.reason?.message || "Unable to connect knee sleeve listener."
      );
    }
    if (insoleRes.status === "rejected") {
      setInsoleConnectError(
        insoleRes.reason?.message || "Unable to connect smart insole listener."
      );
    }
  };

  const handleDisconnectAllSensors = async () => {
    setConnectError("");
    setInsoleConnectError("");
    await Promise.allSettled([
      adapter.disconnect(),
      insoleAdapter.disconnect(),
    ]);
  };

  const handleDisconnectKnee = async () => {
    setConnectError("");
    await adapter.disconnect();
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
    stopSpeech();
    setTimerRunning(false);
    await adapter.completeTest();

    const capturedDuration =
      elapsedSec > 0 ? Number(elapsedSec.toFixed(1)) : null;

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
      (bendState.peakFlexionDeg != null
        ? String(bendState.peakFlexionDeg)
        : bendRealProcessed?.kneeAngleDeg != null
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
      kneeHistory:
        sessionKneeSamples.length >= 2
          ? sessionKneeSamples
          : telemetry?.historyBuffer || [],
      insoleHistory:
        sessionInsoleSamples.length >= 2
          ? sessionInsoleSamples
          : insoleTelemetry?.historyBuffer || [],
    };
  }, [
    jointType,
    side,
    symptomForm,
    testStates,
    sessionKneeSamples,
    sessionInsoleSamples,
    telemetry?.historyBuffer,
    insoleTelemetry?.historyBuffer,
  ]);

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
          "You are currently offline. This screening is saved on this device and will sync when internet returns."
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

  const activeTestCopy = activeTest
    ? activeTest.id === "knee_bend_extend"
      ? getTest3Copy(lang, jointType)
      : copy.tests[activeTest.id]
    : null;

  return (
    <div className="space-y-5">
      <div className="pb-4 border-b border-border flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            {copy.pageTitle}
          </h1>
          <p className="text-sm text-secondary mt-1">{copy.pageSubtitle}</p>
        </div>

        <Link
          to="/patients"
          className="text-sm font-medium text-link hover:underline shrink-0"
        >
          {copy.managePatients}
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
            Register a patient in Patient Management before starting a screening.
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
          {/* Patient & Joint Selector */}
          <section className="bg-surface border border-border rounded-sm p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5 items-end">
              <div className="md:col-span-2">
                <label
                  htmlFor="screening-patient"
                  className="block text-xs font-medium text-secondary mb-1"
                >
                  {copy.patientLabel} <span aria-hidden="true">*</span>
                </label>
                <select
                  id="screening-patient"
                  value={patientId}
                  onChange={(e) => handlePatientChange(e.target.value)}
                  className="w-full px-3 py-2.5 bg-surface border border-border rounded-sm text-sm text-foreground"
                >
                  <option value="">{copy.patientPlaceholder}</option>
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
                  {copy.jointLabel}
                </label>
                <select
                  id="screening-joint"
                  value={jointType}
                  onChange={(e) => setJointType(e.target.value)}
                  className="w-full px-3 py-2.5 bg-surface border border-border rounded-sm text-sm text-foreground"
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
                  {copy.sideLabel}
                </label>
                <select
                  id="screening-side"
                  value={side}
                  onChange={(e) => setSide(e.target.value)}
                  className="w-full px-3 py-2.5 bg-surface border border-border rounded-sm text-sm text-foreground"
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

          {/* Dual-Sensor Monitoring Section */}
          <DeviceStatusBar
            telemetry={telemetry}
            capabilities={capabilities}
            insoleTelemetry={insoleTelemetry}
            insoleCapabilities={insoleCapabilities}
            disabled={!selectedPatient}
            onConnectAll={handleConnectAllSensors}
            onDisconnectAll={handleDisconnectAllSensors}
            onDisconnectKnee={handleDisconnectKnee}
            onDisconnectInsole={handleDisconnectInsole}
            connectError={connectError}
            insoleConnectError={insoleConnectError}
          />

          {!selectedPatient && (
            <div
              role="status"
              className="px-4 py-2.5 text-sm bg-warning-bg text-warning-text border border-warning-border rounded-sm"
            >
              {copy.selectPatientPrompt}
            </div>
          )}

          {/* Stepper */}
          <TestStepper
            activeStepIndex={activeStepIndex}
            completedTests={testStates}
            disabled={!selectedPatient}
            onSelectStep={handleSelectStep}
          />

          {/* Active Guided Test Workspace or Summary Step */}
          {!isSummaryStep && activeTest && activeTestCopy ? (
            <section className="bg-surface border border-border rounded-sm divide-y divide-border">
              <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                <div className="lg:col-span-7 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-medium text-secondary">
                        {copy.stepPrefix} {activeTest.order} {copy.ofText}{" "}
                        {SCREENING_TESTS.length}
                      </div>
                      <h2 className="text-xl font-semibold text-foreground mt-0.5">
                        {activeTestCopy.name}
                      </h2>
                    </div>

                    <div className="flex items-center gap-2">
                      {speechSupported && (
                        <button
                          type="button"
                          onClick={() => handleToggleSpeech(activeTestCopy)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground bg-surface-muted hover:bg-surface-hover border border-border rounded-sm"
                        >
                          {isSpeaking ? (
                            <>
                              <VolumeX size={14} strokeWidth={1.75} aria-hidden="true" />
                              <span>{copy.stopAudio}</span>
                            </>
                          ) : (
                            <>
                              <Volume2 size={14} strokeWidth={1.75} aria-hidden="true" />
                              <span>{copy.readAloud}</span>
                            </>
                          )}
                        </button>
                      )}
                      <span className="px-2 py-1 text-xs font-medium bg-surface-muted border border-border rounded-[3px] text-secondary">
                        {testStates[activeTest.id]?.completed
                          ? copy.completedBadge
                          : copy.inProgressBadge}
                      </span>
                    </div>
                  </div>

                  <p className="text-sm text-secondary">
                    {activeTestCopy.purpose}
                  </p>

                  <div className="p-3.5 bg-surface-muted/40 border border-border rounded-sm">
                    <h3 className="text-xs font-semibold text-foreground mb-2">
                      {copy.instructionsHeading}
                    </h3>
                    <ol className="list-decimal list-inside space-y-1.5 text-sm text-foreground">
                      {activeTestCopy.instructions.map((step, idx) => (
                        <li key={idx}>{step}</li>
                      ))}
                    </ol>
                  </div>

                  {speechError && (
                    <div
                      role="status"
                      className="px-3 py-2 text-xs bg-warning-bg text-warning-text border border-warning-border rounded-sm"
                    >
                      {speechError}
                    </div>
                  )}

                  {/* Large Touch-Friendly Controls */}
                  <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      {!timerRunning ? (
                        <button
                          type="button"
                          disabled={!selectedPatient}
                          onClick={handleStartTest}
                          className="min-h-12 inline-flex items-center gap-2 px-5 py-2.5 text-base font-medium bg-accent hover:bg-accent-hover text-accent-foreground rounded-sm"
                        >
                          <Play size={16} strokeWidth={1.75} aria-hidden="true" />
                          <span>{copy.startTest}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handlePauseTest}
                          className="min-h-12 inline-flex items-center gap-2 px-5 py-2.5 text-base font-medium text-foreground bg-surface-muted hover:bg-surface-hover border border-border rounded-sm"
                        >
                          <Pause size={16} strokeWidth={1.75} aria-hidden="true" />
                          <span>{copy.pauseTest}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={!selectedPatient}
                        onClick={handleResetTest}
                        className="min-h-12 inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-secondary hover:text-foreground bg-surface hover:bg-surface-muted border border-border rounded-sm"
                      >
                        <RotateCcw size={15} strokeWidth={1.75} aria-hidden="true" />
                        <span>{copy.resetTest}</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="min-h-12 flex items-center text-base font-mono font-semibold text-foreground px-3.5 bg-surface-muted border border-border rounded-sm">
                        {formatTimer(elapsedSec)}
                      </div>
                      <button
                        type="button"
                        disabled={!selectedPatient}
                        onClick={handleCompleteTest}
                        className="min-h-12 px-5 py-2.5 text-base font-medium text-foreground bg-surface hover:bg-surface-muted border border-border rounded-sm"
                      >
                        {activeStepIndex === SCREENING_TESTS.length - 1
                          ? copy.finishSummary
                          : copy.finishNext}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-5">
                  <MovementIllustration testId={activeTest.id} />
                </div>
              </div>

              {/* Simple Measurement Input for the Active Test */}
              <div className="px-5 py-3.5 bg-surface-muted/30 flex flex-col sm:flex-row sm:items-end gap-4">
                {activeTest.id === "walk_10m" && (
                  <div className="w-full sm:w-64">
                    <label
                      htmlFor="manual-walk-sec"
                      className="block text-xs font-medium text-secondary mb-1"
                    >
                      {activeTestCopy.timeInputLabel}
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
                      placeholder="Auto fills on Finish"
                      className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground"
                    />
                  </div>
                )}

                {activeTest.id === "sit_to_stand_5x" && (
                  <div className="w-full sm:w-64">
                    <label
                      htmlFor="manual-sts-sec"
                      className="block text-xs font-medium text-secondary mb-1"
                    >
                      {activeTestCopy.timeInputLabel}
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
                      placeholder="Auto fills on Finish"
                      className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground"
                    />
                  </div>
                )}

                {activeTest.id === "knee_bend_extend" && (
                  <>
                    <div className="w-full sm:w-56">
                      <label
                        htmlFor="manual-flexion-deg"
                        className="block text-xs font-medium text-secondary mb-1"
                      >
                        {activeTestCopy.flexionLabel}
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
                        placeholder="Optional"
                        className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground"
                      />
                    </div>
                    <div className="w-full sm:w-64">
                      <label
                        htmlFor="manual-ext-deg"
                        className="block text-xs font-medium text-secondary mb-1"
                      >
                        {activeTestCopy.extensionLabel}
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
                        placeholder="0"
                        className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Progressive Disclosure: Doctor View for Live Graphs & Raw Readings */}
              <div className="px-5 py-3.5">
                <button
                  type="button"
                  aria-expanded={showDoctorView}
                  onClick={() => setShowDoctorView((prev) => !prev)}
                  className="inline-flex items-center gap-2 text-sm font-medium text-link hover:underline"
                >
                  {showDoctorView ? (
                    <>
                      <ChevronUp size={16} strokeWidth={1.75} aria-hidden="true" />
                      <span>{copy.hideDoctorView}</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
                      <span>{copy.showDoctorView}</span>
                    </>
                  )}
                </button>

                {showDoctorView && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <SensorVisualisations
                      test={activeTest}
                      telemetry={telemetry}
                      insoleTelemetry={insoleTelemetry}
                    />
                  </div>
                )}
              </div>
            </section>
          ) : (
            <ScreeningSummaryStep
              lang={lang}
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
