/**
 * IndexedDB-backed offline queue for screening records.
 *
 * Uses a deterministic `clientMutationId` per screening record so repeated sync
 * attempts are idempotent in Firestore and never create duplicate records.
 */

const DB_NAME = "jointsense_offline_db";
const DB_VERSION = 1;
const STORE_NAME = "pending_screenings";

function openOfflineDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable in this browser."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: "clientMutationId",
        });
        store.createIndex("doctorId", "doctorId", { unique: false });
        store.createIndex("syncStatus", "syncStatus", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("Failed to open offline storage."));
  });
}

export function generateClientMutationId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `scr_${crypto.randomUUID()}`;
  }
  return `scr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function queueOfflineScreening(doctorId, screeningData) {
  const db = await openOfflineDb();
  const clientMutationId =
    screeningData.clientMutationId || generateClientMutationId();

  const record = {
    clientMutationId,
    doctorId,
    payload: { ...screeningData, clientMutationId },
    syncStatus: "pending", // "pending" | "failed"
    retryCount: 0,
    lastError: "",
    queuedAt: new Date().toISOString(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = () =>
      reject(tx.error || new Error("Failed to queue screening offline."));
  });
}

export async function getPendingScreenings(doctorId) {
  if (typeof indexedDB === "undefined") return [];
  const db = await openOfflineDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = doctorId
      ? store.index("doctorId").getAll(doctorId)
      : store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () =>
      reject(request.error || new Error("Failed to read offline queue."));
  });
}

export async function updateQueuedScreeningStatus(
  clientMutationId,
  { syncStatus, lastError = "", retryCount }
) {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(clientMutationId);

    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (!existing) {
        resolve();
        return;
      }
      store.put({
        ...existing,
        syncStatus,
        lastError,
        retryCount: retryCount ?? existing.retryCount + 1,
      });
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function removePendingScreening(clientMutationId) {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(clientMutationId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
