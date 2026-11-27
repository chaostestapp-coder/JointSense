/**
 * Feature extraction & adapter layer for future OA machine learning models.
 *
 * No trained ML model is currently integrated in JointSense. This module
 * prepares a deterministic, null-preserving feature vector from clinical test
 * measurements, knee sleeve telemetry, and smart insole telemetry without
 * inventing diagnostic thresholds or fabricated predictions.
 */

function toNumberOrNull(val) {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "boolean") return null;
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

export function extractScreeningFeatures({
  clinical = {},
  kneeSleeveSnapshot = null,
  smartInsoleSnapshot = null,
} = {}) {
  const kp = kneeSleeveSnapshot?.processed || {};
  const kv = kp.vibration || {};
  const kAcc = kneeSleeveSnapshot?.rawImu?.acc || {};
  const kGyro = kneeSleeveSnapshot?.rawImu?.gyro || {};

  const ip = smartInsoleSnapshot?.processed || {};
  const iFsr = ip.fsr || {};
  const iBal = ip.balance || {};
  const iAcc = smartInsoleSnapshot?.rawImu?.acc || {};
  const iGyro = smartInsoleSnapshot?.rawImu?.gyro || {};

  const clinicalFeatures = {
    walkSpeedMps: toNumberOrNull(clinical.walkSpeedMps),
    walkDurationSec: toNumberOrNull(clinical.walkDurationSec),
    sitToStandSec: toNumberOrNull(clinical.sitToStandSec),
    flexionDeg: toNumberOrNull(clinical.flexionDeg),
    extensionDeficitDeg: toNumberOrNull(clinical.extensionDeficitDeg),
    painScore: toNumberOrNull(clinical.painScore),
    morningStiffnessMin: toNumberOrNull(clinical.morningStiffnessMin),
    swellingPresent: Boolean(clinical.swellingPresent),
    crepitusPresent: Boolean(clinical.crepitusPresent),
    instabilityReported: Boolean(clinical.instabilityReported),
  };

  const kneeSleeveFeatures = {
    kneeAngleDeg: toNumberOrNull(kp.kneeAngleDeg),
    walkingSpeedMs: toNumberOrNull(kp.walkingSpeedMs),
    steps: toNumberOrNull(kp.steps),
    vibrationRms: toNumberOrNull(kv.rms),
    vibrationPeak: toNumberOrNull(kv.peak),
    vibrationSpikes: toNumberOrNull(kv.spikes),
    accX: toNumberOrNull(kAcc.x),
    accY: toNumberOrNull(kAcc.y),
    accZ: toNumberOrNull(kAcc.z),
    gyroX: toNumberOrNull(kGyro.x),
    gyroY: toNumberOrNull(kGyro.y),
    gyroZ: toNumberOrNull(kGyro.z),
  };

  const smartInsoleFeatures = {
    shoeAngleDeg: toNumberOrNull(
      ip.shoeAngleDeg ?? smartInsoleSnapshot?.ankle?.angle
    ),
    footContact:
      typeof ip.footContact === "boolean" ? ip.footContact : null,
    fsrHeel: toNumberOrNull(iFsr.heel),
    fsrInner: toNumberOrNull(iFsr.inner),
    fsrOuter: toNumberOrNull(iFsr.outer),
    fsrToe: toNumberOrNull(iFsr.toe),
    fsrTotal: toNumberOrNull(iFsr.total),
    balanceHeelPct: toNumberOrNull(iBal.heelPct),
    balanceInnerPct: toNumberOrNull(iBal.innerPct),
    balanceOuterPct: toNumberOrNull(iBal.outerPct),
    balanceToePct: toNumberOrNull(iBal.toePct),
    accX: toNumberOrNull(iAcc.x),
    accY: toNumberOrNull(iAcc.y),
    accZ: toNumberOrNull(iAcc.z),
    gyroX: toNumberOrNull(iGyro.x),
    gyroY: toNumberOrNull(iGyro.y),
    gyroZ: toNumberOrNull(iGyro.z),
  };

  const hasClinical = [
    clinicalFeatures.walkSpeedMps,
    clinicalFeatures.walkDurationSec,
    clinicalFeatures.sitToStandSec,
    clinicalFeatures.flexionDeg,
    clinicalFeatures.extensionDeficitDeg,
    clinicalFeatures.painScore,
    clinicalFeatures.morningStiffnessMin,
  ].some((v) => v !== null);

  const hasKneeSleeve = Object.values(kneeSleeveFeatures).some(
    (v) => v !== null
  );
  const hasSmartInsole = Object.values(smartInsoleFeatures).some(
    (v) => v !== null
  );

  return {
    schemaVersion: "1.0.0",
    mlModelIntegrated: false,
    availability: {
      hasClinical,
      hasKneeSleeve,
      hasSmartInsole,
    },
    clinical: clinicalFeatures,
    kneeSleeve: kneeSleeveFeatures,
    smartInsole: smartInsoleFeatures,
  };
}
