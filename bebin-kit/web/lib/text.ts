// Mirror of api/app/text.py (ARCHITECTURE §4). Same test cases: api/tests/text_cases.json.
const CHAR_MAP: Record<string, string> = {
  "ي": "ی", "ى": "ی", "ئ": "ی", "ك": "ک", "ة": "ه", "ۀ": "ه", "ؤ": "و",
  "إ": "ا", "أ": "ا", "آ": "ا", "ٱ": "ا", "٬": "", "٫": ".",
};
for (let i = 0; i < 10; i++) {
  CHAR_MAP[String.fromCharCode(0x06f0 + i)] = String(i);
  CHAR_MAP[String.fromCharCode(0x0660 + i)] = String(i);
}
const CHARS = new RegExp(`[${Object.keys(CHAR_MAP).join("")}]`, "g");
const DIACRITICS = /[ً-ٰٟـ]/g;
const ZERO_WIDTH = /[​-‏‪-‮⁦-⁩﻿]/g;

export function normalizeFa(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(CHARS, (c) => CHAR_MAP[c])
    .replace(DIACRITICS, "")
    .replace(ZERO_WIDTH, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
