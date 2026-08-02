import { NextResponse } from "next/server";
import { z } from "zod";

import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { getDemoProfile, upsertDemoProfile } from "@/lib/demo-store";
import { isDemoMode } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import type { ProfileItem, UserRole } from "@/lib/rehab";
import { getDataAccessContext } from "@/lib/server-access";

const schema = z.object({
  role: z.enum(["family", "nurse"]),
  name: z.string().trim().min(1).max(60),
  phone: z.string().trim().max(30).optional().nullable(),
  relationToPatient: z.string().trim().max(40).optional().nullable(),
  notificationPreference: z.enum(["IMPORTANT_ONLY", "ALL", "NONE"]).optional().nullable(),
  department: z.string().trim().max(80).optional().nullable(),
  title: z.string().trim().max(80).optional().nullable(),
});

function toDatabaseRole(role: UserRole) { return role === "family" ? "patient" : "nurse"; }
function toAppRole(role: "patient" | "nurse"): UserRole { return role === "patient" ? "family" : "nurse"; }

function serialize(profile: {
  id: string; userId: string; patientId: string | null; role: "patient" | "nurse"; name: string; age: number | null;
  gender: ProfileItem["gender"]; tkaSurgeryDate: Date | null; affectedKnee: ProfileItem["affectedKnee"];
  phone: string | null; emergencyContact: string | null; sensorDeviceId: string | null;
  relationToPatient: string | null; notificationPreference: string | null;
  department: string | null; title: string | null; createdAt: Date; updatedAt: Date;
}): ProfileItem {
  return {
    ...profile,
    role: toAppRole(profile.role),
    tkaSurgeryDate: profile.tkaSurgeryDate?.toISOString() ?? null,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export async function GET() {
  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;
  const current = await getDataAccessContext();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (isDemoMode()) return NextResponse.json(getDemoProfile(current.role));
  const profile = await prisma.profile.findUnique({ where: { userId: current.userId } });
  return NextResponse.json(profile ? serialize(profile) : null);
}

export async function PUT(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "资料格式不正确。" }, { status: 400 });
  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;
  const current = await getDataAccessContext();
  if (!current || parsed.data.role !== current.role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (isDemoMode()) return NextResponse.json(upsertDemoProfile(parsed.data));

  const dbRole = toDatabaseRole(current.role);
  const family = current.role === "family";
  const profile = await prisma.profile.upsert({
    where: { userId: current.userId },
    update: {
      name: parsed.data.name,
      phone: parsed.data.phone ?? null,
      relationToPatient: family ? parsed.data.relationToPatient ?? null : null,
      notificationPreference: parsed.data.notificationPreference ?? null,
      department: family ? null : parsed.data.department ?? null,
      title: family ? null : parsed.data.title ?? null,
    },
    create: {
      userId: current.userId,
      role: dbRole,
      name: parsed.data.name,
      phone: parsed.data.phone ?? null,
      relationToPatient: family ? parsed.data.relationToPatient ?? null : null,
      notificationPreference: parsed.data.notificationPreference ?? null,
      department: family ? null : parsed.data.department ?? null,
      title: family ? null : parsed.data.title ?? null,
    },
  });
  return NextResponse.json(serialize(profile));
}
