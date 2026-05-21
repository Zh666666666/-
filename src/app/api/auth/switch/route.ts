import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authRoleCookie, defaultPathForRole, roleFromAuthUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const switchSchema = z.object({
  role: z.enum(["family", "nurse"]),
});

export async function POST(request: Request) {
  const parsed = switchSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
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
