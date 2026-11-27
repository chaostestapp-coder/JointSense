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
import { db, isFirebaseConfigured } from "../config/firebase";

const PATIENTS_COLLECTION = "patients";
const PATIENT_MRNS_COLLECTION = "patientMrns";

function normalizeMrnKey(mrn) {
  return String(mrn || "")
    .trim()
    .toUpperCase()
    .replace(/\//g, "_");
}

function ensureFirestore() {
  if (!isFirebaseConfigured || !db) {
    throw new Error(
      "Firestore is not configured. Add your VITE_FIREBASE_* keys to app/.env."
    );
  }
}

function withFirestoreTimeout(promise, actionLabel = "save to Firestore") {
  const timeoutMs = 8000;
  let timerId;
  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      reject(
        new Error(
          `Timed out trying to ${actionLabel}. Verify that Cloud Firestore (not only Realtime Database) is created in Firebase Console, rules are published, and browser shields are not blocking firestore.googleapis.com.`
        )
      );
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timerId);
  });
}

function sortByNewest(records) {
  return [...records].sort((a, b) => {
    const aTime = a.updatedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0;
    const bTime = b.updatedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0;
    return bTime - aTime;
  });
}

export function subscribeToPatients(doctorId, onData, onError) {
  if (!isFirebaseConfigured || !db || !doctorId) {
    onData([]);
    return () => {};
  }

  const patientsQuery = query(
    collection(db, PATIENTS_COLLECTION),
    where("doctorId", "==", doctorId)
  );

  return onSnapshot(
    patientsQuery,
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

export function subscribeToPatient(patientId, onData, onError) {
  if (!isFirebaseConfigured || !db || !patientId) {
    onData(null);
    return () => {};
  }

  const patientRef = doc(db, PATIENTS_COLLECTION, patientId);
  return onSnapshot(
    patientRef,
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

export async function getPatientById(patientId) {
  ensureFirestore();
  const snapshot = await getDoc(doc(db, PATIENTS_COLLECTION, patientId));
  if (!snapshot.exists()) {
    return null;
  }
  return { id: snapshot.id, ...snapshot.data() };
}

export async function createPatient(doctorId, patientData) {
  ensureFirestore();
  const trimmedMrn = patientData.mrn.trim();
  const mrnKey = normalizeMrnKey(trimmedMrn);
  if (!mrnKey) {
    throw new Error("Medical Record Number (MRN) is required.");
  }

  const patientRef = doc(collection(db, PATIENTS_COLLECTION));
  const mrnRef = doc(db, PATIENT_MRNS_COLLECTION, mrnKey);

  const payload = {
    doctorId,
    mrn: trimmedMrn,
    mrnNormalized: mrnKey,
    fullName: patientData.fullName.trim(),
    dateOfBirth: patientData.dateOfBirth,
    sex: patientData.sex,
    phone: patientData.phone.trim(),
    email: patientData.email?.trim() || "",
    primaryJoint: patientData.primaryJoint,
    affectedSide: patientData.affectedSide || "Right",
    status: patientData.status || "Active",
    clinicalNotes: patientData.clinicalNotes?.trim() || "",
    lastScreeningAt: null,
    lastRiskLevel: null,
    lastJointScreened: null,
    screeningCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await withFirestoreTimeout(
    runTransaction(db, async (transaction) => {
      const existingMrn = await transaction.get(mrnRef);
      if (existingMrn.exists()) {
        throw new Error(
          `A patient with MRN "${trimmedMrn}" is already registered.`
        );
      }
      transaction.set(mrnRef, {
        doctorId,
        patientId: patientRef.id,
        mrn: trimmedMrn,
        createdAt: serverTimestamp(),
      });
      transaction.set(patientRef, payload);
    }),
    "save patient record"
  );

  return patientRef.id;
}

export async function updatePatient(patientId, updates) {
  ensureFirestore();
  const patientRef = doc(db, PATIENTS_COLLECTION, patientId);
  const { mrn: _ignoredMrn, mrnNormalized: _ignoredNorm, ...safeUpdates } = updates;
  await withFirestoreTimeout(
    updateDoc(patientRef, {
      ...safeUpdates,
      updatedAt: serverTimestamp(),
    }),
    "update patient record"
  );
}

export async function deletePatient(patientId) {
  ensureFirestore();
  const patientRef = doc(db, PATIENTS_COLLECTION, patientId);
  await withFirestoreTimeout(
    runTransaction(db, async (transaction) => {
      const patientSnap = await transaction.get(patientRef);
      if (!patientSnap.exists()) return;
      const mrnKey =
        patientSnap.data().mrnNormalized ||
        normalizeMrnKey(patientSnap.data().mrn);
      if (mrnKey) {
        const mrnRef = doc(db, PATIENT_MRNS_COLLECTION, mrnKey);
        const mrnSnap = await transaction.get(mrnRef);
        if (mrnSnap.exists() && mrnSnap.data().patientId === patientId) {
          transaction.delete(mrnRef);
        }
      }
      transaction.delete(patientRef);
    }),
    "delete patient record"
  );
}
