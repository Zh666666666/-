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

export async function getDashboardData(patientScope?: string | string[]): Promise<DashboardData> {
  const readiness = getRuntimeReadiness();

  if (!readiness.ready) {
    throw new Error(readiness.issues.join(" ") || "Runtime configuration is not ready.");
  }

  if (isDemoMode()) {
    const dashboard = getDemoDashboardData();
    if (!patientScope) return dashboard;
    const patientIds = Array.isArray(patientScope) ? patientScope : [patientScope];
    return {
      patients: dashboard.patients.filter((patient) => patientIds.includes(patient.id)),
      records: dashboard.records.filter((record) => patientIds.includes(record.patientId)),
      alerts: dashboard.alerts.filter((alert) => patientIds.includes(alert.patientId)),
      nursingRecords: dashboard.nursingRecords.filter((record) => patientIds.includes(record.patientId)),
      aiAnalyses: dashboard.aiAnalyses.filter((analysis) => patientIds.includes(analysis.patientId)),
    };
  }

  const patientIds = patientScope ? (Array.isArray(patientScope) ? patientScope : [patientScope]) : undefined;
  const patientWhere = patientIds ? { patientId: { in: patientIds } } : undefined;
  const [patients, records, alerts, nursingRecords, aiAnalyses, nurseProfiles] = await Promise.all([
    prisma.patient.findMany({
      where: patientIds ? { id: { in: patientIds } } : undefined,
      orderBy: [
        { riskLevel: "desc" },
        { createdAt: "asc" },
      ],
    }),
    prisma.kneeDataRecord.findMany({
      where: patientWhere,
      orderBy: { recordedAt: "desc" },
      take: 80,
    }),
    prisma.alertLog.findMany({
      where: patientWhere,
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.nursingRecord.findMany({
      where: patientWhere,
      ...includePatientOrder,
      take: 10,
    }),
    prisma.aiAnalysis.findMany({
      where: patientWhere,
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.profile.findMany({ where: { role: "nurse" }, select: { userId: true, name: true } }),
  ]);

  const nurseNames = new Map(nurseProfiles.map((profile) => [profile.userId, profile.name]));

  return {
    patients: patients.map((patient) => ({
      ...patient,
      dateOfBirth: patient.dateOfBirth?.toISOString() ?? null,
      surgeryDate: patient.surgeryDate.toISOString(),
      primaryNurseName: patient.primaryNurseUserId ? nurseNames.get(patient.primaryNurseUserId) ?? null : null,
      createdAt: undefined,
      updatedAt: patient.updatedAt.toISOString(),
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
