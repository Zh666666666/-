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

export async function getDashboardData(patientId?: string): Promise<DashboardData> {
  const readiness = getRuntimeReadiness();

  if (!readiness.ready) {
    throw new Error(readiness.issues.join(" ") || "Runtime configuration is not ready.");
  }

  if (isDemoMode()) {
    const dashboard = getDemoDashboardData();
    if (!patientId) return dashboard;
    return {
      patients: dashboard.patients.filter((patient) => patient.id === patientId),
      records: dashboard.records.filter((record) => record.patientId === patientId),
      alerts: dashboard.alerts.filter((alert) => alert.patientId === patientId),
      nursingRecords: dashboard.nursingRecords.filter((record) => record.patientId === patientId),
      aiAnalyses: dashboard.aiAnalyses.filter((analysis) => analysis.patientId === patientId),
    };
  }

  const patientWhere = patientId ? { patientId } : undefined;
  const [patients, records, alerts, nursingRecords, aiAnalyses] = await Promise.all([
    prisma.patient.findMany({
      where: patientId ? { id: patientId } : undefined,
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
  ]);

  return {
    patients: patients.map((patient) => ({
      ...patient,
      surgeryDate: patient.surgeryDate.toISOString(),
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
