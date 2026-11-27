import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import api from "../config/api";
import { db, isFirebaseConfigured } from "../config/firebase";
import {
  generateClientMutationId,
  getPendingScreenings,
  queueOfflineScreening,
  removePendingScreening,
  updateQueuedScreeningStatus,
} from "./offlineSyncService";

const SCREENINGS_COLLECTION = "screenings";
const PATIENTS_COLLECTION = "patients";
const EXTERNAL_SCREENING_ENDPOINT = import.meta.env.VITE_SCREENING_ENDPOINT || "";

export const isExternalScreeningApiConfigured = Boolean(
  EXTERNAL_SCREENING_ENDPOINT &&
    (EXTERNAL_SCREENING_ENDPOINT.startsWith("http") ||
      Boolean(import.meta.env.VITE_API_BASE_URL))
);

function ensureFirestore() {
  if (!isFirebaseConfigured || !db) {
    throw new Error(
      "Firestore is not configured. Add your VITE_FIREBASE_* keys to app/.env."
    );
  }
}

function sortByNewest(records) {
  return [...records].sort((a, b) => {
    const aTime = a.createdAt?.toMillis?.() ?? a.updatedAt?.toMillis?.() ?? 0;
    const bTime = b.createdAt?.toMillis?.() ?? b.updatedAt?.toMillis?.() ?? 0;
    return bTime - aTime;
  });
}

/**
 * Explicit, documented threshold-based screening rubric (no fabricated ML probabilities).
 * Evaluates only measurements that were actually provided.
 */
