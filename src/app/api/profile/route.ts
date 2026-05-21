import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authRoleCookie, isUserRole } from "@/lib/auth";
import { getDemoProfile, upsertDemoProfile } from "@/lib/demo-store";
import { hasUsableDatabaseUrl } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import type { ProfileItem, UserRole } from "@/lib/rehab";

const profileSchema = z.object({
  role: z.enum(["family", "nurse"]),
  name: z.string().min(1),
  age: z.coerce.number().int().min(0).max(120).optional().nullable(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional().nullable(),
  tkaSurgeryDate: z.string().optional().nullable(),
  affectedKnee: z.enum(["LEFT", "RIGHT", "BILATERAL"]).optional().nullable(),
  phone: z.string().optional().nullable(),
  emergencyContact: z.string().optional().nullable(),
  sensorDeviceId: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
});

function toDatabaseRole(role: UserRole) {
  return role === "family" ? "patient" : "nurse";
}

function toAppRole(role: "patient" | "nurse") {
  return role === "patient" ? "family" : "nurse";
}

async function currentRole(): Promise<UserRole> {
  const cookieStore = await cookies();
  const role = cookieStore.get(authRoleCookie)?.value;
  return isUserRole(role) ? role : "family";
}

function serializeProfile(profile: {
  id: string;
  userId: string;
  role: "patient" | "nurse";
  name: string;
  age: number | null;
  gender: ProfileItem["gender"];
  tkaSurgeryDate: Date | string | null;
  affectedKnee: ProfileItem["affectedKnee"];
  phone: string | null;
  emergencyContact: string | null;
  sensorDeviceId: string | null;
  department: string | null;
  title: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}): ProfileItem {
  return {
    ...profile,
    role: toAppRole(profile.role),
    tkaSurgeryDate: profile.tkaSurgeryDate ? new Date(profile.tkaSurgeryDate).toISOString() : null,
    createdAt: new Date(profile.createdAt).toISOString(),
    updatedAt: new Date(profile.updatedAt).toISOString(),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const roleParam = url.searchParams.get("role");
  const role = isUserRole(roleParam) ? roleParam : await currentRole();
  const dbRole = toDatabaseRole(role);

  if (!hasUsableDatabaseUrl()) {
    return NextResponse.json(getDemoProfile(role));
  }

  const profile = await prisma.profile.findFirst({ where: { role: dbRole } });
  return NextResponse.json(profile ? serializeProfile(profile) : null);
}

export async function PUT(request: Request) {
  const parsed = profileSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid profile payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;

  if (!hasUsableDatabaseUrl()) {
    return NextResponse.json(upsertDemoProfile(body));
  }

  const dbRole = toDatabaseRole(body.role);
  const userId = `${dbRole}-default-profile`;
  const profile = await prisma.profile.upsert({
    where: { userId },
    update: {
      role: dbRole,
      name: body.name,
      age: body.age ?? null,
      gender: body.gender ?? null,
      tkaSurgeryDate: body.tkaSurgeryDate ? new Date(body.tkaSurgeryDate) : null,
      affectedKnee: body.affectedKnee ?? null,
      phone: body.phone ?? null,
      emergencyContact: body.emergencyContact ?? null,
      sensorDeviceId: body.sensorDeviceId ?? null,
      department: body.department ?? null,
      title: body.title ?? null,
    },
    create: {
      userId,
      role: dbRole,
      name: body.name,
      age: body.age ?? null,
      gender: body.gender ?? null,
      tkaSurgeryDate: body.tkaSurgeryDate ? new Date(body.tkaSurgeryDate) : null,
      affectedKnee: body.affectedKnee ?? null,
      phone: body.phone ?? null,
      emergencyContact: body.emergencyContact ?? null,
      sensorDeviceId: body.sensorDeviceId ?? null,
      department: body.department ?? null,
      title: body.title ?? null,
    },
  });

  return NextResponse.json(serializeProfile(profile));
}
