import type { UserRole } from "./auth";

const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isPublicApi(pathname: string) {
  return pathname === "/api/health"
    || pathname.startsWith("/api/health/")
    || pathname === "/api/auth/login"
    || pathname === "/api/auth/register/send-code"
    || pathname === "/api/auth/register/complete"
    || pathname === "/api/auth/password/send-code"
    || pathname === "/api/auth/password/reset";
}

export function gatewayCanAccess(pathname: string, method: string) {
  const normalizedMethod = method.toUpperCase();

  if (normalizedMethod === "GET" && pathname === "/api/gateway/ready") return true;
  if (normalizedMethod === "POST" && pathname === "/api/devices") return true;
  if (normalizedMethod === "POST" && pathname === "/api/devices/heartbeat") return true;
  if ((normalizedMethod === "GET" || normalizedMethod === "POST") && pathname === "/api/device-bindings") return true;
  if (normalizedMethod === "POST" && pathname === "/api/device-calibrations") return true;
  if (normalizedMethod === "POST" && pathname === "/api/sensor-sessions") return true;
  if (normalizedMethod === "PATCH" && /^\/api\/sensor-sessions\/[^/]+$/.test(pathname)) return true;
  if (normalizedMethod === "POST" && (pathname === "/api/sensor-samples" || pathname === "/api/sensor-samples/batch")) return true;
  if (normalizedMethod === "POST" && pathname === "/api/ai-analyses") return true;

  return false;
}

export function roleCanAccessApi(role: UserRole, pathname: string, method: string) {
  const normalizedMethod = method.toUpperCase();

  if (normalizedMethod === "PATCH" && pathname.startsWith("/api/alerts/")) {
    return role === "nurse";
  }

  if (normalizedMethod === "PATCH" && pathname.startsWith("/api/appointments/")) {
    return role === "nurse";
  }

  if (normalizedMethod === "POST" && pathname === "/api/nursing-records") {
    return role === "nurse";
  }

  return true;
}

export function requiresSameOrigin(method: string) {
  return mutationMethods.has(method.toUpperCase());
}

export function hasSameOrigin(requestUrl: string, originHeader: string | null, configuredAppUrl?: string) {
  if (!originHeader) return false;

  try {
    const origin = new URL(originHeader).origin;
    const allowedOrigins = new Set([new URL(requestUrl).origin]);
    if (configuredAppUrl) allowedOrigins.add(new URL(configuredAppUrl).origin);
    return allowedOrigins.has(origin);
  } catch {
    return false;
  }
}
