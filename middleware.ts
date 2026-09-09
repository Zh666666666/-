import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { authRoleCookie, resolveAuthRole, type UserRole } from "@/lib/auth";
import { resolveAuthMode } from "@/lib/env";
import { localSessionCookie, verifyLocalSession } from "@/lib/local-auth";
import {
  gatewayCanAccess,
  hasSameOrigin,
  isPublicApi,
  requiresSameOrigin,
  roleCanAccessApi,
} from "@/lib/request-security";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/supabase-config";

const protectedPrefixes = ["/family", "/nurse"];
const localProtectedPrefixes = [...protectedPrefixes, "/appointments", "/sensor-live", "/evidence", "/hardware-demo"];
function redirectTo(request: NextRequest, pathname: string) {
  const target = request.nextUrl.clone();
  target.pathname = pathname;
  target.search = "";
  return NextResponse.redirect(target);
}

function loginRedirect(request: NextRequest, pathname: string) {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("next", pathname);

  return NextResponse.redirect(loginUrl);
}

function isProtectedPath(pathname: string) {
  return protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function matchesPrefix(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

async function hasValidGatewayToken(request: NextRequest, pathname: string) {
  if (!gatewayCanAccess(pathname, request.method)) return false;
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  // Node handlers verify database credentials, revocation and resource scope.
  return /^tka_gw_[A-Za-z0-9_-]{43}$/.test(token);
}

function authorizeCookieApi(request: NextRequest, role: UserRole | null, response = NextResponse.next()) {
  if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (requiresSameOrigin(request.method)
    && !hasSameOrigin(request.url, request.headers.get("origin"), process.env["NEXT_PUBLIC_APP_URL"])) {
    return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
  }
  if (!roleCanAccessApi(role, request.nextUrl.pathname, request.method)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return response;
}

async function localAuthMiddleware(request: NextRequest, pathname: string) {
  const session = await verifyLocalSession(
    request.cookies.get(localSessionCookie)?.value,
    process.env["LOCAL_AUTH_SESSION_SECRET"],
  );

  if (pathname.startsWith("/api/")) {
    if (isPublicApi(pathname)) return NextResponse.next();
    if (await hasValidGatewayToken(request, pathname)) return NextResponse.next();
    return authorizeCookieApi(request, session?.role ?? null);
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
  const authMode = resolveAuthMode();

  if (authMode === "local") {
    return localAuthMiddleware(request, pathname);
  }

  if (!isSupabaseConfigured) {
    if (authMode === "invalid" && (pathname.startsWith("/api/") || matchesPrefix(pathname, localProtectedPrefixes))) {
      return pathname.startsWith("/api/")
        ? NextResponse.json({ error: "Authentication is not configured" }, { status: 503 })
        : loginRedirect(request, pathname);
    }

    if (pathname.startsWith("/api/")) {
      if (isPublicApi(pathname) || authMode === "demo") return NextResponse.next();
      const role = resolveAuthRole(null, request.cookies.get(authRoleCookie)?.value);
      return authorizeCookieApi(request, role);
    }

    const role = resolveAuthRole(null, request.cookies.get(authRoleCookie)?.value);

    if (!isProtectedPath(pathname)) {
      return NextResponse.next();
    }

    if (!role) {
      return loginRedirect(request, pathname);
    }

    return redirectForMismatchedRole(request, pathname, role) ?? NextResponse.next();
  }

  if (pathname.startsWith("/api/") && isPublicApi(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/") && await hasValidGatewayToken(request, pathname)) {
    return NextResponse.next();
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

  if (pathname.startsWith("/api/")) {
    if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return authorizeCookieApi(request, role, response);
  }

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
