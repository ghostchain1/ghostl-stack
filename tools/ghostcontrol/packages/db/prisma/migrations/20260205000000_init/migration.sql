-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionRequest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedBy" TEXT NOT NULL,
    "reason" TEXT,
    "riskMode" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "requestedActions" JSONB NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "ActionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignedBundle" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "riskMode" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "gates" JSONB NOT NULL,
    "rollback" JSONB NOT NULL,
    "evidencePlan" JSONB NOT NULL,
    "algorithm" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "signatureB64" TEXT NOT NULL,

    CONSTRAINT "SignedBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bundleId" TEXT,
    "kind" TEXT NOT NULL,
    "summary" TEXT,
    "data" JSONB NOT NULL,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "data" JSONB,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Incident_createdAt_idx" ON "Incident"("createdAt");

-- CreateIndex
CREATE INDEX "Incident_signature_idx" ON "Incident"("signature");

-- CreateIndex
CREATE INDEX "ActionRequest_createdAt_idx" ON "ActionRequest"("createdAt");

-- CreateIndex
CREATE INDEX "ActionRequest_status_idx" ON "ActionRequest"("status");

-- CreateIndex
CREATE INDEX "SignedBundle_createdAt_idx" ON "SignedBundle"("createdAt");

-- CreateIndex
CREATE INDEX "SignedBundle_expiresAt_idx" ON "SignedBundle"("expiresAt");

-- CreateIndex
CREATE INDEX "Evidence_createdAt_idx" ON "Evidence"("createdAt");

-- CreateIndex
CREATE INDEX "Evidence_bundleId_idx" ON "Evidence"("bundleId");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_event_idx" ON "AuditEvent"("event");

