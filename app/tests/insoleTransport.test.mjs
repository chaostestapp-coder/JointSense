import test from "node:test";
import assert from "node:assert/strict";
import {
  INSOLE_CONNECTION_STATUS,
  normalizeInsolePayload,
} from "../src/services/transports/insoleSchema.js";
import { createFirebaseInsoleTransport } from "../src/services/transports/firebaseInsoleTransport.js";

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
