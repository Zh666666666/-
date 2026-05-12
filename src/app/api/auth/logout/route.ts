import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { authRoleCookie } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  await supabase?.auth.signOut();

  const cookieStore = await cookies();
  cookieStore.delete(authRoleCookie);

  return NextResponse.json({ ok: true });
}
