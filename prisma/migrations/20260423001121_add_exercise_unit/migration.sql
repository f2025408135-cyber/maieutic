-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Exercise" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "instructorPromptText" TEXT NOT NULL,
    "authoredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" DATETIME,
    "specGateDimensions" JSONB NOT NULL,
    "expectedDivergences" JSONB NOT NULL,
    "phase2Required" BOOLEAN NOT NULL,
    "studentLevel" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'unit_2',
    "opusGeneratedDimensions" JSONB NOT NULL,
    "opusGeneratedDivergences" JSONB NOT NULL,
    "opusGeneratedPhase2Required" BOOLEAN NOT NULL,
    "opusGeneratedStudentLevel" TEXT NOT NULL
);
INSERT INTO "new_Exercise" ("authoredAt", "expectedDivergences", "id", "instructorPromptText", "opusGeneratedDimensions", "opusGeneratedDivergences", "opusGeneratedPhase2Required", "opusGeneratedStudentLevel", "phase2Required", "publishedAt", "specGateDimensions", "studentLevel", "title") SELECT "authoredAt", "expectedDivergences", "id", "instructorPromptText", "opusGeneratedDimensions", "opusGeneratedDivergences", "opusGeneratedPhase2Required", "opusGeneratedStudentLevel", "phase2Required", "publishedAt", "specGateDimensions", "studentLevel", "title" FROM "Exercise";
DROP TABLE "Exercise";
ALTER TABLE "new_Exercise" RENAME TO "Exercise";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
