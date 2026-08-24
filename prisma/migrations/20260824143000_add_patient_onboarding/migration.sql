CREATE TYPE "PatientInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');
CREATE TYPE "PatientAccessAction" AS ENUM ('SELF_CREATED', 'INVITE_CREATED', 'INVITE_ACCEPTED', 'INVITE_REVOKED', 'FAMILY_UNLINKED', 'NURSE_REVOKED', 'MIGRATED');

CREATE TABLE "patient_invitations" (
  "id" TEXT NOT NULL,
  "patient_id" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "status" "PatientInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "created_by_user_id" TEXT NOT NULL,
  "accepted_by_user_id" TEXT,
  "accepted_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "patient_invitations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "patient_access_audits" (
  "id" TEXT NOT NULL,
  "patient_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "action" "PatientAccessAction" NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "actor_role" "UserRole" NOT NULL,
  "details" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "patient_access_audits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "patient_invitations_code_hash_key" ON "patient_invitations"("code_hash");
CREATE INDEX "patient_invitations_patient_id_status_created_at_idx" ON "patient_invitations"("patient_id", "status", "created_at");
CREATE INDEX "patient_invitations_expires_at_status_idx" ON "patient_invitations"("expires_at", "status");
CREATE INDEX "patient_access_audits_patient_id_created_at_idx" ON "patient_access_audits"("patient_id", "created_at");
CREATE INDEX "patient_access_audits_user_id_created_at_idx" ON "patient_access_audits"("user_id", "created_at");

ALTER TABLE "patient_invitations"
  ADD CONSTRAINT "patient_invitations_patient_id_fkey"
  FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "patient_access_audits"
  ADD CONSTRAINT "patient_access_audits_patient_id_fkey"
  FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "patient_access_audits" (
  "id", "patient_id", "user_id", "action", "actor_user_id", "actor_role", "details", "created_at"
)
SELECT
  CONCAT('migration-', "id"),
  "patient_id",
  "user_id",
  'MIGRATED'::"PatientAccessAction",
  'system-migration',
  "role",
  jsonb_build_object('source', '20260824143000_add_patient_onboarding'),
  CURRENT_TIMESTAMP
FROM "profiles"
WHERE "patient_id" IS NOT NULL;
