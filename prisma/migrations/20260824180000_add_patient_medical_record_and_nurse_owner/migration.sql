-- Unify the family and nurse views around one patient medical record.
ALTER TYPE "PatientAccessAction" ADD VALUE IF NOT EXISTS 'PATIENT_UPDATED';
ALTER TYPE "PatientAccessAction" ADD VALUE IF NOT EXISTS 'NURSE_ASSIGNED';
ALTER TYPE "PatientAccessAction" ADD VALUE IF NOT EXISTS 'NURSE_RELEASED';

CREATE TYPE "AllergyStatus" AS ENUM ('UNKNOWN', 'NONE', 'PRESENT');

ALTER TABLE "patients"
  ADD COLUMN "gender" "Gender",
  ADD COLUMN "date_of_birth" TIMESTAMP(3),
  ADD COLUMN "ethnicity" TEXT,
  ADD COLUMN "native_place" TEXT,
  ADD COLUMN "nationality" TEXT,
  ADD COLUMN "marital_status" TEXT,
  ADD COLUMN "occupation" TEXT,
  ADD COLUMN "blood_type" TEXT,
  ADD COLUMN "home_address" TEXT,
  ADD COLUMN "emergency_contact_name" TEXT,
  ADD COLUMN "emergency_contact_relation" TEXT,
  ADD COLUMN "emergency_contact_phone" TEXT,
  ADD COLUMN "allergy_status" "AllergyStatus" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "allergy_history" TEXT,
  ADD COLUMN "past_medical_history" TEXT,
  ADD COLUMN "surgical_history" TEXT,
  ADD COLUMN "family_medical_history" TEXT,
  ADD COLUMN "medication_history" TEXT,
  ADD COLUMN "primary_nurse_user_id" TEXT;

-- The current installation has one clinical owner. Preserve its existing patient list.
UPDATE "patients"
SET "primary_nurse_user_id" = (
  SELECT "user_id" FROM "profiles"
  WHERE "role" = 'nurse'
  ORDER BY "created_at" ASC
  LIMIT 1
)
WHERE "primary_nurse_user_id" IS NULL
  AND EXISTS (SELECT 1 FROM "profiles" WHERE "role" = 'nurse');

ALTER TABLE "patient_invitations" ALTER COLUMN "patient_id" DROP NOT NULL;
CREATE INDEX "patients_primary_nurse_user_id_status_idx" ON "patients"("primary_nurse_user_id", "status");
