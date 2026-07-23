ALTER TABLE "device_bindings"
ADD COLUMN "placement_revision" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "sensor_sessions"
ADD COLUMN "placement_revision" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "sensor_samples"
ADD COLUMN "placement_revision" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "calibration_records"
ADD COLUMN "placement_revision" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "device_bindings_patient_id_placement_revision_active_idx"
ON "device_bindings"("patient_id", "placement_revision", "active");

CREATE INDEX "sensor_sessions_patient_id_placement_revision_started_at_idx"
ON "sensor_sessions"("patient_id", "placement_revision", "started_at");

CREATE INDEX "sensor_samples_session_id_placement_revision_recorded_at_idx"
ON "sensor_samples"("session_id", "placement_revision", "recorded_at");

CREATE INDEX "calibration_records_patient_id_placement_revision_created_at_idx"
ON "calibration_records"("patient_id", "placement_revision", "created_at");

DROP INDEX IF EXISTS "sensor_sessions_patient_id_started_at_idx";
DROP INDEX IF EXISTS "sensor_samples_session_id_recorded_at_idx";
DROP INDEX IF EXISTS "calibration_records_patient_id_created_at_idx";
