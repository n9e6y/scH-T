// One live assistant conversation (uses the real LLM: a few thousand tokens). Usage: node scripts/screens-assistant.mjs
import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3] ?? "../qa/screens/assistant";
mkdirSync(OUT, { recursive: true });
const STATE = { state: { sessionId: `qa-a-${Date.now()}`, onboarded: true, demoClock: "2026-10-21T17:40:00", compare: [], saved: [], plan: [], lastViewed: null,
  location: { kind: "area", name: "فردوسی", lat: 35.6921, lng: 51.4225 } }, version: 0 };
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, locale: "fa-IR", timezoneId: "Asia/Tehran" });
await ctx.addInitScript((s) => { if (!localStorage.getItem("bebin")) localStorage.setItem("bebin", s); }, JSON.stringify(STATE));
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const shot = async (name) => { await page.waitForTimeout(600); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log(name); };

await page.goto(`${BASE}/assistant`);
await page.getByText("بگو چی می‌خوای").waitFor();
await shot("21-empty");
await page.getByLabel("پیام به دستیار").fill(process.env.Q ?? "یه اسپیکر جی بی ال اقساطی نزدیک فردوسی می‌خوام؛ از فروشنده‌های نزدیک بپرس");
await page.getByRole("button", { name: "بفرست" }).click();
await page.getByText(/دارم/).first().waitFor();
await shot("21a-running");
await page.waitForFunction(() => !document.querySelector('button[aria-label="بفرست"] svg circle.animate-blink-step'), null, { timeout: 60_000 });
await shot("21b-answer");
console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no errors");
await browser.close();
