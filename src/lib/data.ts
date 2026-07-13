import { getDemoDashboardData } from "@/lib/demo-store";
import { getRuntimeReadiness, isDemoMode } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { serializeNursingRecord, type DashboardData } from "@/lib/rehab";

const includePatientOrder = {
  orderBy: { createdAt: "desc" as const },
};

export async function ensureDemoPatients() {
  // Compatibility shim for existing routes. Production patient creation must be explicit.
  return;
}

export async function getDashboardData(): Promise<DashboardData> {
  const readiness = getRuntimeReadiness();

  if (!readiness.ready) {
    throw new Error(readiness.issues.join(" ") || "Runtime configuration is not ready.");
  }

  if (isDemoMode()) {
    return getDemoDashboardData();
  }

  const [patients, records, alerts, nursingRecords, aiAnalyses, familyProfile] = await Promise.all([
    prisma.patient.findMany({
      orderBy: [
        { riskLevel: "desc" },
        { createdAt: "asc" },
      ],
    }),
    prisma.kneeDataRecord.findMany({
      orderBy: { recordedAt: "desc" },
      take: 80,
    }),
    prisma.alertLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.nursingRecord.findMany({
      ...includePatientOrder,
      take: 10,
    }),
    prisma.aiAnalysis.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.profile.findFirst({ where: { role: "patient" } }),
  ]);

  return {
    patients: patients.map((patient, index) => ({
      ...patient,
      name: index === 0 && familyProfile ? familyProfile.name : patient.name,
      age: index === 0 && familyProfile && familyProfile.age ? familyProfile.age : patient.age,
      surgeryDate: index === 0 && familyProfile?.tkaSurgeryDate ? familyProfile.tkaSurgeryDate.toISOString() : patient.surgeryDate.toISOString(),
      surgicalSide: index === 0 && familyProfile?.affectedKnee ? familyProfile.affectedKnee : patient.surgicalSide,
      createdAt: undefined,
      updatedAt: undefined,
    })) as DashboardData["patients"],
    records: records.toReversed().map((record) => ({
      id: record.id,
      patientId: record.patientId,
      flexionAngle: record.flexionAngle,
      extensionAngle: record.extensionAngle,
      activityFrequency: record.activityFrequency,
      activityDuration: record.activityDuration,
      painScore: record.painScore,
      batteryLevel: record.batteryLevel,
      signalStrength: record.signalStrength,
      source: record.source,
      recordedAt: record.recordedAt.toISOString(),
    })),
    alerts: alerts.map((alert) => ({
      id: alert.id,
      patientId: alert.patientId,
      type: alert.type,
      severity: alert.severity,
      status: alert.status,
      title: alert.title,
      message: alert.message,
      metric: alert.metric,
      value: alert.value,
      threshold: alert.threshold,
      createdAt: alert.createdAt.toISOString(),
      resolvedAt: alert.resolvedAt?.toISOString() ?? null,
    })),
    nursingRecords: nursingRecords.map(serializeNursingRecord),
    aiAnalyses: aiAnalyses.map((analysis) => ({
      id: analysis.id,
      patientId: analysis.patientId,
      patientName: analysis.patientName,
      flexionAngle: analysis.flexionAngle,
      activityFrequency: analysis.activityFrequency,
      activityDuration: analysis.activityDuration,
      painScore: analysis.painScore,
      provider: analysis.provider,
      report: analysis.report,
      recommendation: analysis.recommendation,
      createdAt: analysis.createdAt.toISOString(),
    })),
  };
}
