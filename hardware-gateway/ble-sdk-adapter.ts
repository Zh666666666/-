import type {
  GatewayPlacement,
  SensorReading,
} from "./types";

export type WitBleSdkRecord = Partial<
  Record<
    | "AccX"
    | "AccY"
    | "AccZ"
    | "AsX"
    | "AsY"
    | "AsZ"
    | "AngleX"
    | "AngleY"
    | "AngleZ"
    | "Q0"
    | "Q1"
    | "Q2"
    | "Q3",
    string | number
  >
>;

function optionalNumber(value: string | number | undefined) {
  if (value == null || value === "") {
    return undefined;
  }

  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function normalizeWitBleSdkRecord(input: {
  serialNo: string;
  placement: GatewayPlacement;
  record: WitBleSdkRecord;
  recordedAt?: string;
}): SensorReading {
  const roll = optionalNumber(input.record.AngleX);
  const pitch = optionalNumber(input.record.AngleY);
  const yaw = optionalNumber(input.record.AngleZ);

  if (roll == null || pitch == null || yaw == null) {
    throw new Error("BLE record is missing AngleX, AngleY, or AngleZ.");
  }

  return {
    serialNo: input.serialNo,
    placement: input.placement,
    recordedAt: input.recordedAt ?? new Date().toISOString(),
    roll,
    pitch,
    yaw,
    q0: optionalNumber(input.record.Q0),
    q1: optionalNumber(input.record.Q1),
    q2: optionalNumber(input.record.Q2),
    q3: optionalNumber(input.record.Q3),
    ax: optionalNumber(input.record.AccX),
    ay: optionalNumber(input.record.AccY),
    az: optionalNumber(input.record.AccZ),
    gx: optionalNumber(input.record.AsX),
    gy: optionalNumber(input.record.AsY),
    gz: optionalNumber(input.record.AsZ),
    raw: {
      protocol: "WIT_BLE_SDK",
      transport: "BLE_5_NATIVE",
    },
  };
}
