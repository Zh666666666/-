ALTER TYPE "VerificationPurpose" ADD VALUE IF NOT EXISTS 'RESET_PASSWORD';

ALTER TABLE "profiles"
ADD COLUMN "relation_to_patient" TEXT,
ADD COLUMN "notification_preference" TEXT;

ALTER TABLE "ai_analyses"
ADD COLUMN "session_id" TEXT,
ADD COLUMN "confidence" DOUBLE PRECISION,
ADD COLUMN "status" TEXT;

CREATE INDEX "ai_analyses_session_id_idx" ON "ai_analyses"("session_id");

ALTER TABLE "knee_data_records"
ALTER COLUMN "battery_level" DROP DEFAULT,
ALTER COLUMN "battery_level" DROP NOT NULL;
