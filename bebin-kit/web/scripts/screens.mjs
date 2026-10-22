// Screenshots of the designed screens at 390×844 for qa-reviewer (MILESTONES M3).
// Usage: node scripts/screens.mjs [baseUrl] [outDir]
import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3] ?? "../qa/screens/m3";
// Design frames are 390×844; SHORT=1 uses the real Safari viewport (390×664) to catch clipping.
const VIEWPORT = process.env.SHORT ? { width: 390, height: 664 } : { width: 390, height: 844 };
mkdirSync(OUT, { recursive: true });
const CLOCK = "2026-10-21T17:40:00"; // the design's «چهارشنبه ۲۹ مهر، ۱۷:۴۰»

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: VIEWPORT, locale: "fa-IR", timezoneId: "Asia/Tehran" });
const page = await ctx.newPage();
const shot = async (name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log(name); };
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));

await page.goto(`${BASE}/dev/splash`); await shot("00-splash");

// First run: no permission → GPS denied path.
await page.goto(BASE);
await page.waitForURL("**/onboarding");
await page.getByText("ونک", { exact: false }).first().waitFor({ state: "detached", timeout: 500 }).catch(() => {});
await page.getByRole("button", { name: "شیخ هادی" }).waitFor();
await shot("01a-onboarding");
await page.getByRole("button", { name: /موقعیت فعلی من/ }).click();
await page.getByText("موقعیتت رو پیدا نکردم").waitFor();
await shot("01b-gps-denied");
await page.getByRole("radio", { name: "فردوسی" }).click();
await shot("01b-gps-denied-selected");
await page.getByRole("button", { name: "ادامه با فردوسی" }).click();
await page.waitForURL(BASE + "/");
await page.evaluate((c) => {
  const s = JSON.parse(localStorage.getItem("bebin")); s.state.demoClock = c; localStorage.setItem("bebin", JSON.stringify(s));
}, CLOCK);
await page.reload();
await page.getByText("اطراف تو").waitFor();
await page.getByText(/فروشگاه باز/).first().waitFor({ timeout: 8000 }).catch(() => {});
await shot("02b-home-first-time");

await page.getByRole("button", { name: /نزدیک:/ }).click();
await page.getByRole("dialog").waitFor();
await shot("03-location-sheet");
await page.getByRole("button", { name: "بستن" }).click();

// Returning home: something viewed before.
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("bebin"));
  s.state.lastViewed = { id: "product_5ed27d0acc3f28d667f5abef", title: "اسپیکر جی بی ال مدل partybox Stage 320",
    min: 87800000, max: 115000000, sellers: 33, image: null };
  localStorage.setItem("bebin", JSON.stringify(s));
});
await page.reload();
await page.getByText("ادامه بده").waitFor();
await shot("02a-home-returning");

await page.goto(`${BASE}/search?q=${encodeURIComponent("گوشی سامسونگ زیر ۶۰ میلیون اقساطی")}`);
await page.getByText(/کالا در فهرست/).waitFor({ timeout: 10000 });
await page.waitForLoadState("networkidle");
await shot("search-interim");

await page.goto(`${BASE}/dev/components`);
await page.waitForLoadState("networkidle");
await page.screenshot({ path: `${OUT}/dev-components-full.png`, fullPage: true }); console.log("dev-components-full");

// Unknown location far from coverage (Vanak) → honest notice.
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("bebin"));
  s.state.location = { kind: "map", name: "ونک", lat: 35.7575, lng: 51.4098 }; s.state.lastViewed = null;
  localStorage.setItem("bebin", JSON.stringify(s));
});
await page.goto(BASE);
await page.getByText("اطراف تو").waitFor();
await page.waitForLoadState("networkidle");
await shot("02-home-out-of-coverage");

await browser.close();
if (errors.length) { console.log("ERRORS:\n" + errors.join("\n")); process.exitCode = 1; }
