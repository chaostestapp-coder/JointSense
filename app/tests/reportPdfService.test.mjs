import test from "node:test";
import assert from "node:assert/strict";
import { generateScreeningReportPdf } from "../src/services/reportPdfService.js";

test("Generates a valid PDF blob from saved screening, patient, and doctor records", async () => {
  const { blob, fileName } = generateScreeningReportPdf({
    screening: {
      id: "scr_test_123456",
      patientId: "pat_1",
      patientName: "Asha Verma",
      patientMrn: "JS-104",
      jointType: "Knee",
      side: "Right",
      walkSpeedMps: 1.06,
      walkDurationSec: 9.4,
      sitToStandSec: 13.2,
      flexionDeg: 118,
      extensionDeficitDeg: 2,
      painScore: 4,
      morningStiffnessMin: 15,
      swellingPresent: false,
      crepitusPresent: true,
      instabilityReported: false,
      gaitStatus: "Unassisted",
      riskLevel: "Normal",
      flaggedCount: 0,
      evaluatedCount: 6,
      recommendation:
        "Recorded screening thresholds are within expected functional limits.",
      analysisSource: "Threshold Screening Rubric (v1 — Pre-ML)",
      clinicalObservations: "Smooth knee excursion with mild crepitus.",
      clinicianNotes: "Continue home strengthening.",
      followUpPlan: "Routine review in 8 weeks.",
      reviewStatus: "Reviewed",
      createdAt: new Date("2026-11-27T10:00:00Z"),
      guidedTests: {
        walk_10m: { completed: true, elapsedSec: 9.4 },
        sit_to_stand_5x: { completed: true, elapsedSec: 13.2 },
        knee_bend_extend: {
          completed: true,
          elapsedSec: 11.0,
          sensorSnapshot: {
            sourceType: "firebase_rtdb",
            rtdbPath: "/knee_sleeve/live",
            processed: {
              kneeAngleDeg: 59.1,
              walkingSpeedMs: 1.06,
              steps: 9,
              vibration: { rms: 0, peak: 0, spikes: 0 },
            },
            rawImu: {
              acc: { x: -2, y: 1.02, z: 1.42 },
              gyro: { x: 30.2, y: 29.4, z: -55.2 },
            },
            timing: { esp32Timestamp: 126799, receivedAtMs: 1700000000000 },
          },
        },
      },
    },
    patient: {
      dateOfBirth: "1968-05-14",
      sex: "Female",
    },
    doctor: {
      fullName: "Dr. Priya Nair",
      department: "Outpatient Musculoskeletal Clinic",
      specialty: "Orthopedics",
    },
  });

  assert.equal(fileName, "JointSense_JS-104_scr_test.pdf");
  assert.ok(blob.size > 1000);
  const header = await blob.slice(0, 5).text();
  assert.equal(header, "%PDF-");
});
