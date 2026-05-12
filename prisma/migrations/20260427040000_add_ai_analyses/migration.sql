-- CreateTable
CREATE TABLE "ai_analyses" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "patient_name" TEXT NOT NULL,
    "flexion_angle" DOUBLE PRECISION NOT NULL,
    "activity_frequency" INTEGER NOT NULL,
    "activity_duration" INTEGER NOT NULL,
    "pain_score" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT NOT NULL,
    "report" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_analyses_patient_id_created_at_idx" ON "ai_analyses"("patient_id", "created_at");
