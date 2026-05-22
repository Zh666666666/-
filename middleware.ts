import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { authRoleCookie, resolveAuthRole, type UserRole } from "@/lib/auth";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/supabase-config";

const protectedPrefixes = ["/family", "/nurse"];

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
  matcher: ["/family/:path*", "/nurse/:path*"],
};
