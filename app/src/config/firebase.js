import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const env = import.meta.env || {};

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL || undefined,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

export const isRtdbConfigured = Boolean(
  isFirebaseConfigured && firebaseConfig.databaseURL
);

export const isStorageConfigured = Boolean(
  isFirebaseConfigured && firebaseConfig.storageBucket
);

let firebaseApp = null;
let auth = null;
let db = null;
let rtdb = null;
let storage = null;

if (isFirebaseConfigured) {
  const existingApps = getApps();
  if (existingApps.length > 0) {
    firebaseApp = getApp();
    db = getFirestore(firebaseApp);
  } else {
    firebaseApp = initializeApp(firebaseConfig);
    db = initializeFirestore(firebaseApp, {
      experimentalAutoDetectLongPolling: true,
    });
  }
  auth = getAuth(firebaseApp);
  if (firebaseConfig.databaseURL) {
    rtdb = getDatabase(firebaseApp, firebaseConfig.databaseURL);
  }
  if (firebaseConfig.storageBucket) {
    storage = getStorage(firebaseApp);
  }
}

export { firebaseApp, auth, db, rtdb, storage };
