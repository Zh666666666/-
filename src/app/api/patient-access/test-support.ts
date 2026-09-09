import { AsyncLocalStorage } from "node:async_hooks";

// Next normally installs this global during server startup.
Object.assign(globalThis, { AsyncLocalStorage });

export function configureTestEnvironment(databaseUrl = "postgresql://test:test@127.0.0.1:1/tka_patient_test") {
  Object.assign(process.env, {
    APP_MODE: "production", AUTH_MODE: "local", DATABASE_URL: databaseUrl,
    LOCAL_AUTH_SESSION_SECRET: "patient-route-test-session-secret-only-12345",
    PATIENT_INVITE_SECRET: "patient-route-test-invite-secret-only-12345",
    LOCAL_FAMILY_EMAIL: "family@example.test", LOCAL_FAMILY_PASSWORD: "test-password-family",
    LOCAL_NURSE_EMAIL: "nurse@example.test", LOCAL_NURSE_PASSWORD: "test-password-nurse",
    GATEWAY_API_TOKEN: "patient-route-test-gateway-token-only",
  });
}

export async function asUser<T>(role: "family" | "nurse", userId: string, work: () => Promise<T>) {
  const { createLocalSession, localSessionCookie } = await import("@/lib/local-auth");
  const { NextRequest } = await import("next/server");
  const { createRequestStoreForAPI } = await import("next/dist/server/async-storage/request-store");
  const { workUnitAsyncStorage } = await import("next/dist/server/app-render/work-unit-async-storage.external");
  const { workAsyncStorage } = await import("next/dist/server/app-render/work-async-storage.external");
  const token = await createLocalSession(role, process.env.LOCAL_AUTH_SESSION_SECRET!, Date.now(), userId);
  const request = new NextRequest("http://localhost/api/patient-access", {
    headers: { cookie: `${localSessionCookie}=${token}` },
  });
  const store = createRequestStoreForAPI(request, new URL(request.url), { tags: [], expirationsByCacheKind: new Map() }, undefined, undefined);
  const workStore = { isStaticGeneration: false, route: "/api/patient-access", page: "/api/patient-access/route" } as
    import("next/dist/server/app-render/work-async-storage.external").WorkStore;
  return workAsyncStorage.run(workStore, () => workUnitAsyncStorage.run(store, work));
}

export function actionRequest(action: string, values: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/patient-access", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, confirmed: true, ...values }),
  });
}

export const recordInput = {
  name: "Patient Edited", allergyStatus: "NONE", diagnosis: "TKA",
  surgeryDate: "2026-01-01", surgicalSide: "LEFT",
};
