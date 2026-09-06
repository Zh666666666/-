import { Client, Pool } from "pg";
import { isDemoMode } from "./env";

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
  sensorLivePgClient?: Client;
  sensorLivePgPool?: Pool;
  sensorLivePgRetry?: ReturnType<typeof setTimeout>;
  sensorLiveOrigin?: string;
};

function dispatch(event: SensorLiveEvent) {
  for (const listener of listeners()) {
    try { listener(event); } catch { /* A closed client must not interrupt other subscribers. */ }
  }
}

function connectSharedSubscriber() {
  if (isDemoMode() || !process.env.DATABASE_URL || globalBroker.sensorLivePgClient || !listeners().size) return;
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  globalBroker.sensorLivePgClient = client;
  const retry = () => {
    if (globalBroker.sensorLivePgClient !== client) return;
    globalBroker.sensorLivePgClient = undefined;
    void client.end().catch(() => {});
    if (listeners().size && !globalBroker.sensorLivePgRetry) {
      globalBroker.sensorLivePgRetry = setTimeout(() => {
        globalBroker.sensorLivePgRetry = undefined;
        connectSharedSubscriber();
      }, 5000);
      globalBroker.sensorLivePgRetry.unref();
    }
  };
  client.on("error", retry);
  client.on("end", retry);
  client.on("notification", (message) => {
    if (!message.payload || message.payload.length > 7000) return;
    try {
      const payload = JSON.parse(message.payload);
      if (payload.origin === globalBroker.sensorLiveOrigin) return;
      const event = payload.event;
      if (event && typeof event.patientId === "string" && typeof event.placement === "string"
        && typeof event.receivedAt === "string" && (event.gatewaySampleId === null || typeof event.gatewaySampleId === "string")) dispatch(event);
    } catch { /* Notifications are hints; the authenticated snapshot is authoritative. */ }
  });
  void client.connect().then(() => client.query("LISTEN tka_sensor_live")).catch(retry);
}

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
      dispatch(latest);
      if (!isDemoMode() && process.env.DATABASE_URL) {
        globalBroker.sensorLiveOrigin ??= crypto.randomUUID();
        if (!globalBroker.sensorLivePgPool) {
          globalBroker.sensorLivePgPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 5000, allowExitOnIdle: true });
          globalBroker.sensorLivePgPool.on("error", () => {});
        }
        const payload = JSON.stringify({ origin: globalBroker.sensorLiveOrigin, event: latest });
        if (Buffer.byteLength(payload) < 7000 && globalBroker.sensorLivePgPool.waitingCount < 100) void globalBroker.sensorLivePgPool.query("SELECT pg_notify('tka_sensor_live', $1)", [payload]).catch(() => {});
      }
    }
  }, 120);
  globalBroker.sensorLiveTimers.set(event.patientId, timer);
}

export function subscribeSensorLiveEvents(listener: Listener) {
  listeners().add(listener);
  connectSharedSubscriber();
  return () => {
    listeners().delete(listener);
    if (!listeners().size) {
      if (globalBroker.sensorLivePgRetry) clearTimeout(globalBroker.sensorLivePgRetry);
      globalBroker.sensorLivePgRetry = undefined;
      const client = globalBroker.sensorLivePgClient;
      globalBroker.sensorLivePgClient = undefined;
      void client?.end().catch(() => {});
    }
  };
}
