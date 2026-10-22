import { describe, expect, it } from "vitest";
import { distance, duration, faDigits, jalaliDate, toman, tomanRange } from "./format";

describe("format", () => {
  it("toman", () => {
    expect(toman(3850000)).toBe("۳٬۸۵۰٬۰۰۰ تومان");
    expect(toman(0)).toBeNull();
    expect(toman(null)).toBeNull();
  });
  it("range", () => {
    expect(tomanRange(3650000, 3980000)).toBe("۳٬۶۵۰٬۰۰۰ تا ۳٬۹۸۰٬۰۰۰");
    expect(tomanRange(3650000, 3650000)).toBe("۳٬۶۵۰٬۰۰۰");
  });
  it("distance matches the API", () => {
    expect(distance(800)).toBe("۸۰۰ متر");
    expect(distance(978)).toBe("۱ کیلومتر");
    expect(distance(1240)).toBe("۱٫۲ کیلومتر");
  });
  it("duration and digits", () => {
    expect(duration(10)).toBe("۱۰ دقیقه");
    expect(faDigits("21:00")).toBe("۲۱:۰۰");
  });
  it("jalali", () => expect(jalaliDate("2026-10-13T00:02:35+00:00")).toBe("۲۱ مهر"));
});
