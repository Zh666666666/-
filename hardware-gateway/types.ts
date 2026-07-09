export type GatewayPlacement = "THIGH" | "SHANK";

export type AdapterState =
  | "CONNECTING"
  | "CONNECTED"
  | "DISCONNECTED"
  | "RECONNECTING"
  | "STOPPED";

export type SensorReading = {
  serialNo: string;
  placement: GatewayPlacement;
  recordedAt: string;
  roll?: number;
  pitch?: number;
  yaw?: number;
  q0?: number;
  q1?: number;
  q2?: number;
  q3?: number;
  ax?: number;
  ay?: number;
  az?: number;
  gx?: number;
  gy?: number;
  gz?: number;
  raw: {
    protocol: "WIT_STANDARD" | "WIT_BLE_SDK";
    transport: "BLE_5_NATIVE";
    frameTypes?: number[];
  };
};

export type QueuedSensorSample = SensorReading & {
  patientId: string;
  flexionAngle?: number;
  extensionAngle?: number;
  confidence?: number;
};

export interface SensorAdapter {
  start(
    onReading: (reading: SensorReading) => void | Promise<void>,
  ): Promise<void>;
  stop(): Promise<void>;
}

export interface OfflineQueue<T> {
  append(item: T): Promise<void>;
  peek(limit: number): Promise<T[]>;
  acknowledge(count: number): Promise<void>;
  size(): Promise<number>;
}
