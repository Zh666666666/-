ALTER TABLE "sensor_samples"
ADD COLUMN "gateway_sample_id" TEXT;

CREATE UNIQUE INDEX "sensor_samples_gateway_sample_id_key"
ON "sensor_samples"("gateway_sample_id");
