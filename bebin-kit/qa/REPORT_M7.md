# QA report: full app + M7 polish (2026-10-23)

**Summary:** No trust-rule (P0) failures. Six P1 issues were found and fixed. Five of them were in the API: one hybrid-search regression, one need-finder bug, and three counting mismatches. The sixth was a clipped layout on the seller row. Lighthouse mobile: Home 89 / a11y 100 / best practices 100. Product 82–83 / 100 / 100, which is still below the 85 target (see "Open").

Screens: `qa/screens/{m3,search,product,store,plan,inquiry,assistant}/` at 390×844 (iPhone 13), local build. All were reviewed.

| Sev | Area | Finding | Evidence | Fix |
|---|---|---|---|---|
| P1 | Search (hybrid) | Distant vector neighbours slipped past strict filters: «اسپیکر جی بی ال زیر ۳ میلیون اقساطی…» showed AirPod covers instead of the empty state | `screens-search` timed out waiting for 6-empty | `embeddings.REL_FLOOR`: vector hits must score within 0.10 of the best one |
| P1 | Need-finder | «گوشی سامسونگ زیر ۶۰ میلیون اقساطی» asked about phone flex cables («این فلت و برد…») | 4b-unknowns-notice | `search._main_category`: use the category the query names, else the mode of the top 12 (was the top 40) |
| P1 | Search card | «۲۸ فروشنده» next to «۲۹ فروشنده در ۳ کیلومتری» | 4a-results-asking | The nearby count now counts distinct shops (also in `products._nearest`) |
| P1 | Compare | «۰ از ۲۴ فروشنده، ۲۷ نامشخص» | 11-compare | Installment counts are per distinct shop |
| P1 | Seller row | Verified price column clipped («۹۴,۹۷۰,۰۰۰ تو…») | 9a-sellers | The place block shrinks/wraps; the price block is `flex-none` |
| P2 | Stock pill | Stray space: «موجود است ، ساعت» | 9a-sellers | Text and time are in one span |
| P2 | Sellers map | Labels overlap in dense clusters | 10-map | Open (cosmetic) |
| P2 | Script | `screens.mjs` still waits for interim-search text («کالا در فهرست») | run log | Open (script only) |

## Checklists
- **Trust:** pass.
  - No stock claims without a stamp and time.
  - Listed price, price-change date and verified price stay separate (17c, 9a).
  - Unknowns are dashed «؟».
  - «پاسخ شبیه‌سازی‌شده» appears on threads.
  - No «۰ تومان».
- **RTL:** grep found no physical left/right classes. Latin text is isolated (22 `bdi`/`dir=ltr`). Digits are Persian.
- **Robustness:** pass.
  - With `LLM_ENABLED=false`, the assistant streams a wilt notice plus keyword results, and search falls back to FTS (`search_mode: fts`).
  - SSE now reopens with backoff after HTTP errors and polls every 8 s while disconnected (`lib/live.ts`).
- **PRODUCT_SPEC §6 states:** all present. The product page's top-sellers loading block became skeleton rows.

## Performance
- **Search:** a per-query pool cache (`search._pool`, 64 entries) means filter, sort and page changes take 5–20 ms instead of ~300 ms locally. Shop hours are parsed once per shop.
- **Product LCP:**
  - Done: the hero image gets `fetchPriority="high"` and the other gallery images are lazy; similar products load only near the viewport; preconnect to the API and image host; Lalezar is no longer preloaded; CORS preflight cached for 24 h. Result: 77 → 82–83.

## Open
- **Product LCP ≈4.7 s** (simulated slow 4G). The hero `<img>` renders only after JS + hydration splash + `/products/{id}`. A server-preload experiment didn't help, because React emitted the hint into the RSC stream, not the HTML head.
- **Real fix:** render the product hero server-side, outside the persisted-state splash gate. This is a structural change to `providers.tsx` and needs the owner's OK.
