import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeFa } from "./text";

const cases: [string, string][] = JSON.parse(
  readFileSync(join(__dirname, "../../api/tests/text_cases.json"), "utf-8"),
);

describe("normalizeFa mirrors api/app/text.py", () => {
  it.each(cases)("%s", (raw, expected) => expect(normalizeFa(raw)).toBe(expected));
  it("handles null", () => expect(normalizeFa(null)).toBe(""));
});
