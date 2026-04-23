-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "currentPhase" INTEGER NOT NULL,
    "phase1Data" JSONB NOT NULL,
    "phase2Data" JSONB,
    "phase3Data" JSONB NOT NULL,
    "phase4Data" JSONB,
    "liveSummaries" JSONB NOT NULL,
    CONSTRAINT "Session_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Session" ("completedAt", "currentPhase", "exerciseId", "id", "liveSummaries", "phase1Data", "phase2Data", "phase3Data", "phase4Data", "startedAt", "studentId") SELECT "completedAt", "currentPhase", "exerciseId", "id", "liveSummaries", "phase1Data", "phase2Data", "phase3Data", "phase4Data", "startedAt", "studentId" FROM "Session";
DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";
CREATE INDEX "Session_exerciseId_idx" ON "Session"("exerciseId");
CREATE INDEX "Session_completedAt_idx" ON "Session"("completedAt");
CREATE INDEX "Session_lastActiveAt_idx" ON "Session"("lastActiveAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
