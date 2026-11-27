import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "../config/firebase";

const PATIENTS_COLLECTION = "patients";

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
  const payload = {
    doctorId,
    mrn: patientData.mrn.trim(),
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

  const docRef = await withFirestoreTimeout(
    addDoc(collection(db, PATIENTS_COLLECTION), payload),
    "save patient record"
  );
  return docRef.id;
}

export async function updatePatient(patientId, updates) {
  ensureFirestore();
  const patientRef = doc(db, PATIENTS_COLLECTION, patientId);
  await withFirestoreTimeout(
    updateDoc(patientRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    }),
    "update patient record"
  );
}

export async function deletePatient(patientId) {
  ensureFirestore();
  await withFirestoreTimeout(
    deleteDoc(doc(db, PATIENTS_COLLECTION, patientId)),
    "delete patient record"
  );
}
