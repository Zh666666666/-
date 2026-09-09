CREATE TABLE "gateway_credentials" (
  "id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "patient_id" TEXT NOT NULL,
  "device_serials" TEXT[] NOT NULL,
  "label" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  CONSTRAINT "gateway_credentials_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gateway_credentials_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "gateway_credentials_token_hash_key" ON "gateway_credentials"("token_hash");
CREATE INDEX "gateway_credentials_patient_id_revoked_at_idx" ON "gateway_credentials"("patient_id", "revoked_at");
ALTER TABLE "devices" ADD COLUMN "owner_patient_id" TEXT;
UPDATE "devices" AS d SET "owner_patient_id" = b.patient_id
FROM (
  SELECT device_id, MIN(patient_id) AS patient_id FROM device_bindings
  WHERE active = true GROUP BY device_id HAVING COUNT(DISTINCT patient_id) = 1
) b WHERE d.id = b.device_id;
ALTER TYPE "PatientAccessAction" ADD VALUE 'GATEWAY_ISSUED';
ALTER TYPE "PatientAccessAction" ADD VALUE 'GATEWAY_REVOKED';
