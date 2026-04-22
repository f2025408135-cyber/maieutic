-- CreateTable
CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "instructorPromptText" TEXT NOT NULL,
    "authoredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" DATETIME,
    "specGateDimensions" JSONB NOT NULL,
    "expectedDivergences" JSONB NOT NULL,
    "phase2Required" BOOLEAN NOT NULL,
    "studentLevel" TEXT NOT NULL,
    "opusGeneratedDimensions" JSONB NOT NULL,
    "opusGeneratedDivergences" JSONB NOT NULL,
    "opusGeneratedPhase2Required" BOOLEAN NOT NULL,
    "opusGeneratedStudentLevel" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "currentPhase" INTEGER NOT NULL,
    "phase1Data" JSONB NOT NULL,
    "phase2Data" JSONB,
    "phase3Data" JSONB NOT NULL,
    "phase4Data" JSONB,
    "liveSummaries" JSONB NOT NULL,
    CONSTRAINT "Session_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SessionEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Session_exerciseId_idx" ON "Session"("exerciseId");

-- CreateIndex
CREATE INDEX "Session_completedAt_idx" ON "Session"("completedAt");

-- CreateIndex
CREATE INDEX "SessionEvent_createdAt_idx" ON "SessionEvent"("createdAt");

-- CreateIndex
CREATE INDEX "SessionEvent_sessionId_createdAt_idx" ON "SessionEvent"("sessionId", "createdAt");
