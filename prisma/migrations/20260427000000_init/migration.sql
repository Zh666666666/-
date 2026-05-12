-- CreateEnum
CREATE TYPE "SurgicalSide" AS ENUM ('LEFT', 'RIGHT', 'BILATERAL');

-- CreateEnum
CREATE TYPE "PatientStatus" AS ENUM ('ACTIVE', 'OBSERVATION', 'DISCHARGED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "DeviceSource" AS ENUM ('SMART_BRACE', 'MANUAL', 'DEMO');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('ROM_LOW', 'ACTIVITY_LOW', 'DURATION_LOW', 'PAIN_HIGH', 'DEVICE_OFFLINE');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "NursingAction" AS ENUM ('REMOTE_GUIDANCE', 'PHONE_CALL', 'HOME_VISIT', 'REHAB_ADJUSTMENT', 'MEDICATION_REMINDER');

-- CreateTable
CREATE TABLE "patients" (
    "id" TEXT NOT NULL,
    "medical_record_no" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "room_number" TEXT,
    "phone" TEXT,
    "emergency_contact" TEXT,
    "surgery_date" TIMESTAMP(3) NOT NULL,
    "surgical_side" "SurgicalSide" NOT NULL DEFAULT 'RIGHT',
    "diagnosis" TEXT NOT NULL DEFAULT 'TKA 术后康复',
    "target_flexion" DOUBLE PRECISION NOT NULL DEFAULT 110,
    "status" "PatientStatus" NOT NULL DEFAULT 'ACTIVE',
    "risk_level" "RiskLevel" NOT NULL DEFAULT 'MEDIUM',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knee_data_records" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "flexion_angle" DOUBLE PRECISION NOT NULL,
    "extension_angle" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "activity_frequency" INTEGER NOT NULL,
    "activity_duration" INTEGER NOT NULL,
    "pain_score" INTEGER NOT NULL DEFAULT 0,
    "battery_level" INTEGER NOT NULL DEFAULT 92,
    "signal_strength" INTEGER NOT NULL DEFAULT 96,
    "source" "DeviceSource" NOT NULL DEFAULT 'SMART_BRACE',
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knee_data_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nursing_records" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "nurse_name" TEXT NOT NULL,
    "action_type" "NursingAction" NOT NULL DEFAULT 'REMOTE_GUIDANCE',
    "guidance" TEXT NOT NULL,
    "notes" TEXT,
    "next_follow_up" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nursing_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_logs" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metric" TEXT,
    "value" DOUBLE PRECISION,
    "threshold" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "alert_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patients_medical_record_no_key" ON "patients"("medical_record_no");

-- CreateIndex
CREATE INDEX "patients_status_risk_level_idx" ON "patients"("status", "risk_level");

-- CreateIndex
CREATE INDEX "knee_data_records_patient_id_recorded_at_idx" ON "knee_data_records"("patient_id", "recorded_at");

-- CreateIndex
CREATE INDEX "nursing_records_patient_id_created_at_idx" ON "nursing_records"("patient_id", "created_at");

-- CreateIndex
CREATE INDEX "alert_logs_patient_id_status_severity_idx" ON "alert_logs"("patient_id", "status", "severity");

-- CreateIndex
CREATE INDEX "alert_logs_created_at_idx" ON "alert_logs"("created_at");

-- AddForeignKey
ALTER TABLE "knee_data_records" ADD CONSTRAINT "knee_data_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nursing_records" ADD CONSTRAINT "nursing_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_logs" ADD CONSTRAINT "alert_logs_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
