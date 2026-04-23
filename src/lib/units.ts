// Curriculum units, independent of the Opus-calibration `studentLevel` field.
// Units I and II both map to week_1_2 (same technical ceiling but different
// topics), which is why unit and level have to be stored separately.

import type { StudentLevel } from "@/lib/opus/schemas";

export const UNIT_IDS = ["unit_1", "unit_2", "unit_3", "unit_4"] as const;
export type Unit = (typeof UNIT_IDS)[number];

export const UNIT_TITLE: Record<Unit, string> = {
  unit_1: "Python Fundamentals",
  unit_2: "Control Structures",
  unit_3: "Data Structures",
  unit_4: "Functions",
};

export const UNIT_ROMAN: Record<Unit, string> = {
  unit_1: "I",
  unit_2: "II",
  unit_3: "III",
  unit_4: "IV",
};

// Full label used on the /exercises group headers and the student exercise
// page top strip. E.g. "Unit III · Data Structures".
export function unitLabel(unit: Unit): string {
  return `Unit ${UNIT_ROMAN[unit]} · ${UNIT_TITLE[unit]}`;
}

// Unit → student_level mapping per Paula's curriculum:
//   Units I–II → week_1_2
//   Unit III  → week_3_6
//   Unit IV   → week_7_plus
export function levelForUnit(unit: Unit): StudentLevel {
  switch (unit) {
    case "unit_1":
    case "unit_2":
      return "week_1_2";
    case "unit_3":
      return "week_3_6";
    case "unit_4":
      return "week_7_plus";
  }
}

// When the instructor picks a level (or scaffolding suggests one), pick the
// most representative unit for that level. week_1_2 is ambiguous (Unit I or
// Unit II); we default to Unit II since the catalog currently has no pure
// Unit I exercises.
export function defaultUnitForLevel(level: StudentLevel): Unit {
  switch (level) {
    case "week_1_2":
      return "unit_2";
    case "week_3_6":
      return "unit_3";
    case "week_7_plus":
      return "unit_4";
  }
}

export function isUnit(x: unknown): x is Unit {
  return typeof x === "string" && (UNIT_IDS as readonly string[]).includes(x);
}
