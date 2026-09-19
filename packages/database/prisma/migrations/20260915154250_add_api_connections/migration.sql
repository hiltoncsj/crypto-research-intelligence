-- CreateEnum
CREATE TYPE "ApiConnectionStatus" AS ENUM ('NOT_CONFIGURED', 'REAL', 'PARTIAL', 'MOCK', 'UNAVAILABLE', 'ERROR');

-- CreateTable
CREATE TABLE "api_connections" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "encrypted_secret" TEXT,
    "status" "ApiConnectionStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "metadata" JSONB,
    "last_error" TEXT,
    "last_tested_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_connections_provider_key" ON "api_connections"("provider");
