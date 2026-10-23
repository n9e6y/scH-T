// Screenshots of the plan (Bebin Plan.dc.html 20a/b/c). Usage: node scripts/screens-plan.mjs [baseUrl] [outDir]
import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const API = process.env.API ?? "http://localhost:8000";
const OUT = process.argv[3] ?? "../qa/screens/plan";
const PID = "product_5ed27d0acc3f28d667f5abef";
mkdirSync(OUT, { recursive: true });
const s = await (await fetch(`${API}/api/products/${PID}/sellers?lat=35.6921&lng=51.4225`, { headers: { "X-Demo-Clock": "2026-10-21T17:40:00" } })).json();
const rows = [...s.listed.filter((r) => r.shop.location.mall).slice(0, 2), ...s.listed.filter((r) => !r.shop.location.mall).slice(0, 2)];
const plan = rows.map((r) => ({ shopId: r.shop.id, shopName: r.shop.name, lat: r.shop.lat, lng: r.shop.lng, mallId: r.shop.location.mall?.id ?? null,
  productId: PID, productTitle: "JBL PartyBox Stage 320", addedAt: new Date().toISOString() }));
const state = (clock, withPlan) => ({ state: { sessionId: "qa-plan", onboarded: true, demoClock: clock, compare: [], saved: [PID], plan: withPlan ? plan : [], planOrdered: false,
  lastViewed: { id: PID, title: "اسپیکر جی بی ال PartyBox Stage 320", min: 87800000, max: 115000000, sellers: 33, image: null },
  location: { kind: "area", name: "فردوسی", lat: 35.6921, lng: 51.4225 } }, version: 0 });

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const errors = [];
for (const [name, clock, withPlan] of [["20c-empty", "2026-10-21T17:40:00", false], ["20a-today", "2026-10-21T17:40:00", true], ["20b-friday", "2026-10-23T20:30:00", true]]) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, locale: "fa-IR", timezoneId: "Asia/Tehran" });
  await ctx.addInitScript((st) => localStorage.setItem("bebin", st), JSON.stringify(state(clock, withPlan)));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/plan`);
  await page.getByText(withPlan ? /تمام می‌شود/ : "هنوز برنامه‌ای نچیدی").first().waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(name);
  await ctx.close();
}
console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no errors");
await browser.close();
