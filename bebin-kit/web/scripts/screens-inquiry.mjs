// End-to-end ask-the-store run with screenshots (Bebin Inquiry 15–19, Seller 22). Speeds the simulator up via the
// demo director and restores it at the end. Usage: node scripts/screens-inquiry.mjs [baseUrl] [outDir]
import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const API = process.env.API ?? "http://localhost:8000";
const OUT = process.argv[3] ?? "../qa/screens/inquiry";
const PID = "product_5ed27d0acc3f28d667f5abef";
mkdirSync(OUT, { recursive: true });
const clockH = { "X-Demo-Clock": "2026-10-21T17:40:00" };
const STATE = (sid) => ({ state: { sessionId: sid, onboarded: true, demoClock: "2026-10-21T17:40:00", compare: [], saved: [], plan: [], lastViewed: null,
  location: { kind: "area", name: "فردوسی", lat: 35.6921, lng: 51.4225 } }, version: 0 });
const post = (p, body) => fetch(`${API}/api${p}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });

const sellers = await (await fetch(`${API}/api/products/${PID}/sellers?lat=35.6921&lng=51.4225`, { headers: clockH })).json();
const open = sellers.listed.filter((r) => r.open_now.state === "open" && r.stock.state === "unknown" && r.price.kind !== "verified");
const [A, B, C] = open;
await post("/demo/speed?speed=6");
await post("/demo/override", { shop_id: A.shop.id, outcome: "answer" });
await post("/demo/override", { shop_id: B.shop.id, outcome: "no_answer" });

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const errors = [];
async function phone(sid) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, locale: "fa-IR", timezoneId: "Asia/Tehran" });
  await ctx.addInitScript((s) => { if (!localStorage.getItem("bebin")) localStorage.setItem("bebin", s); }, JSON.stringify(STATE(sid)));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !m.text().includes("EventSource") && errors.push(m.text().slice(0, 200)));
  return page;
}
const page = await phone(`qa-${Date.now()}`);
const shot = async (p, name) => { await p.waitForTimeout(600); await p.screenshot({ path: `${OUT}/${name}.png` }); console.log(name); };

// 15a composer for store A from the sellers list.
await page.goto(`${BASE}/product/${PID}/sellers`);
await page.getByText(/فروشگاه، ترتیب/).waitFor();
await page.locator(`text=${A.shop.name}`).first().scrollIntoViewIfNeeded();
const rowA = page.locator("div.border-b", { has: page.getByText(A.shop.name, { exact: true }) }).first();
await rowA.getByRole("button", { name: "بپرس" }).click();
await page.getByText("موجودی هیچ‌وقت ثبت نمی‌شود").waitFor();
await page.getByRole("textbox").first().fill("مشکی");
await shot(page, "15a-composer");
await page.getByRole("button", { name: /^بفرست، / }).click();
await page.waitForURL(/\/inquiries\/[a-f0-9]+$/);
await shot(page, "17a-thread-waiting");
await page.getByText("فروشنده تأیید کرد").waitFor({ timeout: 30_000 });
await page.waitForTimeout(300);
await shot(page, "17b-stamp-moment");
await page.locator("main:visible").evaluate((m) => m.scrollTo(0, m.scrollHeight));
await shot(page, "17c-answered");

// 15b ask top 3 from the product page; B never answers → 18a.
await page.goto(`${BASE}/product/${PID}`);
await page.getByRole("button", { name: /فروشنده‌ی برتر بپرس/ }).click();
await page.getByText("جواب‌ها جداگانه").waitFor();
await shot(page, "15b-composer-top3");
await page.keyboard.press("Escape");
const inq = await (await fetch(`${API}/api/inquiries`, { method: "POST", headers: { "Content-Type": "application/json", "X-Session-Id": await page.evaluate(() => JSON.parse(localStorage.getItem("bebin")).state.sessionId), ...clockH },
  body: JSON.stringify({ shop_ids: [B.shop.id], product_id: PID, questions: ["price", "stock"] }) })).json();
await page.goto(`${BASE}/inquiries/${inq[0].id}`);
await page.getByText("به جایش این‌ها را ببین").waitFor({ timeout: 40_000 });
await shot(page, "18a-no-answer");

await page.goto(`${BASE}/inquiries`);
await page.getByText("پیگیری‌ها").first().waitFor();
await shot(page, "16-follow-ups");

// 22: seller panel on a second phone answers store C live; the shopper gets the toast (19).
const seller = await phone("qa-seller");
await seller.goto(`${BASE}/seller`);
await seller.getByText("کدام فروشگاه؟").waitFor();
await shot(seller, "22a-picker");
await seller.getByPlaceholder("نام فروشگاه یا پاساژ").fill(C.shop.name);
await seller.getByRole("radio", { name: new RegExp(C.shop.name) }).first().click();
await seller.getByRole("button", { name: /ورود به/ }).click();
await seller.getByText("پیام تازه‌ای نیست").or(seller.getByText("جواب بده")).first().waitFor();
await page.goto(`${BASE}/`);
await page.evaluate(async ({ api, shop, pid, clock }) => {
  const sid = JSON.parse(localStorage.getItem("bebin")).state.sessionId;
  await fetch(`${api}/api/inquiries`, { method: "POST", headers: { "Content-Type": "application/json", "X-Session-Id": sid, "X-Demo-Clock": clock },
    body: JSON.stringify({ shop_ids: [shop], product_id: pid, questions: ["price", "stock", "location"], detail: "مشکی" }) });
}, { api: API, shop: C.shop.id, pid: PID, clock: "2026-10-21T17:40:00" });
await seller.getByText("جواب بده").first().waitFor({ timeout: 15_000 });
await shot(seller, "22b-inbox");
await seller.getByText("جواب بده").first().click();
await seller.getByRole("button", { name: "موجود است" }).click();
await seller.getByRole("button", { name: "بفرمایید تشریف بیارید." }).click();
await shot(seller, "22c-reply");
await seller.getByRole("button", { name: "ارسال پاسخ" }).click();
await seller.getByText("پاسخ شما ثبت شد").waitFor();
await shot(seller, "22d-sent");
await page.getByText(/جواب داد/).first().waitFor({ timeout: 10_000 });
await shot(page, "19-reply-toast");

await post("/demo/speed?speed=1");
console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no errors");
await browser.close();
