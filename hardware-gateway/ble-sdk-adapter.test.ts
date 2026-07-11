import assert from "node:assert/strict";
import test from "node:test";

import { normalizeWitBleSdkRecord } from "./ble-sdk-adapter";

test("normalizes the official BLE SDK key/value record", () => {
  const reading = normalizeWitBleSdkRecord({
    serialNo: "WT9011DCL-THIGH-001",
    placement: "THIGH",
    recordedAt: "2026-07-09T07:00:00.000Z",
    record: {
      AccX: "0.125",
      AccY: 0,
      AccZ: "-0.98",
      AsX: "1.5",
      AsY: "2.5",
      AsZ: "3.5",
      AngleX: "10.25",
      AngleY: "42.5",
      AngleZ: "-8",
      Q0: "0.9",
      Q1: "0.1",
      Q2: "0.2",
      Q3: "0.3",
    },
  });

  assert.equal(reading.serialNo, "WT9011DCL-THIGH-001");
  assert.equal(reading.pitch, 42.5);
  assert.equal(reading.az, -0.98);
  assert.equal(reading.q3, 0.3);
  assert.deepEqual(reading.raw, {
    protocol: "WIT_BLE_SDK",
    transport: "BLE_5_NATIVE",
    battery: undefined,
  });
});

test("prefers official Ang* numeric keys from the Android SDK", () => {
  const reading = normalizeWitBleSdkRecord({
    serialNo: "WT9011DCL-SHANK-001",
    placement: "SHANK",
    record: {
      AngX: 1,
      AngY: 55,
      AngZ: -3,
      Electricity: 88,
      AccX: 0.1,
      AccY: 0.2,
      AccZ: 0.9,
      AsX: 1,
      AsY: 2,
      AsZ: 3,
    },
  });

  assert.equal(reading.roll, 1);
  assert.equal(reading.pitch, 55);
  assert.equal(reading.yaw, -3);
  assert.equal(reading.raw?.battery, 88);
});

test("rejects incomplete BLE attitude records", () => {
  assert.throws(
    () =>
      normalizeWitBleSdkRecord({
        serialNo: "WT9011DCL-SHANK-001",
        placement: "SHANK",
        record: { AngleX: 0, AngleY: 30 },
      }),
    /missing AngX\/AngleX, AngY\/AngleY, or AngZ\/AngleZ/,
  );
});
