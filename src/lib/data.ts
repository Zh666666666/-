import { getDemoDashboardData } from "@/lib/demo-store";
import { hasUsableDatabaseUrl } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { assessKneeRecord, createInitialRecords, seedPatients, serializeNursingRecord, type DashboardData } from "@/lib/rehab";

const includePatientOrder = {
  orderBy: { createdAt: "desc" as const },
};

export async function ensureDemoPatients() {
  if (!hasUsableDatabaseUrl()) {
    return;
  }

  const count = await prisma.patient.count();

  if (count > 0) {
    return;
  }

  for (const patient of seedPatients) {
    await prisma.patient.create({
      data: {
        medicalRecordNo: patient.medicalRecordNo,
        name: patient.name,
        age: patient.age,
        roomNumber: patient.roomNumber,
        surgeryDate: new Date(patient.surgeryDate),
        surgicalSide: patient.surgicalSide,
        targetFlexion: patient.targetFlexion,
        status: patient.status,
        riskLevel: patient.riskLevel,
      },
    });
  }
}

export async function getDashboardData(): Promise<DashboardData> {
  if (!hasUsableDatabaseUrl()) {
    return getDemoDashboardData();
  }

  await ensureDemoPatients();

  const [patients, records, alerts, nursingRecords, aiAnalyses, familyProfile] = await Promise.all([
    prisma.patient.findMany({
      orderBy: [
        { riskLevel: "desc" },
        { createdAt: "asc" },
      ],
    }),
    prisma.kneeDataRecord.findMany({
      orderBy: { recordedAt: "asc" },
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

  if (records.length === 0) {
    const patientByMedicalNo = new Map(patients.map((patient) => [patient.medicalRecordNo, patient.id]));
    const demoRecords = createInitialRecords().map((record) => {
      const medicalNo = seedPatients.find((patient) => patient.id === record.patientId)?.medicalRecordNo;
      return {
        ...record,
        patientId: medicalNo ? patientByMedicalNo.get(medicalNo) ?? patients[0].id : patients[0].id,
      };
    });

    await prisma.kneeDataRecord.createMany({
      data: demoRecords.map((record) => ({
        patientId: record.patientId,
        flexionAngle: record.flexionAngle,
        extensionAngle: record.extensionAngle,
        activityFrequency: record.activityFrequency,
        activityDuration: record.activityDuration,
        painScore: record.painScore,
        batteryLevel: record.batteryLevel,
        signalStrength: record.signalStrength,
        source: "DEMO",
        recordedAt: new Date(record.recordedAt),
      })),
    });

    const latest = demoRecords.at(-1);
    const alert = latest ? assessKneeRecord(latest) : null;

    if (latest && alert) {
      await prisma.alertLog.create({
        data: {
          patientId: latest.patientId,
          type: alert.type,
          severity: alert.severity,
          title: alert.title,
          message: alert.message,
          metric: alert.metric,
          value: alert.value,
          threshold: alert.threshold,
        },
      });
    }

    return getDashboardData();
  }

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
    records: records.map((record) => ({
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
