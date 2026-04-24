import { LANG_DIRECTIVE_NAME, type Lang } from "./dict";

// Appended to a system prompt so Claude answers the student in their
// preferred language while keeping JSON keys, enum values, and dimension
// IDs in English (the rest of the system expects those exactly).
//
// We name the specific student-visible fields so the model doesn't also
// translate classification enums like "drift" / "revision" / "bug" or
// dimension IDs like "case_sensitivity".
export function langDirective(
  lang: Lang,
  studentFacingFields: readonly string[],
): string {
  if (lang === "en") return "";
  const fields = studentFacingFields.map((f) => `\`${f}\``).join(", ");
  return `

LANGUAGE
The student has selected ${LANG_DIRECTIVE_NAME[lang]} as their interface language.
Write every student-visible text field — ${fields} — in ${LANG_DIRECTIVE_NAME[lang]},
in a register appropriate for a CS1 student. JSON keys, enum values
(e.g. mode, classification, alignment, confidence), and any referenced
dimension IDs remain in English exactly as specified — do not translate them.
Write the student-visible text naturally in ${LANG_DIRECTIVE_NAME[lang]}; do
not insert English translations alongside it.`;
}
