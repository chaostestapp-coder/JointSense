import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { getBlob, ref, uploadBytes } from "firebase/storage";
import {
  db,
  isFirebaseConfigured,
  isStorageConfigured,
  storage,
} from "../config/firebase";
import {
  buildReportFileName,
  generateScreeningReportPdf,
} from "./reportPdfService";

const SCREENINGS_COLLECTION = "screenings";

export function buildReportStoragePath(patientId, screeningId) {
  return `screening-reports/${patientId}/${screeningId}.pdf`;
}

export function triggerPdfDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatStorageError(error) {
  const code = String(error?.code || "").toLowerCase();
  if (code.includes("storage/unauthorized")) {
    return "Firebase Storage permission denied. Publish app/storage.rules in Firebase Console -> Storage -> Rules.";
  }
  if (code.includes("storage/object-not-found")) {
    return "Stored PDF file was not found in Firebase Storage. Try regenerating the report.";
  }
  if (code.includes("storage/bucket-not-found")) {
    return "Firebase Storage bucket is not enabled. Enable Storage in Firebase Console -> Storage -> Get started.";
  }
  return (
    error?.message ||
    "Firebase Storage operation failed. Verify Storage is enabled and rules are published."
  );
}

export async function uploadScreeningReportPdf(screening, pdfBlob, fileName) {
  if (!isStorageConfigured || !storage || !isFirebaseConfigured || !db) {
    throw new Error(
      "Firebase Storage is not configured. Verify VITE_FIREBASE_STORAGE_BUCKET in app/.env and enable Storage in Firebase Console."
    );
  }
  if (!screening?.id || !screening?.patientId) {
    throw new Error("Screening ID and patient ID are required to store report.");
  }

  const storagePath = buildReportStoragePath(screening.patientId, screening.id);
  const storageRef = ref(storage, storagePath);

  try {
    await uploadBytes(storageRef, pdfBlob, {
      contentType: "application/pdf",
      customMetadata: {
        patientId: screening.patientId,
        screeningId: screening.id,
      },
    });
  } catch (error) {
    throw new Error(formatStorageError(error));
  }

  const reportMetadata = {
    storagePath,
    fileName,
    generatedAt: serverTimestamp(),
    status: "available",
  };

  await updateDoc(doc(db, SCREENINGS_COLLECTION, screening.id), {
    report: reportMetadata,
    updatedAt: serverTimestamp(),
  });

  return reportMetadata;
}

export async function downloadStoredReportPdf(storagePath, fileName) {
  if (!isStorageConfigured || !storage) {
    throw new Error(
      "Firebase Storage is not configured. Verify VITE_FIREBASE_STORAGE_BUCKET in app/.env."
    );
  }
  try {
    const blob = await getBlob(ref(storage, storagePath));
    triggerPdfDownload(blob, fileName || "JointSense_Report.pdf");
    return blob;
  } catch (error) {
    throw new Error(formatStorageError(error));
  }
}

export async function getOrCreateScreeningReportPdf({
  screening,
  patient = null,
  doctor = null,
  forceRegenerate = false,
}) {
  const existing = screening?.report;
  if (
    !forceRegenerate &&
    existing?.status === "available" &&
    existing?.storagePath
  ) {
    await downloadStoredReportPdf(
      existing.storagePath,
      existing.fileName || buildReportFileName(screening)
    );
    return { mode: "downloaded_existing", storagePath: existing.storagePath };
  }

  const { blob, fileName } = generateScreeningReportPdf({
    screening,
    patient,
    doctor,
  });

  const metadata = await uploadScreeningReportPdf(screening, blob, fileName);
  triggerPdfDownload(blob, fileName);
  return { mode: "generated_and_uploaded", storagePath: metadata.storagePath };
}
