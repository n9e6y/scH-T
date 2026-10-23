// Screenshots of the store screens (Bebin Store.dc.html 12–14). Usage: node scripts/screens-store.mjs [baseUrl] [outDir]
import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const API = process.env.API ?? "http://localhost:8000";
const OUT = process.argv[3] ?? "../qa/screens/store";
mkdirSync(OUT, { recursive: true });
const STATE = { state: { sessionId: "qa", onboarded: true, demoClock: "2026-10-21T17:40:00", compare: [], saved: [], plan: [], lastViewed: null,
  location: { kind: "area", name: "فردوسی", lat: 35.6921, lng: 51.4225 } }, version: 0 };
const sellers = await (await fetch(`${API}/api/products/product_5ed27d0acc3f28d667f5abef/sellers?lat=35.6921&lng=51.4225`)).json();
const known = sellers.listed.find((r) => r.shop.location.state === "known");
const mallOnly = sellers.listed.find((r) => r.shop.location.state === "mall_only");

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, locale: "fa-IR", timezoneId: "Asia/Tehran" });
await ctx.addInitScript((s) => { if (!localStorage.getItem("bebin")) localStorage.setItem("bebin", s); }, JSON.stringify(STATE));
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
const shot = async (name) => { await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log(name); };

await page.goto(`${BASE}/shop/${known.shop.id}`);
await page.getByText("ساعت کاری").first().waitFor();
await shot("12-store");
await page.getByRole("button", { name: "داخل پاساژ" }).click();
await page.getByText("داخل پاساژ پیدایش کن").waitFor();
await page.getByText("داخل پاساژ پیدایش کن").scrollIntoViewIfNeeded();
await shot("13a-in-mall");
if (mallOnly) {
  await page.goto(`${BASE}/shop/${mallOnly.shop.id}`);
  await page.getByRole("button", { name: "داخل پاساژ" }).click();
  await page.getByText("دقیقاً کجاست").scrollIntoViewIfNeeded();
  await shot("13b-in-mall-unknown");
}
await page.goto(`${BASE}/mall/${known.shop.location.mall.id}?shop=${known.shop.id}`);
await page.getByText(/فروشگاه باز از/).waitFor();
await shot("14-mall");
console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no errors");
await browser.close();
