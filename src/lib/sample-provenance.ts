export const sensorDataSources = ["SMART_BRACE", "HARDWARE", "MANUAL", "DEMO"] as const;

export type SensorDataSource = (typeof sensorDataSources)[number];

export function resolveSensorDataSource(
  sessionSource?: SensorDataSource | null,
  requestedSource?: SensorDataSource | null,
): SensorDataSource {
  return sessionSource ?? requestedSource ?? "HARDWARE";
}

export function isSimulatedSource(source: SensorDataSource) {
  return source === "DEMO";
}
