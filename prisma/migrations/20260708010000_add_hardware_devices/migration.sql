CREATE TYPE "DeviceStatus" AS ENUM ('UNBOUND', 'ONLINE', 'OFFLINE', 'LOW_BATTERY');

CREATE TYPE "DevicePlacement" AS ENUM ('THIGH', 'SHANK', 'BRACE', 'UNKNOWN');

CREATE TYPE "SensorSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABORTED');

CREATE TYPE "CalibrationQuality" AS ENUM ('PENDING', 'GOOD', 'FAIR', 'POOR');

ALTER TYPE "DeviceSource" ADD VALUE 'HARDWARE';

CREATE TABLE "devices" (
  "id" TEXT NOT NULL,
  "serial_no" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "model" TEXT NOT NULL DEFAULT 'BWT901CL',
  "manufacturer" TEXT NOT NULL DEFAULT 'WitMotion',
  "status" "DeviceStatus" NOT NULL DEFAULT 'UNBOUND',
  "device_token" TEXT,
  "firmware_version" TEXT,
  "battery_level" INTEGER,
  "signal_strength" INTEGER,
  "last_seen_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "device_bindings" (
  "id" TEXT NOT NULL,
  "device_id" TEXT NOT NULL,
  "patient_id" TEXT NOT NULL,
  "placement" "DevicePlacement" NOT NULL DEFAULT 'UNKNOWN',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "bound_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "unbound_at" TIMESTAMP(3),
  CONSTRAINT "device_bindings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sensor_sessions" (
  "id" TEXT NOT NULL,
  "patient_id" TEXT NOT NULL,
  "status" "SensorSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "source" "DeviceSource" NOT NULL DEFAULT 'HARDWARE',
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" TIMESTAMP(3),
  "sample_count" INTEGER NOT NULL DEFAULT 0,
  "summary" JSONB,
  CONSTRAINT "sensor_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sensor_samples" (
  "id" TEXT NOT NULL,
  "session_id" TEXT,
  "device_id" TEXT,
  "patient_id" TEXT NOT NULL,
  "placement" "DevicePlacement" NOT NULL DEFAULT 'UNKNOWN',
  "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "roll" DOUBLE PRECISION,
  "pitch" DOUBLE PRECISION,
  "yaw" DOUBLE PRECISION,
  "q0" DOUBLE PRECISION,
  "q1" DOUBLE PRECISION,
  "q2" DOUBLE PRECISION,
  "q3" DOUBLE PRECISION,
  "ax" DOUBLE PRECISION,
  "ay" DOUBLE PRECISION,
  "az" DOUBLE PRECISION,
  "gx" DOUBLE PRECISION,
  "gy" DOUBLE PRECISION,
  "gz" DOUBLE PRECISION,
  "flexion_angle" DOUBLE PRECISION,
  "extension_angle" DOUBLE PRECISION,
  "confidence" DOUBLE PRECISION,
  "raw" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sensor_samples_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "calibration_records" (
  "id" TEXT NOT NULL,
  "patient_id" TEXT NOT NULL,
  "session_id" TEXT,
  "thigh_device_id" TEXT,
  "shank_device_id" TEXT,
  "quality" "CalibrationQuality" NOT NULL DEFAULT 'PENDING',
  "zero_flexion_angle" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "baseline" JSONB,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "calibration_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "devices_serial_no_key" ON "devices"("serial_no");
CREATE UNIQUE INDEX "devices_device_token_key" ON "devices"("device_token");
CREATE INDEX "devices_status_last_seen_at_idx" ON "devices"("status", "last_seen_at");
CREATE INDEX "device_bindings_patient_id_active_idx" ON "device_bindings"("patient_id", "active");
CREATE INDEX "device_bindings_device_id_active_idx" ON "device_bindings"("device_id", "active");
CREATE INDEX "sensor_sessions_patient_id_started_at_idx" ON "sensor_sessions"("patient_id", "started_at");
CREATE INDEX "sensor_sessions_status_idx" ON "sensor_sessions"("status");
CREATE INDEX "sensor_samples_patient_id_recorded_at_idx" ON "sensor_samples"("patient_id", "recorded_at");
CREATE INDEX "sensor_samples_session_id_recorded_at_idx" ON "sensor_samples"("session_id", "recorded_at");
CREATE INDEX "sensor_samples_device_id_recorded_at_idx" ON "sensor_samples"("device_id", "recorded_at");
CREATE INDEX "calibration_records_patient_id_created_at_idx" ON "calibration_records"("patient_id", "created_at");

ALTER TABLE "device_bindings" ADD CONSTRAINT "device_bindings_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "device_bindings" ADD CONSTRAINT "device_bindings_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sensor_sessions" ADD CONSTRAINT "sensor_sessions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sensor_samples" ADD CONSTRAINT "sensor_samples_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sensor_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sensor_samples" ADD CONSTRAINT "sensor_samples_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sensor_samples" ADD CONSTRAINT "sensor_samples_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calibration_records" ADD CONSTRAINT "calibration_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calibration_records" ADD CONSTRAINT "calibration_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sensor_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "calibration_records" ADD CONSTRAINT "calibration_records_thigh_device_id_fkey" FOREIGN KEY ("thigh_device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "calibration_records" ADD CONSTRAINT "calibration_records_shank_device_id_fkey" FOREIGN KEY ("shank_device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