export function evaluateClinicalScreening(measurements) {
  const jointType = measurements.jointType || "Knee";
  const referenceFlexion =
    jointType === "Shoulder"
      ? 165
      : jointType === "Hip"
        ? 120
        : jointType === "Ankle"
          ? 45
          : 135;

  const thresholds = [];
  let availableMetricsCount = 0;

  const walkSpeed =
    measurements.walkSpeedMps !== "" && measurements.walkSpeedMps != null
      ? Number(measurements.walkSpeedMps)
      : null;
  if (walkSpeed !== null && !Number.isNaN(walkSpeed)) {
    availableMetricsCount += 1;
    thresholds.push({
      metric: "10m Walk Speed",
      value: `${walkSpeed.toFixed(2)} m/s`,
      threshold: ">= 1.00 m/s",
      flagged: walkSpeed < 1.0,
    });
  }

  const sitStandSec =
    measurements.sitToStandSec !== "" && measurements.sitToStandSec != null
      ? Number(measurements.sitToStandSec)
      : null;
  if (sitStandSec !== null && !Number.isNaN(sitStandSec)) {
    availableMetricsCount += 1;
    thresholds.push({
      metric: "5x Sit-to-Stand Time",
      value: `${sitStandSec.toFixed(1)} s`,
      threshold: "<= 15.0 s",
      flagged: sitStandSec > 15.0,
    });
  }

  const flexionDeg =
    measurements.flexionDeg !== "" && measurements.flexionDeg != null
      ? Number(measurements.flexionDeg)
      : null;
  if (flexionDeg !== null && !Number.isNaN(flexionDeg)) {
    availableMetricsCount += 1;
    const flexionThreshold = jointType === "Knee" ? 110 : Math.round(referenceFlexion * 0.8);
    thresholds.push({
      metric: "Active Flexion ROM",
      value: `${flexionDeg}°`,
      threshold: `>= ${flexionThreshold}°`,
      flagged: flexionDeg < flexionThreshold,
    });
  }

  const extensionDeficitDeg =
    measurements.extensionDeficitDeg !== "" &&
    measurements.extensionDeficitDeg != null
      ? Number(measurements.extensionDeficitDeg)
      : null;
  if (extensionDeficitDeg !== null && !Number.isNaN(extensionDeficitDeg)) {
    availableMetricsCount += 1;
    thresholds.push({
      metric: "Extension Deficit",
      value: `${extensionDeficitDeg}°`,
      threshold: "< 10°",
      flagged: extensionDeficitDeg >= 10,
    });
  }

  const painScore =
    measurements.painScore !== "" && measurements.painScore != null
      ? Number(measurements.painScore)
      : null;
  if (painScore !== null && !Number.isNaN(painScore)) {
    availableMetricsCount += 1;
    thresholds.push({
      metric: "Pain Score (VAS)",
      value: `${painScore}/10`,
      threshold: "< 5/10",
      flagged: painScore >= 5,
    });
  }

  const morningStiffnessMin =
    measurements.morningStiffnessMin !== "" &&
    measurements.morningStiffnessMin != null
      ? Number(measurements.morningStiffnessMin)
      : null;
  if (morningStiffnessMin !== null && !Number.isNaN(morningStiffnessMin)) {
    availableMetricsCount += 1;
    thresholds.push({
      metric: "Morning Stiffness",
      value: `${morningStiffnessMin} min`,
      threshold: "< 30 min",
      flagged: morningStiffnessMin >= 30,
    });
  }

  const symptomFlags = [
    measurements.swellingPresent ? "Effusion / swelling" : null,
    measurements.crepitusPresent ? "Crepitus" : null,
    measurements.instabilityReported ? "Instability" : null,
  ].filter(Boolean);

  if (symptomFlags.length > 0) {
    thresholds.push({
      metric: "Physical Exam Signs",
      value: symptomFlags.join(", "),
      threshold: "Absent",
      flagged: symptomFlags.length >= 2 || Boolean(measurements.instabilityReported),
    });
  }

  const flaggedCount = thresholds.filter((item) => item.flagged).length;

  let riskLevel = "Normal";
  let summaryRecommendation =
    "Recorded screening thresholds are within expected functional limits. Continue routine clinical follow-up as indicated.";

  if (availableMetricsCount === 0 && symptomFlags.length === 0) {
    riskLevel = "Pending Review";
    summaryRecommendation =
      "No quantitative measurements recorded yet. Complete the guided tests or enter clinical measurements to evaluate screening thresholds.";
  } else if (flaggedCount >= 3 || (painScore !== null && painScore >= 7)) {
    riskLevel = "Elevated Risk";
    summaryRecommendation =
      "Multiple functional or symptomatic screening thresholds exceeded. Consider clinical examination and imaging correlation. (Screening aid only; not a diagnostic result.)";
  } else if (flaggedCount >= 1) {
    riskLevel = "Monitor";
    summaryRecommendation =
      "One or more screening thresholds flagged. Recommend targeted physiotherapy review and repeat screening at follow-up. (Screening aid only; not a diagnostic result.)";
  }

  return {
    riskLevel,
    flaggedCount,
    evaluatedCount: thresholds.length,
    thresholds,
    referenceFlexion,
    summaryRecommendation,
    source: "Threshold Screening Rubric (v1 — Pre-ML)",
    mlModelIntegrated: false,
  };
}

export async function requestExternalScreeningAnalysis(payload) {
  if (!isExternalScreeningApiConfigured) {
    throw new Error(
      "No external screening endpoint is configured. Set VITE_API_BASE_URL and VITE_SCREENING_ENDPOINT in app/.env."
    );
  }
  const response = await api.post(EXTERNAL_SCREENING_ENDPOINT, payload);
  return response.data;
}

export function subscribeToScreenings(doctorId, onData, onError) {
  if (!isFirebaseConfigured || !db || !doctorId) {
    onData([]);
    return () => {};
  }

  const screeningsQuery = query(
    collection(db, SCREENINGS_COLLECTION),
    where("doctorId", "==", doctorId)
  );

  return onSnapshot(
    screeningsQuery,
    (snapshot) => {
      const items = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      onData(sortByNewest(items));
    },
    (error) => {
      if (onError) onError(error);
    }
  );
}

