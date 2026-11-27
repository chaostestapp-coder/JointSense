import {
  explainFeatures,
  FEATURE_NAMES,
  MODEL_META,
  predictOAProbability,
} from "./oaModel.js";

/**
 * Feature extraction & OA risk inference adapter for JointSense.
 *
 * Maps clinical test measurements, knee sleeve telemetry, and smart insole
 * telemetry into the 7-feature vector expected by `oaModel.js`:
 *   [knee_angle_range, vibration_rms_avg, vibration_spikes_avg,
 *    walking_speed_ms, heel_to_forefoot_ratio, lateral_shift_ratio,
 *    shoe_angle_range]
 */

const FEATURE_LABELS = {
  knee_angle_range: "Knee angle range",
  vibration_rms_avg: "Joint vibration (RMS)",
  vibration_spikes_avg: "Vibration spikes",
  walking_speed_ms: "Walking speed",
  heel_to_forefoot_ratio: "Heel-to-forefoot load ratio",
  lateral_shift_ratio: "Lateral load shift ratio",
  shoe_angle_range: "Shoe angle range",
};

function toNumberOrNull(val) {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "boolean") return null;
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

function computeRange(values, minActiveExcursion = 0) {
  const valid = values.map(toNumberOrNull).filter((v) => v !== null);
  if (valid.length < 2) return null;
  const range = Number((Math.max(...valid) - Math.min(...valid)).toFixed(3));
  if (range < minActiveExcursion) return null;
  return range;
}

function computeAverage(values) {
  const valid = values.map(toNumberOrNull).filter((v) => v !== null);
  if (valid.length === 0) return null;
  const sum = valid.reduce((acc, v) => acc + v, 0);
  return Number((sum / valid.length).toFixed(4));
}

function computeRatio(numerator, denominator) {
  const num = toNumberOrNull(numerator);
  const den = toNumberOrNull(denominator);
  if (num === null || den === null || num + den <= 0) return null;
  return Number((num / Math.max(den, 1)).toFixed(4));
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
    footContact: typeof ip.footContact === "boolean" ? ip.footContact : null,
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
    mlModelIntegrated: true,
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

export function buildOaModelFeatures({
  clinical = {},
  kneeSleeveSnapshot = null,
  smartInsoleSnapshot = null,
  kneeHistory = [],
  insoleHistory = [],
} = {}) {
  const kp = kneeSleeveSnapshot?.processed || {};
  const kv = kp.vibration || {};
  const ip = smartInsoleSnapshot?.processed || {};
  const fsr = ip.fsr || {};
  const bal = ip.balance || {};

  const kneeAngleRange = computeRange(
    kneeHistory.map((s) => s.kneeAngleDeg),
    5
  );
  const vibrationRmsAvg =
    computeAverage(kneeHistory.map((s) => s.vibrationRms)) ??
    toNumberOrNull(kv.rms);
  const vibrationSpikesAvg =
    computeAverage(kneeHistory.map((s) => s.vibrationSpikes)) ??
    toNumberOrNull(kv.spikes);
  const walkingSpeedMs =
    toNumberOrNull(clinical.walkSpeedMps) ??
    toNumberOrNull(kp.walkingSpeedMs);

  const heelToForefootRatio =
    computeRatio(fsr.heel, fsr.toe) ??
    computeRatio(bal.heelPct, bal.toePct);
  const lateralShiftRatio =
    computeRatio(fsr.outer, fsr.inner) ??
    computeRatio(bal.outerPct, bal.innerPct);
  const shoeAngleRange = computeRange(
    insoleHistory.map((s) => s.shoeAngleDeg),
    3
  );

  return [
    kneeAngleRange,
    vibrationRmsAvg,
    vibrationSpikesAvg,
    walkingSpeedMs,
    heelToForefootRatio,
    lateralShiftRatio,
    shoeAngleRange,
  ];
}

export function runOaRiskInference(params = {}) {
  const featureVector = buildOaModelFeatures(params);
  const probability = Number(predictOAProbability(featureVector).toFixed(4));
  const probabilityPct = Math.round(probability * 100);

  let riskBand = "Low OA Risk";
  if (probability >= 0.7) {
    riskBand = "High OA Risk";
  } else if (probability >= 0.4) {
    riskBand = "Moderate OA Risk";
  }

  const explanations = explainFeatures(featureVector).map((item, idx) => ({
    ...item,
    label: FEATURE_LABELS[item.name] || item.name,
    usedFallback: featureVector[idx] === null,
  }));

  const measuredFeaturesCount = featureVector.filter((v) => v !== null).length;

  return {
    mlModelIntegrated: true,
    probability,
    probabilityPct,
    riskBand,
    measuredFeaturesCount,
    totalFeatures: FEATURE_NAMES.length,
    featureNames: FEATURE_NAMES,
    featureVector,
    explanations,
    modelMeta: {
      trainedAt: MODEL_META.trainedAt,
      datasetSize: MODEL_META.datasetSize,
    },
  };
}
