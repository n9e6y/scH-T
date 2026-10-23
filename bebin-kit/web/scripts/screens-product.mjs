// Screenshots of the product screens (Bebin Product.dc.html 8–11) at 390×844.
// Usage: node scripts/screens-product.mjs [baseUrl] [outDir] [productId]
import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3] ?? "../qa/screens/product";
const PID = process.argv[4] ?? "product_5ed27d0acc3f28d667f5abef"; // JBL PartyBox Stage 320 (DEMO_CANDIDATES)
mkdirSync(OUT, { recursive: true });
const STATE = { state: { sessionId: "qa", onboarded: true, demoClock: "2026-10-21T17:40:00", compare: [], saved: [], plan: [], lastViewed: null,
  location: { kind: "area", name: "فردوسی", lat: 35.6921, lng: 51.4225 } }, version: 0 };

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, locale: "fa-IR", timezoneId: "Asia/Tehran" });
await ctx.addInitScript((s) => { if (!localStorage.getItem("bebin")) localStorage.setItem("bebin", s); }, JSON.stringify(STATE));
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => r.status() >= 400 && !r.url().includes("tile.openstreetmap") && errors.push(`${r.status()} ${r.url()}`));
const shot = async (name, full = false) => { await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); console.log(name); };

await page.goto(`${BASE}/product/${PID}`);
await page.getByText("فروشنده‌های برتر").waitFor(); await page.waitForLoadState("networkidle");
await page.getByText(/همه فروشنده‌ها/).waitFor();
await shot("8-product");
await page.locator("main").evaluate((m) => m.scrollTo(0, 700));
await shot("8-product-scrolled");

await page.goto(`${BASE}/product/${PID}/sellers`);
await page.getByText(/فروشگاه، ترتیب/).waitFor();
await shot("9a-sellers");
await page.getByRole("button", { name: /به برنامه اضافه کن/ }).first().click();
await shot("9a-plan-toast");
await page.getByRole("button", { name: /چرا این ترتیب/ }).click();
await shot("9b-why");
await page.keyboard.press("Escape");
await page.getByRole("radio", { name: "نقشه" }).click();
await page.waitForTimeout(1500);
await shot("10-map");

// Compare: three phones.
const s = await (await fetch(`http://localhost:8000/api/search?q=${encodeURIComponent("گوشی سامسونگ")}`)).json();
await page.goto(`${BASE}/compare?ids=${s.items.slice(0, 3).map((i) => i.id).join(",")}`);
await page.getByText("خلاصه").waitFor();
await shot("11-compare");

console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no errors");
await browser.close();
