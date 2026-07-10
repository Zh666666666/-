ALTER TABLE "sensor_samples"
ADD COLUMN "source" "DeviceSource" NOT NULL DEFAULT 'HARDWARE';

UPDATE "sensor_samples" AS sample
SET "source" = session."source"
FROM "sensor_sessions" AS session
WHERE sample."session_id" = session."id";
