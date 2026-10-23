// Screenshots of the search screens (Bebin Search.dc.html 4a–7) at 390×844.
// Usage: node scripts/screens-search.mjs [baseUrl] [outDir]
import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3] ?? "../qa/screens/search";
mkdirSync(OUT, { recursive: true });
const STATE = {
  state: {
    sessionId: "qa", onboarded: true, demoClock: "2026-10-21T17:40:00", compare: [], saved: [], lastViewed: null,
    location: { kind: "area", name: "فردوسی", lat: 35.6921, lng: 51.4225 },
  },
  version: 0,
};

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, locale: "fa-IR", timezoneId: "Asia/Tehran" });
await ctx.addInitScript((s) => { if (!localStorage.getItem("bebin")) localStorage.setItem("bebin", s); }, JSON.stringify(STATE));
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
const shot = async (name) => { await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log(name); };

// 7 loading: hold the API response.
await page.route("**/api/search**", async (r) => { await new Promise((res) => setTimeout(res, 2500)); await r.continue().catch(() => {}); });
await page.goto(`${BASE}/search?q=${encodeURIComponent("گوشی")}`);
await shot("7-loading");
await page.unroute("**/api/search**", undefined).catch(() => {}); await page.waitForTimeout(3000);

// 4a: broad query → need-finder asking.
await page.getByText("این‌طور فهمیدم").or(page.getByText("سؤال ۱")).first().waitFor();
await shot("4a-results-asking");
await page.getByRole("button", { name: "مقایسه", exact: true }).nth(0).click();
await page.getByRole("button", { name: "مقایسه", exact: true }).nth(0).click();
await page.getByRole("button", { name: /تا ۸۰ میلیون/ }).first().click().catch(() => {});
await page.waitForTimeout(1200);
await shot("4b-answered-tray");

// Demo query with understood chips + unknowns notice.
await page.goto(`${BASE}/search?q=${encodeURIComponent("گوشی سامسونگ زیر ۶۰ میلیون اقساطی")}`);
await page.getByText("نمایش بده؟").waitFor();
await shot("4b-unknowns-notice");

// 5 filter sheet.
await page.getByRole("button", { name: /همه فیلترها/ }).click();
await page.getByText("پاک کردن همه").waitFor();
await shot("5-filter-sheet");
await page.keyboard.press("Escape");

// 6 empty.
await page.goto(`${BASE}/search?q=${encodeURIComponent("اسپیکر جی بی ال زیر ۳ میلیون اقساطی نزدیک فردوسی")}&radius=1&open=1`);
await page.getByText(/چیزی نیست|چیزی پیدا نکردم/).waitFor();
await shot("6-empty");

console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no errors");
await browser.close();
