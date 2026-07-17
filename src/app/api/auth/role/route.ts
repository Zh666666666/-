import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authRoleCookie, defaultPathForRole, resolveAuthRole, roleFromAuthUser } from "@/lib/auth";
import { resolveAuthMode } from "@/lib/env";
import { localSessionCookie, verifyLocalSession } from "@/lib/local-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const roleSchema = z.object({
  role: z.enum(["family", "nurse"]),
});

export async function GET() {
  const cookieStore = await cookies();
  if (resolveAuthMode() === "local") {
    const session = await verifyLocalSession(
      cookieStore.get(localSessionCookie)?.value,
      process.env["LOCAL_AUTH_SESSION_SECRET"],
    );
    return NextResponse.json({ role: session?.role ?? null, authenticated: Boolean(session) });
  }
  const supabase = await createSupabaseServerClient();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const role = resolveAuthRole(data.user, cookieStore.get(authRoleCookie)?.value);

  return NextResponse.json({ role, authenticated: Boolean(data.user || role) });
}

export async function POST(request: Request) {
  const parsed = roleSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  if (resolveAuthMode() === "local") {
    const cookieStore = await cookies();
    const session = await verifyLocalSession(
      cookieStore.get(localSessionCookie)?.value,
      process.env["LOCAL_AUTH_SESSION_SECRET"],
    );
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.role !== parsed.data.role) {
      return NextResponse.json({ error: "Role does not match current account" }, { status: 403 });
    }
    return NextResponse.json({ role: session.role, redirectTo: defaultPathForRole(session.role) });
  }

  const supabase = await createSupabaseServerClient();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  if (!supabase) {
    const cookieStore = await cookies();
    const role = parsed.data.role;

    cookieStore.set(authRoleCookie, role, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return NextResponse.json({ role, redirectTo: defaultPathForRole(role) });
  }

  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existingRole = roleFromAuthUser(data.user);

  if (existingRole && existingRole !== parsed.data.role) {
    return NextResponse.json({ error: "Role does not match current account" }, { status: 403 });
  }

  if (!existingRole) {
    const { error } = await supabase.auth.updateUser({ data: { role: parsed.data.role } });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  const cookieStore = await cookies();
  cookieStore.set(authRoleCookie, existingRole ?? parsed.data.role, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  const role = existingRole ?? parsed.data.role;

  return NextResponse.json({ role, redirectTo: defaultPathForRole(role) });
}
