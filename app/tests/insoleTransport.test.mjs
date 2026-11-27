import test from "node:test";
import assert from "node:assert/strict";
import {
  INSOLE_CONNECTION_STATUS,
  mapShoeInsolePayload,
  normalizeInsolePayload,
} from "../src/services/transports/insoleSchema.js";
import { createFirebaseInsoleTransport } from "../src/services/transports/firebaseInsoleTransport.js";
import { createFirebaseRtdbTransport } from "../src/services/transports/firebaseRtdbTransport.js";
import { CONNECTION_STATUS } from "../src/services/transports/screeningSchema.js";
import {
  extractScreeningFeatures,
  runOaRiskInference,
} from "../src/services/ml/screeningFeatureExtractor.js";

test("Pending hardware specs when insole RTDB path or mapper is missing (no subscription)", async () => {
  let subscribeCalls = 0;
  const transport = createFirebaseInsoleTransport({
    rtdb: {},
    isRtdbConfigured: true,
    rtdbPath: "",
    onValueImpl: () => {
      subscribeCalls += 1;
      return () => {};
    },
  });

  let latest = null;
  transport.subscribe((snap) => {
    latest = snap;
  });

  assert.equal(
    latest.connectionStatus,
    INSOLE_CONNECTION_STATUS.PENDING_SPECS
  );
  assert.equal(latest.sole.pressureDistribution, null);
  assert.equal(latest.ankle.angle, null);
  await assert.rejects(() => transport.connect());
  assert.equal(subscribeCalls, 0);
});

test("Not configured status when RTDB is not configured", () => {
  const transport = createFirebaseInsoleTransport({
    rtdb: null,
    isRtdbConfigured: false,
    rtdbPath: "",
  });

  let latest = null;
  transport.subscribe((snap) => {
    latest = snap;
  });
  assert.equal(latest.connectionStatus, INSOLE_CONNECTION_STATUS.NOT_CONFIGURED);
});

test("Rejects invalid payloads and missing mapper safely", () => {
  assert.equal(normalizeInsolePayload(null).isEmpty, true);
  assert.equal(normalizeInsolePayload([1, 2, 3]).valid, false);
  assert.equal(normalizeInsolePayload({ foo: 1 }, null).valid, false);
  assert.equal(
    normalizeInsolePayload({ foo: 1 }, () => ({})).valid,
    false
  );
});

test("Independent insole listener receives mapped data, handles stale timeout, and cleans up", async () => {
  let fakeNow = 2000;
  let onDataCb = null;
  let unsubCount = 0;

  const transport = createFirebaseInsoleTransport({
    rtdb: {},
    isRtdbConfigured: true,
    rtdbPath: "/test_insole/live",
    staleTimeoutMs: 120,
    nowFn: () => fakeNow,
    refImpl: (_db, path) => ({ path }),
    onValueImpl: (_ref, onData) => {
      onDataCb = onData;
      return () => {
        unsubCount += 1;
      };
    },
    payloadMapper: (raw) => ({
      sole: {
        pressureDistribution: raw.load != null
          ? { mode: "aggregated", aggregatedValue: raw.load, unit: "kPa" }
          : null,
      },
      ankle: {
        angle: raw.ankle ?? null,
        unit: "deg",
      },
      deviceTimestamp: raw.ts ?? null,
    }),
  });

  let latest = null;
  transport.subscribe((snap) => {
    latest = snap;
  });

  await transport.connect();
  assert.equal(latest.connectionStatus, INSOLE_CONNECTION_STATUS.LISTENER_ACTIVE);

  onDataCb({ val: () => null });
  assert.equal(
    latest.connectionStatus,
    INSOLE_CONNECTION_STATUS.WAITING_FOR_HARDWARE
  );

  onDataCb({ val: () => ({ load: 45, ankle: 12.5, ts: 900 }) });
  assert.equal(latest.connectionStatus, INSOLE_CONNECTION_STATUS.RECEIVING);
  assert.equal(latest.isLive, true);
  assert.equal(latest.sole.pressureDistribution.aggregatedValue, 45);
  assert.equal(latest.ankle.angle, 12.5);
  assert.equal(latest.ankle.unit, "deg");

  fakeNow = 2250;
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(latest.connectionStatus, INSOLE_CONNECTION_STATUS.STALE);
  assert.equal(latest.isStale, true);
  assert.equal(latest.isLive, false);

  await transport.disconnect();
  assert.equal(unsubCount, 1);
});


