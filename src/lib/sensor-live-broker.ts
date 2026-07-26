export type SensorLiveEvent = {
  patientId: string;
  gatewaySampleId: string | null;
  placement: string;
  receivedAt: string;
};

type Listener = (event: SensorLiveEvent) => void;

const globalBroker = globalThis as unknown as {
  sensorLiveListeners?: Set<Listener>;
  sensorLivePending?: Map<string, SensorLiveEvent>;
  sensorLiveTimers?: Map<string, ReturnType<typeof setTimeout>>;
};

function listeners() {
  globalBroker.sensorLiveListeners ??= new Set();
  return globalBroker.sensorLiveListeners;
}

export function publishSensorLiveEvent(event: SensorLiveEvent) {
  globalBroker.sensorLivePending ??= new Map();
  globalBroker.sensorLiveTimers ??= new Map();
  globalBroker.sensorLivePending.set(event.patientId, event);
  if (globalBroker.sensorLiveTimers.has(event.patientId)) return;
  const timer = setTimeout(() => {
    const latest = globalBroker.sensorLivePending?.get(event.patientId);
    globalBroker.sensorLivePending?.delete(event.patientId);
    globalBroker.sensorLiveTimers?.delete(event.patientId);
    if (latest) {
      for (const listener of listeners()) listener(latest);
    }
  }, 120);
  globalBroker.sensorLiveTimers.set(event.patientId, timer);
}

export function subscribeSensorLiveEvents(listener: Listener) {
  listeners().add(listener);
  return () => listeners().delete(listener);
}
