import { cookies } from "next/headers";

import { canAccessPatient, type DataAccessContext } from "./access-control";
import { authRoleCookie, isUserRole, roleFromAuthUser } from "./auth";
import { isDemoMode, resolveAuthMode } from "./env";
import { gatewayUnauthorizedResponse } from "./gateway-auth";
import { localCredentials, localSessionCookie, verifyLocalSession } from "./local-auth";
import { prisma } from "./prisma";
import { createSupabaseServerClient } from "./supabase-server";

function defaultLocalUserId(role: "family" | "nurse") {
  return role === "family" ? "local-family" : "local-nurse";
}

export async function getDataAccessContext(): Promise<DataAccessContext | null> {
  const store = await cookies();

  if (isDemoMode()) {
    const cookieRole = store.get(authRoleCookie)?.value;
    const role = isUserRole(cookieRole) ? cookieRole : "family";
    return { role, userId: `demo-${role}`, patientId: null, unrestricted: true };
  }

  const authMode = resolveAuthMode();
  let role: "family" | "nurse" | null = null;
  let userId: string | null = null;

  if (authMode === "local") {
    const session = await verifyLocalSession(
      store.get(localSessionCookie)?.value,
      process.env["LOCAL_AUTH_SESSION_SECRET"],
    );
    if (session?.accountId) {
      const account = await prisma.authAccount.findUnique({
        where: { id: session.accountId },
        select: { role: true, status: true, updatedAt: true },
      });
      const expectedRole = session.role === "family" ? "patient" : "nurse";
      if (!account
        || account.status !== "ACTIVE"
        || account.role !== expectedRole
        || session.issuedAt < account.updatedAt.getTime()) return null;
    } else if (session) {
      const defaults = localCredentials(session.role);
      const migratedAccount = defaults.email
        ? await prisma.authAccount.findUnique({
          where: { email: defaults.email.trim().toLowerCase() },
          select: { id: true },
        })
        : null;
      if (migratedAccount) return null;
    }
    role = session?.role ?? null;
    userId = session ? session.accountId ?? defaultLocalUserId(session.role) : null;
  } else if (authMode === "supabase") {
    const supabase = await createSupabaseServerClient();
    const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    role = roleFromAuthUser(data.user);
    userId = data.user?.id ?? null;
  }

  if (!role || !userId) return null;

  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { userId: true, patientId: true },
  });

  const scopedUserId = profile?.userId ?? userId;
  if (role === "nurse") return { role, userId: scopedUserId, patientId: null, unrestricted: true };

  return { role, userId: scopedUserId, patientId: profile?.patientId ?? null, unrestricted: false };
}

export async function requestCanAccessPatient(request: Request, patientId: string, allowGateway = false) {
  if (allowGateway && !gatewayUnauthorizedResponse(request)) return true;
  const access = await getDataAccessContext();
  return access ? canAccessPatient(access, patientId) : false;
}
