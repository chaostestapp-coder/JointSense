import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { SCREENING_TESTS } from "./transports/screeningSchema.js";
import { calculateAge, formatClinicalDateTime } from "../utils/formatters.js";

function formatNumberOrFallback(val, unit = "") {
  if (val === null || val === undefined || val === "") return "Not recorded";
  const num = Number(val);
  if (Number.isNaN(num)) return "Not recorded";
  return unit ? `${num} ${unit}` : String(num);
}

function getLatestKneeSnapshot(guidedTests) {
  if (!guidedTests) return null;
  const order = ["knee_bend_extend", "sit_to_stand_5x", "walk_10m"];
  for (const id of order) {
    const snap = guidedTests[id]?.sensorSnapshot;
    if (snap && snap.processed) {
      return { testId: id, ...snap };
    }
  }
  return null;
}

function getLatestInsoleSnapshot(guidedTests) {
  if (!guidedTests) return null;
  const order = ["walk_10m", "sit_to_stand_5x", "knee_bend_extend"];
  for (const id of order) {
    const snap = guidedTests[id]?.insoleSnapshot;
    if (snap) {
      return { testId: id, ...snap };
    }
  }
  return null;
}

export function buildReportFileName(screening) {
  const safeMrn = String(screening?.patientMrn || "Report")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_");
  const shortId = String(screening?.id || "screening").slice(0, 8);
  return `JointSense_${safeMrn}_${shortId}.pdf`;
}

/**
 * Generates a formatted JointSense clinical screening PDF strictly from
 * saved Firestore records (screening, optional patient, optional doctor).
 */
