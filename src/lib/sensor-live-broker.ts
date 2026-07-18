export type SensorLiveEvent = {
  patientId: string;
  gatewaySampleId: string | null;
  placement: string;
  receivedAt: string;
};

type Listener = (event: SensorLiveEvent) => void;

const globalBroker = globalThis as unknown as {
  sensorLiveListeners?: Set<Listener>;
};

function listeners() {
  globalBroker.sensorLiveListeners ??= new Set();
  return globalBroker.sensorLiveListeners;
}

export function publishSensorLiveEvent(event: SensorLiveEvent) {
  for (const listener of listeners()) listener(event);
}

export function subscribeSensorLiveEvents(listener: Listener) {
  listeners().add(listener);
  return () => listeners().delete(listener);
}
