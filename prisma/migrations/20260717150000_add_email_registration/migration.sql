CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "VerificationPurpose" AS ENUM ('REGISTRATION');

CREATE TABLE "auth_accounts" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'patient',
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "verified_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_verifications" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "purpose" "VerificationPurpose" NOT NULL DEFAULT 'REGISTRATION',
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_accounts_email_key" ON "auth_accounts"("email");
CREATE INDEX "auth_accounts_role_status_idx" ON "auth_accounts"("role", "status");
CREATE INDEX "email_verifications_email_purpose_created_at_idx" ON "email_verifications"("email", "purpose", "created_at");
CREATE INDEX "email_verifications_expires_at_idx" ON "email_verifications"("expires_at");
