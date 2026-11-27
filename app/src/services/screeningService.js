import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import api from "../config/api";
import { db, isFirebaseConfigured } from "../config/firebase";

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

export function evaluateClinicalScreening(measurements) {
  const painScore = Number(measurements.painScore) || 0;
  const flexionDeg = Number(measurements.flexionDeg) || 0;
  const extensionDeficitDeg = Number(measurements.extensionDeficitDeg) || 0;
  const morningStiffnessMin = Number(measurements.morningStiffnessMin) || 0;
  const referenceFlexion =
    measurements.jointType === "Shoulder"
      ? 165
      : measurements.jointType === "Hip"
        ? 120
        : measurements.jointType === "Ankle"
          ? 45
          : 135;

  const flexionRatio = referenceFlexion > 0 ? flexionDeg / referenceFlexion : 1;

  let points = 0;
  if (painScore >= 7) points += 3;
  else if (painScore >= 4) points += 2;
  else if (painScore >= 2) points += 1;

  if (flexionRatio < 0.65) points += 3;
  else if (flexionRatio < 0.82) points += 2;
  else if (flexionRatio < 0.92) points += 1;

  if (extensionDeficitDeg >= 10) points += 2;
  else if (extensionDeficitDeg >= 5) points += 1;

  if (morningStiffnessMin >= 45) points += 2;
  else if (morningStiffnessMin >= 20) points += 1;

  if (measurements.swellingPresent) points += 1;
  if (measurements.crepitusPresent) points += 1;
  if (measurements.instabilityReported) points += 2;

  const compositeIndex = Math.min(100, Math.round((points / 14) * 100));

  let riskLevel = "Normal";
  let summaryRecommendation =
    "Measurements fall within expected functional baseline. Continue routine self-monitoring and standard follow-up.";

  if (compositeIndex >= 60) {
    riskLevel = "Elevated Risk";
    summaryRecommendation =
      "Significant range-of-motion limitation or symptom burden observed. Recommend diagnostic imaging correlation and specialist physical exam.";
  } else if (compositeIndex >= 30) {
    riskLevel = "Monitor";
    summaryRecommendation =
      "Moderate mechanical or symptomatic indicators present. Schedule targeted physiotherapy assessment and re-screen in 4–6 weeks.";
  }

  return {
    compositeIndex,
    riskLevel,
    referenceFlexion,
    summaryRecommendation,
    source: "Clinical Baseline Rubric",
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

export async function createScreening(doctorId, screeningData) {
  ensureFirestore();

  const baselineAssessment = evaluateClinicalScreening(screeningData);
  const assessment = screeningData.externalAnalysis || baselineAssessment;

  const payload = {
    doctorId,
    patientId: screeningData.patientId,
    patientName: screeningData.patientName,
    patientMrn: screeningData.patientMrn,
    jointType: screeningData.jointType,
    side: screeningData.side,
    painScore: Number(screeningData.painScore),
    flexionDeg: Number(screeningData.flexionDeg),
    extensionDeficitDeg: Number(screeningData.extensionDeficitDeg),
    contralateralFlexionDeg:
      screeningData.contralateralFlexionDeg !== ""
        ? Number(screeningData.contralateralFlexionDeg)
        : null,
    morningStiffnessMin: Number(screeningData.morningStiffnessMin),
    swellingPresent: Boolean(screeningData.swellingPresent),
    crepitusPresent: Boolean(screeningData.crepitusPresent),
    instabilityReported: Boolean(screeningData.instabilityReported),
    gaitStatus: screeningData.gaitStatus || "Unassisted",
    clinicalObservations: screeningData.clinicalObservations?.trim() || "",
    compositeIndex: assessment.compositeIndex,
    riskLevel: assessment.riskLevel,
    referenceFlexion: assessment.referenceFlexion ?? baselineAssessment.referenceFlexion,
    recommendation: assessment.summaryRecommendation,
    analysisSource: assessment.source || "Clinical Baseline Rubric",
    reviewStatus: "Pending Review",
    clinicianNotes: "",
    followUpPlan: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, SCREENINGS_COLLECTION), payload);

  if (screeningData.patientId) {
    await updateDoc(doc(db, PATIENTS_COLLECTION, screeningData.patientId), {
      lastScreeningAt: serverTimestamp(),
      lastRiskLevel: payload.riskLevel,
      lastJointScreened: `${payload.side} ${payload.jointType}`,
      screeningCount: increment(1),
      updatedAt: serverTimestamp(),
    });
  }

  return docRef.id;
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