test("Normalizes confirmed /shoe/live payload preserving false and 0 while keeping missing fields null", () => {
  const samplePayload = {
    acc: { x: -0.06, y: -0.61, z: -0.84 },
    balance: { heel_pct: 0, inner_pct: 0, outer_pct: 0, toe_pct: 0 },
    foot_contact: false,
    fsr: { heel: 0, inner: 0, outer: 0, toe: 0, total: 0 },
    gyro: { x: 9.1, y: -5.3, z: 2.1 },
    shoe_angle_deg: 18.6,
    timestamp: 320453,
  };

  const parsed = normalizeInsolePayload(samplePayload, mapShoeInsolePayload);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.processed.shoeAngleDeg, 18.6);
  assert.equal(parsed.processed.footContact, false);
  assert.equal(parsed.processed.fsr.heel, 0);
  assert.equal(parsed.processed.fsr.total, 0);
  assert.equal(parsed.processed.balance.heelPct, 0);
  assert.equal(parsed.rawImu.acc.x, -0.06);
  assert.equal(parsed.rawImu.gyro.z, 2.1);
  assert.equal(parsed.deviceTimestamp, 320453);

  const partialParsed = normalizeInsolePayload(
    { shoe_angle_deg: 12.4, acc: { x: 0.1 } },
    mapShoeInsolePayload
  );
  assert.equal(partialParsed.valid, true);
  assert.equal(partialParsed.processed.shoeAngleDeg, 12.4);
  assert.equal(partialParsed.processed.footContact, null);
  assert.equal(partialParsed.processed.fsr.heel, null);
  assert.equal(partialParsed.rawImu.acc.x, 0.1);
  assert.equal(partialParsed.rawImu.acc.y, null);
  assert.equal(partialParsed.rawImu.gyro.x, null);
});

test("Simultaneous knee sleeve and smart insole listeners operate independently", async () => {
  let kneeCb = null;
  let insoleCb = null;
  let kneeUnsubs = 0;
  let insoleUnsubs = 0;

  const kneeTransport = createFirebaseRtdbTransport({
    rtdb: {},
    isRtdbConfigured: true,
    rtdbPath: "/knee_sleeve/live",
    staleTimeoutMs: 5000,
    refImpl: (_db, path) => ({ path }),
    onValueImpl: (_ref, cb) => {
      kneeCb = cb;
      return () => {
        kneeUnsubs += 1;
      };
    },
  });

  const insoleTransport = createFirebaseInsoleTransport({
    rtdb: {},
    isRtdbConfigured: true,
    rtdbPath: "/shoe/live",
    staleTimeoutMs: 5000,
    refImpl: (_db, path) => ({ path }),
    onValueImpl: (_ref, cb) => {
      insoleCb = cb;
      return () => {
        insoleUnsubs += 1;
      };
    },
  });

  let latestKnee = null;
  let latestInsole = null;
  kneeTransport.subscribe((s) => {
    latestKnee = s;
  });
  insoleTransport.subscribe((s) => {
    latestInsole = s;
  });

  await Promise.all([kneeTransport.connect(), insoleTransport.connect()]);

  kneeCb({ val: () => ({ knee_angle_deg: 19.2, steps: 1, timestamp: 118326 }) });
  insoleCb({ val: () => ({ shoe_angle_deg: 18.6, foot_contact: false, timestamp: 320453 }) });

  assert.equal(latestKnee.connectionStatus, CONNECTION_STATUS.RECEIVING);
  assert.equal(latestInsole.connectionStatus, INSOLE_CONNECTION_STATUS.RECEIVING);
  assert.equal(latestKnee.processed.kneeAngleDeg, 19.2);
  assert.equal(latestInsole.processed.shoeAngleDeg, 18.6);

  await insoleTransport.disconnect();
  assert.equal(insoleUnsubs, 1);
  assert.equal(kneeUnsubs, 0);
  assert.equal(latestKnee.connectionStatus, CONNECTION_STATUS.RECEIVING);
  assert.equal(latestInsole.connectionStatus, INSOLE_CONNECTION_STATUS.NOT_CONNECTED);

  await kneeTransport.disconnect();
  assert.equal(kneeUnsubs, 1);
});

test("ML feature extractor & OA risk inference compute probability and preserve null availability", () => {
  const features = extractScreeningFeatures({
    clinical: { walkSpeedMps: 1.1, painScore: 3 },
    kneeSleeveSnapshot: { processed: { kneeAngleDeg: 19.2, steps: 0 } },
    smartInsoleSnapshot: null,
  });

  assert.equal(features.mlModelIntegrated, true);
  assert.equal(features.availability.hasClinical, true);
  assert.equal(features.availability.hasKneeSleeve, true);
  assert.equal(features.availability.hasSmartInsole, false);
  assert.equal(features.kneeSleeve.steps, 0);
  assert.equal(features.smartInsole.shoeAngleDeg, null);
  assert.equal(features.smartInsole.footContact, null);

  const oa = runOaRiskInference({
    clinical: { walkSpeedMps: 0.72 },
    kneeSleeveSnapshot: {
      processed: {
        walkingSpeedMs: 0.72,
        vibration: { rms: 0.42, spikes: 6 },
      },
    },
    smartInsoleSnapshot: {
      processed: {
        fsr: { heel: 300, inner: 100, outer: 240, toe: 120 },
      },
    },
    kneeHistory: [
      { kneeAngleDeg: 10, vibrationRms: 0.4, vibrationSpikes: 5 },
      { kneeAngleDeg: 38, vibrationRms: 0.44, vibrationSpikes: 7 },
    ],
    insoleHistory: [{ shoeAngleDeg: 4 }, { shoeAngleDeg: 16 }],
  });

  assert.equal(oa.mlModelIntegrated, true);
  assert.equal(oa.totalFeatures, 7);
  assert.equal(oa.measuredFeaturesCount, 7);
  assert.ok(oa.probability > 0 && oa.probability <= 1);
  assert.equal(oa.riskBand, "High OA Risk");
});
