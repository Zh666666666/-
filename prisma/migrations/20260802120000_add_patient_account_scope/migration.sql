ALTER TABLE "profiles" ADD COLUMN "patient_id" TEXT;
ALTER TABLE "appointments" ADD COLUMN "patient_id" TEXT;

CREATE INDEX "profiles_patient_id_idx" ON "profiles"("patient_id");
CREATE INDEX "appointments_patient_id_created_at_idx" ON "appointments"("patient_id", "created_at");

ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_patient_id_fkey"
  FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_patient_id_fkey"
  FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "profiles"
SET "patient_id" = 'prod-patient-1'
WHERE "user_id" = 'local-family'
  AND "patient_id" IS NULL
  AND EXISTS (SELECT 1 FROM "patients" WHERE "id" = 'prod-patient-1');

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "device_id" ORDER BY "bound_at" DESC, "id" DESC
  ) AS position
  FROM "device_bindings"
  WHERE "active" = TRUE
)
UPDATE "device_bindings" AS binding
SET "active" = FALSE, "unbound_at" = COALESCE(binding."unbound_at", CURRENT_TIMESTAMP)
FROM ranked
WHERE binding."id" = ranked."id" AND ranked.position > 1;

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "patient_id", "placement", "placement_revision"
    ORDER BY "bound_at" DESC, "id" DESC
  ) AS position
  FROM "device_bindings"
  WHERE "active" = TRUE AND "placement" IN ('THIGH', 'SHANK')
)
UPDATE "device_bindings" AS binding
SET "active" = FALSE, "unbound_at" = COALESCE(binding."unbound_at", CURRENT_TIMESTAMP)
FROM ranked
WHERE binding."id" = ranked."id" AND ranked.position > 1;

CREATE UNIQUE INDEX "device_bindings_one_active_per_device"
  ON "device_bindings"("device_id") WHERE "active" = TRUE;

CREATE UNIQUE INDEX "device_bindings_one_active_per_placement"
  ON "device_bindings"("patient_id", "placement", "placement_revision")
  WHERE "active" = TRUE AND "placement" IN ('THIGH', 'SHANK');