export function generateScreeningReportPdf({
  screening,
  patient = null,
  doctor = null,
}) {
  if (!screening) {
    throw new Error("Cannot generate report: screening record is missing.");
  }

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(15, 94, 89);
  doc.text("JointSense", margin, 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(20, 28, 30);
  doc.text("Clinical Joint Screening Report", margin, 22);

  doc.setFontSize(8.5);
  doc.setTextColor(100, 115, 119);
  doc.text(`Report ID: ${screening.id}`, pageWidth - margin, 16, {
    align: "right",
  });
  doc.text(
    `Recorded: ${formatClinicalDateTime(screening.createdAt)}`,
    pageWidth - margin,
    21,
    { align: "right" }
  );

  doc.setDrawColor(212, 222, 218);
  doc.line(margin, 25, pageWidth - margin, 25);

  // Patient & Clinician Details
  const age = patient?.dateOfBirth ? calculateAge(patient.dateOfBirth) : null;
  const doctorInfo = doctor || screening.doctorSnapshot || {};
  const clinicianName =
    doctorInfo.fullName || screening.doctorName || "Not recorded";
  const clinicName =
    doctorInfo.department || "Outpatient Musculoskeletal Clinic";
  const specialty = doctorInfo.specialty || "Not recorded";

  autoTable(doc, {
    startY: 29,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2.5, textColor: [20, 28, 30] },
    headStyles: { fillColor: [235, 240, 238], textColor: [20, 28, 30] },
    head: [["Patient Information", "Clinician & Session Information"]],
    body: [
      [
        [
          `Name: ${screening.patientName || "Not recorded"}`,
          `MRN: ${screening.patientMrn || "Not recorded"}`,
          `Age / Sex: ${age !== null ? `${age} years` : "Not recorded"}${
            patient?.sex ? ` · ${patient.sex}` : ""
          }`,
          `Target Joint: ${screening.side || ""} ${
            screening.jointType || "Knee"
          }`,
        ].join("\n"),
        [
          `Doctor: ${clinicianName}`,
          `Clinic: ${clinicName}`,
          `Specialisation: ${specialty}`,
          `Review Status: ${screening.reviewStatus || "Pending Review"}`,
        ].join("\n"),
      ],
    ],
  });

  // 3-Test Guided Protocol Results
  const testRows = SCREENING_TESTS.map((test) => {
    const entry = screening.guidedTests?.[test.id];
    const mv = entry?.manualValues || {};
    let measured = "Not recorded";

    if (test.id === "walk_10m") {
      const parts = [];
      if (screening.walkSpeedMps != null) {
        parts.push(`Speed: ${screening.walkSpeedMps} m/s`);
      }
      if (mv.walkDurationSec || screening.walkDurationSec != null) {
        parts.push(
          `Time: ${mv.walkDurationSec || screening.walkDurationSec} s`
        );
      }
      if (parts.length > 0) measured = parts.join(" · ");
    } else if (test.id === "sit_to_stand_5x") {
      if (mv.sitToStandSec || screening.sitToStandSec != null) {
        measured = `Time: ${
          mv.sitToStandSec || screening.sitToStandSec
        } s (5 cycles)`;
      }
    } else if (test.id === "knee_bend_extend") {
      const parts = [];
      if (mv.flexionDeg || screening.flexionDeg != null) {
        parts.push(`Flexion: ${mv.flexionDeg || screening.flexionDeg}°`);
      }
      if (mv.extensionDeficitDeg || screening.extensionDeficitDeg != null) {
        parts.push(
          `Ext. Deficit: ${
            mv.extensionDeficitDeg ?? screening.extensionDeficitDeg
          }°`
        );
      }
      if (parts.length > 0) measured = parts.join(" · ");
    }

    return [
      test.name,
      entry?.completed ? "Completed" : "Not completed",
      entry?.elapsedSec != null ? `${entry.elapsedSec} s` : "—",
      measured,
    ];
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 6,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2.5, textColor: [20, 28, 30] },
    headStyles: { fillColor: [15, 94, 89], textColor: [255, 255, 255] },
    head: [["Assessment Test", "Status", "Timer", "Recorded Measurements"]],
    body: testRows,
  });

  // Knee Sleeve Sensor Snapshot (if captured)
  const kneeSnap = getLatestKneeSnapshot(screening.guidedTests);
  if (kneeSnap) {
    const p = kneeSnap.processed || {};
    const v = p.vibration || {};
    const acc = kneeSnap.rawImu?.acc || {};
    const gyro = kneeSnap.rawImu?.gyro || {};

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      margin: { left: margin, right: margin },
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 2.5, textColor: [20, 28, 30] },
      headStyles: { fillColor: [235, 240, 238], textColor: [20, 28, 30] },
      head: [
        [
          "Knee Sleeve Sensor Snapshot (Captured)",
          "Value",
          "Raw IMU / Timing",
          "Value",
        ],
      ],
      body: [
        [
          "Knee Angle",
          formatNumberOrFallback(p.kneeAngleDeg, "deg"),
          "Accelerometer (X, Y, Z)",
          `${formatNumberOrFallback(acc.x)}, ${formatNumberOrFallback(
            acc.y
          )}, ${formatNumberOrFallback(acc.z)}`,
        ],
        [
          "Walking Speed",
          formatNumberOrFallback(p.walkingSpeedMs, "m/s"),
          "Gyroscope (X, Y, Z)",
          `${formatNumberOrFallback(gyro.x)}, ${formatNumberOrFallback(
            gyro.y
          )}, ${formatNumberOrFallback(gyro.z)}`,
        ],
        [
          "Steps",
          formatNumberOrFallback(p.steps),
          "ESP32 Timestamp",
          kneeSnap.timing?.esp32Timestamp != null
            ? String(kneeSnap.timing.esp32Timestamp)
            : "Not recorded",
        ],
        [
          "Vibration (RMS / Peak / Spikes)",
          `${formatNumberOrFallback(v.rms)} / ${formatNumberOrFallback(
            v.peak
          )} / ${formatNumberOrFallback(v.spikes)}`,
          "Source Path",
          kneeSnap.rtdbPath || "/knee_sleeve/live",
        ],
      ],
    });
  }

  // Smart Insole Sensor Snapshot (when integrated and captured)
  const insoleSnap = getLatestInsoleSnapshot(screening.guidedTests);
  if (insoleSnap) {
    const pressure = insoleSnap.sole?.pressureDistribution;
    const pressureText = pressure
      ? pressure.aggregatedValue != null
        ? `${pressure.aggregatedValue} ${pressure.unit || ""}`
        : Array.isArray(pressure.channels)
          ? pressure.channels
              .map((c) => `${c.label}: ${c.value} ${pressure.unit || ""}`)
              .join(", ")
          : "Recorded"
      : "Not recorded";

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      margin: { left: margin, right: margin },
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 2.5, textColor: [20, 28, 30] },
      headStyles: { fillColor: [235, 240, 238], textColor: [20, 28, 30] },
      head: [["Smart Insole Measurement", "Recorded Value"]],
      body: [
        ["Sole Pressure Distribution", pressureText],
        [
          "Ankle Angle",
          insoleSnap.ankle?.angle != null
            ? `${insoleSnap.ankle.angle} ${insoleSnap.ankle.unit || ""}`
            : "Not recorded",
        ],
      ],
    });
  }

  // Clinical Symptoms & Threshold-Based Outcome
  const symptomRows = [
    ["Pain Score (VAS 0–10)", formatNumberOrFallback(screening.painScore, "/ 10")],
    [
      "Morning Stiffness",
      formatNumberOrFallback(screening.morningStiffnessMin, "min"),
    ],
    ["Effusion / Swelling", screening.swellingPresent ? "Present" : "Absent"],
    ["Crepitus", screening.crepitusPresent ? "Present" : "Absent"],
    [
      "Instability Reported",
      screening.instabilityReported ? "Yes" : "No",
    ],
    ["Gait / Mobility Aid", screening.gaitStatus || "Unassisted"],
  ];

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 6,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2.5, textColor: [20, 28, 30] },
    headStyles: { fillColor: [235, 240, 238], textColor: [20, 28, 30] },
    head: [["Clinical Symptom / Sign", "Recorded Finding"]],
    body: symptomRows,
  });

  // Threshold Outcome & Notes (with automatic page break check)
  let cursorY = doc.lastAutoTable.finalY + 8;
  const ensureSpace = (neededMm) => {
    if (cursorY + neededMm > pageHeight - 20) {
      doc.addPage();
      cursorY = 18;
    }
  };

  ensureSpace(30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(20, 28, 30);
  doc.text(
    `Threshold Screening Outcome: ${screening.riskLevel || "Pending Review"}`,
    margin,
    cursorY
  );
  cursorY += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(70, 84, 88);
  const flagLine =
    screening.evaluatedCount != null
      ? `Method: ${screening.analysisSource || "Threshold Screening Rubric"} (${
          screening.flaggedCount ?? 0
        } of ${screening.evaluatedCount} evaluated criteria flagged)`
      : `Method: ${screening.analysisSource || "Threshold Screening Rubric"}`;
  doc.text(flagLine, margin, cursorY);
  cursorY += 5;

  if (screening.recommendation) {
    doc.setTextColor(20, 28, 30);
    const recLines = doc.splitTextToSize(
      screening.recommendation,
      pageWidth - margin * 2
    );
    ensureSpace(recLines.length * 4.5 + 4);
    doc.text(recLines, margin, cursorY);
    cursorY += recLines.length * 4.5 + 4;
  }

  const addNotesBlock = (title, text) => {
    if (!text) return;
    ensureSpace(14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(20, 28, 30);
    doc.text(title, margin, cursorY);
    cursorY += 4.5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const lines = doc.splitTextToSize(text, pageWidth - margin * 2);
    ensureSpace(lines.length * 4.2 + 4);
    doc.text(lines, margin, cursorY);
    cursorY += lines.length * 4.2 + 4;
  };

  addNotesBlock("Examiner Observations", screening.clinicalObservations);
  addNotesBlock("Clinician Assessment Notes", screening.clinicianNotes);
  addNotesBlock("Follow-up Plan", screening.followUpPlan);

  // Page Footers with Medical Screening Disclaimer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(212, 222, 218);
    doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 115, 119);
    doc.text(
      "JointSense provides threshold-based screening assistance and does not establish a confirmed clinical diagnosis.",
      margin,
      pageHeight - 9
    );
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 9, {
      align: "right",
    });
  }

  return {
    blob: doc.output("blob"),
    fileName: buildReportFileName(screening),
  };
}