export function subscribeToPatientScreenings(patientId, doctorId, onData, onError) {
  if (!isFirebaseConfigured || !db || !patientId || !doctorId) {
    onData([]);
    return () => {};
  }

  const patientScreeningsQuery = query(
    collection(db, SCREENINGS_COLLECTION),
    where("doctorId", "==", doctorId),
    where("patientId", "==", patientId)
  );

  return onSnapshot(
    patientScreeningsQuery,
    (snapshot) => {
      const items = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      onData(sortByNewest(items));
    },
    (error) => {
      if (onError) onError(error);
    }
  );
}

export function subscribeToScreening(screeningId, onData, onError) {
  if (!isFirebaseConfigured || !db || !screeningId) {
    onData(null);
    return () => {};
  }

  return onSnapshot(
    doc(db, SCREENINGS_COLLECTION, screeningId),
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null);
        return;
      }
      onData({ id: snapshot.id, ...snapshot.data() });
    },
    (error) => {
      if (onError) onError(error);
    }
  );
}

export async function getScreeningById(screeningId) {
  ensureFirestore();
  const snapshot = await getDoc(doc(db, SCREENINGS_COLLECTION, screeningId));
  if (!snapshot.exists()) {
    return null;
  }
  return { id: snapshot.id, ...snapshot.data() };
}

/**
 * Strips any synthetic demonstration telemetry so demo values can never be saved
 * into Firestore or offline storage as real patient measurements.
 */
function sanitizeTestResultsForStorage(tests = {}) {
  const sanitized = {};
  Object.entries(tests).forEach(([testId, entry]) => {
    if (!entry) return;
    const isDemo = Boolean(entry.telemetry?.isDemoData);
    sanitized[testId] = {
      completed: Boolean(entry.completed),
      elapsedSec:
        entry.elapsedSec != null ? Number(entry.elapsedSec) : null,
      notes: entry.notes?.trim() || "",
      manualValues: entry.manualValues || {},
      sensorSnapshot:
        !isDemo &&
        entry.telemetry?.sourceType === "firebase_rtdb" &&
        entry.telemetry?.timing?.receivedAtMs
          ? {
              sourceType: entry.telemetry.sourceType,
              rtdbPath: entry.telemetry.rtdbPath || null,
              isStaleAtCapture: Boolean(entry.telemetry.isStale),
              processed: entry.telemetry.processed || null,
              rawImu: entry.telemetry.rawImu || null,
              timing: entry.telemetry.timing || null,
            }
          : null,
      excludedDemoPreview: isDemo,
    };
  });
  return sanitized;
}

