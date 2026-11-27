import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "../config/firebase";

const DOCTORS_COLLECTION = "doctors";

function ensureFirebaseAuth() {
  if (!isFirebaseConfigured || !auth || !db) {
    throw new Error(
      "Firebase is not configured. Add your VITE_FIREBASE_* keys to app/.env to enable authentication."
    );
  }
}

function formatAuthError(error) {
  const code = error?.code || "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Invalid email address or password.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/email-already-in-use":
      return "An account with this email address already exists.";
    case "auth/weak-password":
      return "Password must be at least 6 characters long.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a moment before trying again.";
    case "auth/operation-not-allowed":
    case "auth/configuration-not-found":
      return "Email/Password sign-in is not enabled in Firebase Console (Authentication -> Sign-in method -> Email/Password).";
    case "permission-denied":
      return "Firestore permission denied. Create your Firestore database and update its Security Rules (see app/firestore.rules).";
    case "auth/network-request-failed":
      return "Network error while contacting Firebase Authentication.";
    default:
      return error?.message || "Authentication failed.";
  }
}

export async function signInClinician(email, password) {
  ensureFirebaseAuth();
  try {
    const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
    return credential.user;
  } catch (error) {
    throw new Error(formatAuthError(error));
  }
}

export async function registerClinician({
  email,
  password,
  fullName,
  specialty = "Orthopedics & Joint Screening",
  department = "Outpatient Musculoskeletal Clinic",
  licenseId = "",
}) {
  ensureFirebaseAuth();
  try {
    const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const trimmedName = fullName.trim();

    if (trimmedName) {
      await updateProfile(credential.user, { displayName: trimmedName });
    }

    await setDoc(doc(db, DOCTORS_COLLECTION, credential.user.uid), {
      uid: credential.user.uid,
      email: credential.user.email,
      fullName: trimmedName || credential.user.email,
      specialty: specialty.trim(),
      department: department.trim(),
      licenseId: licenseId.trim(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return credential.user;
  } catch (error) {
    throw new Error(formatAuthError(error));
  }
}

export async function sendClinicianPasswordReset(email) {
  ensureFirebaseAuth();
  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (error) {
    throw new Error(formatAuthError(error));
  }
}

export async function signOutClinician() {
  if (!auth) return;
  await signOut(auth);
}

export async function getClinicianProfile(uid) {
  ensureFirebaseAuth();
  const snapshot = await getDoc(doc(db, DOCTORS_COLLECTION, uid));
  if (!snapshot.exists()) {
    return null;
  }
  return { id: snapshot.id, ...snapshot.data() };
}

export function subscribeToAuthState(callback) {
  if (!isFirebaseConfigured || !auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}
