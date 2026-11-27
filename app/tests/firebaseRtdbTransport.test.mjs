import test from "node:test";
import assert from "node:assert/strict";
import {
  CONNECTION_STATUS,
  parseEsp32KneeSleevePayload,
} from "../src/services/transports/screeningSchema.js";
import { createFirebaseRtdbTransport } from "../src/services/transports/firebaseRtdbTransport.js";

function createMockRtdbHarness(options = {}) {
  let registeredPath = null;
  let onDataCallback = null;
  let onErrorCallback = null;
  let unsubscribedCount = 0;

  const transport = createFirebaseRtdbTransport({
    rtdb: {},
    isRtdbConfigured: options.isRtdbConfigured ?? true,
    rtdbPath: options.rtdbPath ?? "/knee_sleeve/live",
    staleTimeoutMs: options.staleTimeoutMs ?? 80,
    nowFn: options.nowFn,
    refImpl: (_db, path) => {
      registeredPath = path;
      return { path };
    },
    onValueImpl: (_targetRef, onData, onError) => {
      onDataCallback = onData;
      onErrorCallback = onError;
      return () => {
        unsubscribedCount += 1;
      };
    },
  });

  return {
    transport,
    getRegisteredPath: () => registeredPath,
    getUnsubscribedCount: () => unsubscribedCount,
    pushSnapshot: (val) => onDataCallback({ val: () => val }),
    pushError: (err) => onErrorCallback(err),
  };
}

test("1 & 2. Subscribes to /knee_sleeve/live and displays existing payload immediately", async () => {
  const harness = createMockRtdbHarness();
  let latest = null;
  harness.transport.subscribe((snap) => {
    latest = snap;
  });

  assert.equal(latest.connectionStatus, CONNECTION_STATUS.NOT_CONNECTED);
  await harness.transport.connect();
  assert.equal(harness.getRegisteredPath(), "/knee_sleeve/live");
  assert.equal(latest.connectionStatus, CONNECTION_STATUS.LISTENER_ACTIVE);
  assert.equal(latest.isLive, false);

  harness.pushSnapshot({
    knee_angle_deg: 42.5,
    walking_speed_ms: 1.15,
    steps: 14,
    vibration: { rms: 85.4, peak: 410, spikes: 6 },
    acc: { x: 0.04, y: 0.67, z: 0.74 },
    gyro: { x: 12.4, y: -1.1, z: 0.5 },
    timestamp: 25410,
  });

  assert.equal(latest.connectionStatus, CONNECTION_STATUS.RECEIVING);
  assert.equal(latest.isLive, true);
  assert.equal(latest.processed.kneeAngleDeg, 42.5);
  assert.equal(latest.processed.walkingSpeedMs, 1.15);
  assert.equal(latest.processed.steps, 14);
  assert.equal(latest.processed.vibration.rms, 85.4);
  assert.equal(latest.processed.vibration.peak, 410);
  assert.equal(latest.processed.vibration.spikes, 6);
  assert.equal(latest.rawImu.acc.x, 0.04);
  assert.equal(latest.rawImu.gyro.x, 12.4);
  assert.equal(latest.timing.esp32Timestamp, 25410);
  assert.ok(latest.timing.receivedAtMs > 0);
  await harness.transport.disconnect();
});

test("3. Updating a value in Firebase updates state and bounded history buffer", async () => {
  const harness = createMockRtdbHarness();
  let latest = null;
  harness.transport.subscribe((snap) => {
    latest = snap;
  });
  await harness.transport.connect();

  harness.pushSnapshot({ knee_angle_deg: 30, timestamp: 100 });
  harness.pushSnapshot({ knee_angle_deg: 55.2, timestamp: 600 });

  assert.equal(latest.processed.kneeAngleDeg, 55.2);
  assert.equal(latest.historyBuffer.length, 2);
  await harness.transport.disconnect();
});

test("4 & 9 & 10. Null Firebase node shows Waiting for ESP32 data with no fake readings", async () => {
  const harness = createMockRtdbHarness();
  let latest = null;
  harness.transport.subscribe((snap) => {
    latest = snap;
  });
  await harness.transport.connect();

  harness.pushSnapshot(null);

  assert.equal(latest.connectionStatus, CONNECTION_STATUS.WAITING_FOR_ESP32);
  assert.equal(latest.isLive, false);
  assert.equal(latest.processed.kneeAngleDeg, null);
  assert.equal(latest.processed.walkingSpeedMs, null);
  await harness.transport.disconnect();
});

test("5. Stopping ESP32 updates causes Data stale after timeout", async () => {
  let fakeNow = 1000;
  const harness = createMockRtdbHarness({
    staleTimeoutMs: 120,
    nowFn: () => fakeNow,
  });
  let latest = null;
  harness.transport.subscribe((snap) => {
    latest = snap;
  });
  await harness.transport.connect();

  harness.pushSnapshot({ knee_angle_deg: 41.0, timestamp: 500 });
  assert.equal(latest.connectionStatus, CONNECTION_STATUS.RECEIVING);
  assert.equal(latest.isStale, false);

  fakeNow = 1250;
  await new Promise((r) => setTimeout(r, 150));

  assert.equal(latest.connectionStatus, CONNECTION_STATUS.STALE);
  assert.equal(latest.isStale, true);
  assert.equal(latest.isLive, false);
  await harness.transport.disconnect();
});

test("6. Firebase permission error maps to Firebase permission denied", async () => {
  const harness = createMockRtdbHarness();
  let latest = null;
  harness.transport.subscribe((snap) => {
    latest = snap;
  });
  await harness.transport.connect();

  harness.pushError({ code: "PERMISSION_DENIED", message: "Permission denied" });
  assert.equal(latest.connectionStatus, CONNECTION_STATUS.PERMISSION_DENIED);
  assert.equal(latest.isLive, false);
  await harness.transport.disconnect();
});

test("7. Missing fields remain null and never fabricate zeros", () => {
  const parsed = parseEsp32KneeSleevePayload({
    knee_angle_deg: 18.2,
    vibration: { rms: 22.1 },
  });

  assert.equal(parsed.valid, true);
  assert.equal(parsed.processed.kneeAngleDeg, 18.2);
  assert.equal(parsed.processed.walkingSpeedMs, null);
  assert.equal(parsed.processed.steps, null);
  assert.equal(parsed.processed.vibration.rms, 22.1);
  assert.equal(parsed.processed.vibration.peak, null);
  assert.equal(parsed.rawImu.acc.x, null);
  assert.equal(parsed.esp32Timestamp, null);
});

test("8. Disconnecting cleans up the active Firebase listener", async () => {
  const harness = createMockRtdbHarness();
  await harness.transport.connect();
  await harness.transport.disconnect();
  assert.equal(harness.getUnsubscribedCount(), 1);
});

test("Missing Firebase config reports Firebase configuration missing", async () => {
  const harness = createMockRtdbHarness({ isRtdbConfigured: false });
  let latest = null;
  harness.transport.subscribe((snap) => {
    latest = snap;
  });
  assert.equal(latest.connectionStatus, CONNECTION_STATUS.CONFIG_MISSING);
  await assert.rejects(() => harness.transport.connect());
});