export async function createScreening(doctorId, screeningData) {
  ensureFirestore();

  const clientMutationId =
    screeningData.clientMutationId || generateClientMutationId();
  const baselineAssessment = evaluateClinicalScreening(screeningData);
  const assessment = screeningData.externalAnalysis || baselineAssessment;

  const toNumberOrNull = (val) =>
    val !== "" && val != null && !Number.isNaN(Number(val)) ? Number(val) : null;

  const payload = {
    clientMutationId,
    doctorId,
    patientId: screeningData.patientId,
    patientName: screeningData.patientName,
    patientMrn: screeningData.patientMrn,
    jointType: screeningData.jointType || "Knee",
    side: screeningData.side || "Right",
    painScore: toNumberOrNull(screeningData.painScore),
    flexionDeg: toNumberOrNull(screeningData.flexionDeg),
    extensionDeficitDeg: toNumberOrNull(screeningData.extensionDeficitDeg),
    contralateralFlexionDeg: toNumberOrNull(screeningData.contralateralFlexionDeg),
    morningStiffnessMin: toNumberOrNull(screeningData.morningStiffnessMin),
    walkSpeedMps: toNumberOrNull(screeningData.walkSpeedMps),
    walkDurationSec: toNumberOrNull(screeningData.walkDurationSec),
    sitToStandSec: toNumberOrNull(screeningData.sitToStandSec),
    swellingPresent: Boolean(screeningData.swellingPresent),
    crepitusPresent: Boolean(screeningData.crepitusPresent),
    instabilityReported: Boolean(screeningData.instabilityReported),
    gaitStatus: screeningData.gaitStatus || "Unassisted",
    clinicalObservations: screeningData.clinicalObservations?.trim() || "",
    guidedTests: sanitizeTestResultsForStorage(screeningData.guidedTests),
    riskLevel: assessment.riskLevel,
    flaggedCount: assessment.flaggedCount ?? 0,
    evaluatedCount: assessment.evaluatedCount ?? 0,
    thresholds: assessment.thresholds || [],
    referenceFlexion:
      assessment.referenceFlexion ?? baselineAssessment.referenceFlexion,
    recommendation: assessment.summaryRecommendation,
    analysisSource: assessment.source || "Threshold Screening Rubric (v1 — Pre-ML)",
    mlModelIntegrated: false,
    mlAssessment: null,
    reviewStatus: "Pending Review",
    clinicianNotes: "",
    followUpPlan: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // Idempotent transaction prevents duplicates on offline sync retries
  const screeningRef = doc(db, SCREENINGS_COLLECTION, clientMutationId);
  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(screeningRef);
    if (existing.exists()) {
      return;
    }
    transaction.set(screeningRef, payload);

    if (screeningData.patientId) {
      const patientRef = doc(db, PATIENTS_COLLECTION, screeningData.patientId);
      const patientSnap = await transaction.get(patientRef);
      if (patientSnap.exists()) {
        const currentCount = Number(patientSnap.data().screeningCount || 0);
        transaction.update(patientRef, {
          lastScreeningAt: serverTimestamp(),
          lastRiskLevel: payload.riskLevel,
          lastJointScreened: `${payload.side} ${payload.jointType}`,
          screeningCount: currentCount + 1,
          updatedAt: serverTimestamp(),
        });
      }
    }
  });

  return clientMutationId;
}

export async function saveScreeningWithOfflineFallback(doctorId, screeningData) {
  const isOffline =
    typeof navigator !== "undefined" && navigator.onLine === false;

  if (isOffline || !isFirebaseConfigured) {
    const queued = await queueOfflineScreening(doctorId, screeningData);
    return {
      mode: "offline_queued",
      id: queued.clientMutationId,
    };
  }

  try {
    const id = await createScreening(doctorId, screeningData);
    return { mode: "synced", id };
  } catch (err) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      const queued = await queueOfflineScreening(doctorId, screeningData);
      return {
        mode: "offline_queued",
        id: queued.clientMutationId,
      };
    }
    throw err;
  }
}

export async function syncQueuedScreenings(doctorId) {
  if (
    !isFirebaseConfigured ||
    !db ||
    !doctorId ||
    (typeof navigator !== "undefined" && !navigator.onLine)
  ) {
    return { synced: 0, failed: 0 };
  }

  const pending = await getPendingScreenings(doctorId);
  let synced = 0;
  let failed = 0;

  for (const item of pending) {
    try {
      await createScreening(doctorId, item.payload);
      await removePendingScreening(item.clientMutationId);
      synced += 1;
    } catch (err) {
      failed += 1;
      await updateQueuedScreeningStatus(item.clientMutationId, {
        syncStatus: "failed",
        lastError: err?.message || "Sync failed",
      });
    }
  }

  return { synced, failed };
}

export async function updateScreeningReview(screeningId, reviewData) {
  ensureFirestore();
  await updateDoc(doc(db, SCREENINGS_COLLECTION, screeningId), {
    reviewStatus: reviewData.reviewStatus,
    clinicianNotes: reviewData.clinicianNotes?.trim() || "",
    followUpPlan: reviewData.followUpPlan?.trim() || "",
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
