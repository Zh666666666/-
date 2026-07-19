import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { authRoleCookie, resolveAuthRole, type UserRole } from "@/lib/auth";
import { resolveAuthMode } from "@/lib/env";
import { localSessionCookie, secretsEqual, verifyLocalSession } from "@/lib/local-auth";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/supabase-config";

const protectedPrefixes = ["/family", "/nurse"];
const localProtectedPrefixes = [...protectedPrefixes, "/appointments", "/sensor-live", "/evidence", "/hardware-demo"];
const publicApiPrefixes = ["/api/auth", "/api/health"];
const gatewayApiPrefixes = [
  "/api/gateway",
  "/api/devices",
  "/api/device-bindings",
  "/api/device-calibrations",
  "/api/sensor-sessions",
  "/api/sensor-samples",
];

function redirectTo(request: NextRequest, pathname: string) {
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");

  return NextResponse.redirect(new URL(pathname, `${forwardedProto}://${forwardedHost}`));
}

function loginRedirect(request: NextRequest, pathname: string) {
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  const loginUrl = new URL("/login", `${forwardedProto}://${forwardedHost}`);
  loginUrl.searchParams.set("next", pathname);

  return NextResponse.redirect(loginUrl);
}

function isProtectedPath(pathname: string) {
  return protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function matchesPrefix(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

async function localAuthMiddleware(request: NextRequest, pathname: string) {
  const session = await verifyLocalSession(
    request.cookies.get(localSessionCookie)?.value,
    process.env["LOCAL_AUTH_SESSION_SECRET"],
  );

  if (pathname.startsWith("/api/")) {
    if (matchesPrefix(pathname, publicApiPrefixes)) return NextResponse.next();
    if (session) return NextResponse.next();

    if (matchesPrefix(pathname, gatewayApiPrefixes)) {
      const authorization = request.headers.get("authorization") ?? "";
      const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      const expected = process.env["GATEWAY_API_TOKEN"] ?? "";
      if (expected.length >= 24 && await secretsEqual(token, expected)) return NextResponse.next();
    }

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!matchesPrefix(pathname, localProtectedPrefixes)) return NextResponse.next();
  if (!session) return unauthorizedRedirect(request, pathname);
  return redirectForMismatchedRole(request, pathname, session.role) ?? NextResponse.next();
}

function unauthorizedRedirect(request: NextRequest, pathname: string) {
  const response = loginRedirect(request, pathname);
  response.cookies.delete(authRoleCookie);
  return response;
}

function redirectForMismatchedRole(request: NextRequest, pathname: string, role: UserRole) {
  if (pathname.startsWith("/family") && role !== "family") {
    return redirectTo(request, "/nurse");
  }

  if (pathname.startsWith("/nurse") && role !== "nurse") {
    return redirectTo(request, "/family");
  }

  return null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (resolveAuthMode() === "local") {
    return localAuthMiddleware(request, pathname);
  }

  if (!isSupabaseConfigured) {
    const role = resolveAuthRole(null, request.cookies.get(authRoleCookie)?.value);

    if (!isProtectedPath(pathname)) {
      return NextResponse.next();
    }

    if (!role) {
      return loginRedirect(request, pathname);
    }

    return redirectForMismatchedRole(request, pathname, role) ?? NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    supabaseUrl!,
    supabaseAnonKey!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  const role = resolveAuthRole(data.user, request.cookies.get(authRoleCookie)?.value);

  if (!isProtectedPath(pathname)) {
    return response;
  }

  if (!data.user || !role) {
    return unauthorizedRedirect(request, pathname);
  }

  return redirectForMismatchedRole(request, pathname, role) ?? response;
}

export const config = {
  matcher: [
    "/family/:path*",
    "/nurse/:path*",
    "/appointments/:path*",
    "/sensor-live/:path*",
    "/evidence/:path*",
    "/hardware-demo/:path*",
    "/api/:path*",
  ],
};
