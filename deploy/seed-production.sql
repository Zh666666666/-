INSERT INTO "patients" (
  "id", "medical_record_no", "name", "age", "surgery_date",
  "surgical_side", "diagnosis", "target_flexion", "status", "risk_level", "updated_at"
) VALUES (
  'prod-patient-1', 'TKA-PROD-0001', '待绑定患者', 65, CURRENT_TIMESTAMP,
  'RIGHT', 'TKA 术后康复', 110, 'ACTIVE', 'MEDIUM', CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "profiles" (
  "id", "user_id", "patient_id", "role", "name", "department", "title", "created_at", "updated_at"
) VALUES
  ('prod-family-profile', 'local-family', 'prod-patient-1', 'patient', '家属账号', NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('prod-nurse-profile', 'local-nurse', NULL, 'nurse', '护士账号', '康复护理', '护士', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("user_id") DO NOTHING;

UPDATE "profiles"
SET "patient_id" = 'prod-patient-1'
WHERE "user_id" = 'local-family' AND "patient_id" IS NULL;
