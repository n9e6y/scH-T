# Claude Design prompts: ببین (look)

## How to use these
- Run these prompts **in order, in one Claude Design project**, so the design system from prompt 1 carries through. Start this during M0–M2 while Claude Code builds the backend.
- Paste each prompt as is. Iterate in chat until you like the result, then move on. Two or three iterations per prompt is plenty. Spend your extra time on prompts 1, 4, and 6 (the system, sellers, and ask-the-store), because those carry the most judging weight.
- **Attach the pixel-art radish image to prompt 0 and prompt 1.** It is the mascot reference and the source of the palette.
- When a screen is approved, export it or take a screenshot into `design/exports/` named `NN-screen-name.png` (e.g. `04-sellers-list.png`, `06-inquiry-answered.png`). Claude Code's frontend agent implements from these files. Also export the mascot sprite sheet and the glasses symbol into `design/exports/brand/`.
- Every prompt reuses the **shared sample data** below. Paste it once at the start of the project (prompt 0) and refer to it afterwards.

---

## Prompt 0: project brief and sample data (paste first)

```
We're designing a mobile web app (PWA) called «ببین» ("look"): an in-person shopping assistant for Tehran. It helps a shopper pick a product, find nearby physical stores that list it, compare those stores (price, distance, opening hours, payment options), ask the sellers to confirm the current price and stock, handle failures with alternatives, and find the exact shop inside a mall.

Brand context: «ببین» is made by torob («ترب», which is Persian for "radish"). The brand mascot is a pixel-art radish (reference image attached). The visual identity will be built from just two hues, the radish's red and its leaves' green, and a pair of glasses drawn from the double o's: the "oo" in "look" (the app's English name) and the two o's in "torob". You'll get the details in the next prompt.

Hard requirements for every screen:
- Persian UI, fully right-to-left. Mobile frame 390×844. Persian digits everywhere (۰۱۲۳۴۵۶۷۸۹), Jalali dates, prices in Toman like «۳٬۸۵۰٬۰۰۰ تومان».
- English brand/model names appear inside Persian text (e.g. Nike Pegasus 41) and must read correctly.
- One-handed use: primary actions in the bottom 40% of the screen. Bottom navigation with 4 labelled tabs (right to left): خانه، دستیار، پیگیری‌ها، برنامه من.
- Honesty is the product's core. Three facts are always visually separate: the LISTED price (from the store's listing, may be old), the DATE the price last changed, and what the SELLER VERIFIED (with a time). Stock is NEVER known unless a seller confirmed it. Unknown values are shown explicitly, never left blank.

Shared sample data (use it in every screen so the designs stay consistent):
- User: سارا, location «ونک», now: چهارشنبه ۲۹ مهر، ساعت ۱۷:۴۰.
- Search: «کفش رانینگ زیر ۴ میلیون اقساطی»
- Products:
  1. کفش رانینگ مردانه Nike Pegasus 41, brand Nike, listed ۳٬۶۵۰٬۰۰۰ to ۳٬۹۸۰٬۰۰۰ تومان, 4 sellers
  2. کفش رانینگ Asics Gel-Excite 10, ۲٬۹۵۰٬۰۰۰ تومان, 2 sellers
  3. کفش پیاده‌روی Skechers Go Walk 7, ۲٬۴۸۰٬۰۰۰ تومان, 1 seller
  4. کفش رانینگ Adidas Duramo SL, ۲٬۷۵۰٬۰۰۰ تا ۳٬۱۰۰٬۰۰۰ تومان, 3 sellers
- Stores for Pegasus 41:
  A. «کفش آریا»: پاساژ نگین ونک، طبقه ۲، واحد ۲۱۴ · ۸۰۰ متر (۱۰ دقیقه پیاده) · open until ۲۱:۰۰ · listed ۳٬۶۵۰٬۰۰۰ · price changed ۲۷ مهر (fresh) · installments ✓, ترب‌پی ✓ · گارانتی ۶ ماهه
  B. «اسپرت سنتر میلاد»: خیابان ملاصدرا · ۱٫۴ کیلومتر · closes in ۴۵ minutes · listed ۳٬۷۹۰٬۰۰۰ · price changed ۲ مهر (stale: «قیمت قدیمی») · installments unknown
  C. «دونده»: مجتمع تجاری آفتاب، floor/unit not recorded · ۲٫۳ کیلومتر · opening hours unknown · listed ۳٬۹۸۰٬۰۰۰ · changed ۲۵ مهر · installments ✓
  D. «ورزش پلاس»: ۳٫۱ کیلومتر · closed now, opens tomorrow ۱۰:۰۰ · listed ۳٬۷۲۰٬۰۰۰
  Related store (category match only, product NOT in its listing): «کتانی‌سرا»: ۹۰۰ متر
- Seller reply example (from store A, at ۱۷:۵۲): price now ۳٬۷۰۰٬۰۰۰, in stock in size ۴۳, open until ۲۱:۰۰, «طبقه دوم، روبه‌روی پله‌برقی». Message: «سلام، بله سایز ۴۳ موجوده. قیمت امروز ۳ میلیون و ۷۰۰ هست. تا ساعت ۹ شب هستیم.»

Don't design anything yet. Confirm you understand, and tell me in 3 lines what you think the product's personality should be.
```

---

## Prompt 1: visual identity and design system board

```
Create the visual identity and a design-system board for «ببین» ("look"), a product by torob («ترب» = radish). The attached pixel-art radish is the mascot reference and the source of the palette.

The identity rests on three ideas, and only three:

1. TWO HUES, MANY SATURATIONS.
The entire palette is red (the radish body) and green (its leaves). No blue, teal, yellow, orange, or purple anywhere in the UI. All variety comes from saturation and lightness: the neutrals are these same reds and greens with the saturation drained out, and the signals are the same hues pushed to full strength.
The rule that turns this into meaning: SATURATION = CERTAINTY. The surer we are about a fact, the more saturated it is drawn.
  • Seller-verified → the most saturated green in the whole system (the stamp).
  • Listed and fresh → normal ink text, with a light leaf tag for the date.
  • Listed but old → faded, "wilted" olive: visibly drained, like a leaf that has sat on the shelf too long.
  • Unknown → zero saturation, dashed outline.
Red has two ends. At its bright, pinkish end it is RADISH: the brand and every call to action. At its dark, purplish end it is BEET: closed, out of stock, error. They never take the same form: radish is FILLED (buttons, the active tab, the mascot); beet is never a filled button, only text + icon on a pale beet tint.

2. THE GLASSES.
The app is called «ببین», "look", and its English wordmark "look" has the double o built in: the "oo" is a pair of round glasses, the two lenses joined by a short bridge. The name and the symbol say the same thing: look closely, check before you go. The company wordmark "torob" uses the exact same lenses for its two o's, with the r between them acting as the bridge (its arch joins the lenses at their inner top edge), so product and maker read as one family. The glasses on their own (two rings + bridge) are the app's symbol: favicon, loading indicator, the "checking…" motif. The mascot puts on the same glasses whenever it is searching or checking something.
The Persian wordmark «ببین» is set in Lalezar; its row of dots below the letters can echo the glasses' round shapes, but don't force the lenses into the Persian letters. The glasses live in the Latin "look" and sit beside «ببین» as the symbol.

3. «تربچه», THE PIXEL RADISH.
Follow the reference: chunky pixels on a 24×24 grid, a dark beet outline, a two-tone radish body with a lighter highlight, two green leaves, dot eyes, a small mouth, a white root tip. Always rendered at whole-number scales with crisp, unsmoothed pixels. The mascot is for identity moments only: splash, onboarding, empty states, the verified moment, the assistant's avatar, offline/error. Never more than one per screen, never inside lists, cards, or receipt rows. Functional screens stay flat, quiet, and disciplined; the mascot is the reward, not the wallpaper.
Poses (same sprite, small changes only): default; searching (wearing the look glasses, pupils shifting); asking (holding a tiny speech bubble); waiting (small pixel clock above the head); happy (^ ^ eyes, holding the stamp); sleepy (store closed: line eyes and a «z»); wilted (offline/error: leaves drooping and desaturated); confused (no results: glasses pushed up, «؟» above).

The receipt and the stamp stay. Seller lists read like receipt lines (name … dotted leader … price), and anything a seller verified gets a circular double-ring STAMP (مهر), slightly rotated, in stamp green, with a tiny pixel radish in its center. The stamp is the one place where the brand's playfulness touches functional UI.

Type: "Vazirmatn" for everything functional. "Lalezar" ONLY for identity moments (the «ببین» wordmark, the home hero line, empty-state headlines); its chunky, bouncy letters sit naturally next to the pixel mascot. The Latin "look" and "torob" wordmarks are custom lettering: lowercase, heavy, rounded geometric, built so every o is a perfect circle of equal stroke and the lenses are identical across both words.

Starting palette (refine values if needed, but keep the roles and the two-hue rule):
Neutrals (drained green):
  soil #1B2420 (text; also the "night" surface for splash, toasts, app icon background)
  stem #56615B (secondary text / "listed" state)
  ash #8E9892 (dashed outlines and icons for unknown; never for text)
  line #E1E6E1
  flesh #F7F8F6 (page background: the white inside of a radish, faintly green, NOT cream)
  white (cards)
Red:
  radish #C8385A (primary actions, links, active tab, selected chips, route line, user's location; passes AA with white text)
  radish-bright #DE5274 (mascot and illustration only, never behind text)
  radish-night #F08CA4 (radish on soil surfaces, e.g. toast actions)
  radish-tint #FBEFF2 (selected chip fill, today's row, soft highlights)
  beet #6E1534 on beet-tint #F6E4EA (closed, out of stock, errors; text + icon only)
Green:
  leaf #5E8F3E (open now, fresh-date tags, positive map pins, mascot leaves) on leaf-tint #EEF5E8
  wilt #6F6C3A on wilt-tint #F2F1E3 (old price, closing soon: the drained, olive "wilted leaf")
  stamp #137A43 (ONLY seller-verified facts; the most saturated color in the system)

Show a SATURATION STRIP on the board: each hue from 0% to full, every step labelled with the role it plays, so the system's logic is readable at a glance.

Accessibility (non-negotiable, because red/green is the most common color-blind pair):
- Every red-vs-green distinction must ALSO differ in lightness, shape/icon, and text label.
- Put a deuteranopia simulation of all trust components on the board and confirm every state is still distinguishable.

Avoid: any hue outside red/green, cream or beige backgrounds, gradient washes, glossy or 3D radish renders, anti-aliased or smoothed versions of the mascot, the mascot as decoration on functional screens, identical rounded cards with the same grey shadow, all-caps-style labels, decorative numbering, emoji icons. Use radius by hierarchy (sheets 24, product cards 16, buttons 12, chips pill, receipt rows square inside a rounded group). One soft shadow for the whole UI; pixel elements carry their own outline and get no shadow.

Visual rules for trust (very important):
- Saturation = certainty.
- Solid = known. DASHED OUTLINE = unknown (e.g. «موجودی نامشخص», «اقساط؟»).
- Stamp green appears only when a seller confirmed something, always with a time.
- Radish = "you can do this". Beet = "something's wrong". Never swap them.
- Color is never the only signal: always icon + text.

On one board (390-wide columns), show:
- Logo set: the "look" glasses wordmark; the «ببین» Lalezar wordmark locked up with the glasses symbol; the bilingual lockup «ببین» + "look"; the glasses symbol alone; the "torob" glasses wordmark; the endorsement line «ببین · از torob»; the app icon (mascot head wearing the glasses, on soil); favicon at 32 and 16 px.
- Mascot sheet: all eight poses at 1× and 4×, plus do/don't (crisp vs smoothed, one per screen, never in a list).
- Palette with roles and the saturation strip, type scale (Persian sample text, generous line-height), spacing scale.
- Buttons (primary, secondary, ghost, destructive), chips (filter on/off, removable "understood" chip), segmented control «متعادل / ارزان‌ترین / نزدیک‌ترین».
- TRUST COMPONENTS with every variant:
  • PriceBlock: listed (with a fresh leaf date tag «تغییر قیمت: ۲۷ مهر»), listed + stale (wilt «قیمت قدیمی، ۲ مهر», price text itself slightly faded), verified (price + mini stamp «تأیید فروشنده ۱۷:۵۲»), none («قیمت ثبت نشده»).
  • StockTag: unknown (dashed ash, with a small «بپرس» action in radish), in stock (stamp style + time), out of stock (beet + time).
  • OpenStatus: «باز است، تا ۲۱:۰۰» (leaf) / «۴۵ دقیقه دیگر می‌بندد» (wilt) / «بسته است، فردا ۱۰:۰۰ باز می‌شود» (beet) / «ساعت کاری نامشخص» (dashed ash).
  • PaymentBadges: اقساطی, ترب‌پی, کالابرگ, ارسال فوری, each in known and unknown (dashed «؟») variants.
  • TierLabel: «در فهرست فروشگاه» vs «فروشگاه مرتبط» (+ info icon).
  • The VerifiedStamp, full size, as a hero detail.
  • SimulatedLabel: tiny «پاسخ شبیه‌سازی‌شده» with an info icon.
  • ReasonLine: «ارزان‌ترین قیمت ثبت‌شده، ۸۰۰ متر تا اینجا، اقساطی».
- A SellerRow in receipt style using store A, and a ProductCard using product 1.
- Bottom nav (line icons in stem, active tab in radish), bottom sheet with handle, toast with an action (soil surface, action in radish-night).

Before drawing, write a short plan (palette, type, mascot, layout, principles), check it isn't a generic template look and that it truly uses only two hues, then build.
```

---

## Prompt 2: onboarding, location, and home

```
Using the system board, design these mobile screens (390×844, RTL):

0. Splash / PWA launch: soil background, the mascot in its default pose at 8×, the «ببین» lockup below, «از torob» small at the bottom. Nothing else.

1. Onboarding / location: one screen. Lalezar headline about getting to the right shop on the first try, with the mascot in its searching pose (wearing the glasses) above it. Three ways to set location: «موقعیت فعلی من» (GPS), a list of neighbourhood presets (ونک، تجریش، میدان انقلاب، شهرک غرب، صادقیه…), «روی نقشه انتخاب کن». «فعلاً رد شو» as a quiet link. Include the GPS-denied variant (mascot in its confused pose) with a helpful message that leads to the presets.

2. Home:
- Top bar: «ببین» wordmark with the glasses symbol + location chip «نزدیک: ونک ▾».
- Search bar with a rotating example placeholder («کفش رانینگ زیر ۴ میلیون…»); the search icon is the glasses symbol.
- Category row (line icons in stem + labels: کفش و پوشاک ورزشی، موبایل، لپ‌تاپ، لوازم خانگی، آرایشی، اسباب‌بازی…). No colored icon fills.
- Assistant entry: a compact, inviting block «بگو چی می‌خوای، من می‌گردم» with the mascot head (glasses on) as a small avatar, opening the assistant.
- "Continue": an open follow-up card («کفش آریا جواب داد: موجود است» with mini stamp) and the last viewed product.
- "Around you": nearby malls/arcades with «۱۲ فروشگاه باز» counts (leaf dot + text).
Above the fold: search, categories, assistant entry. Also design the first-time empty variant of Home (no history), where the mascot in its default pose may appear once in place of the "Continue" section.

3. Location sheet: bottom sheet to change location (GPS, presets, map pick).
```

---

## Prompt 3: search results, filters, and need-finder

```
Design the search experience for the query «کفش رانینگ زیر ۴ میلیون اقساطی»:

1. Results screen:
- Search bar with the query; under it, "understood" removable chips (radish-tint) showing what the app parsed: «حداکثر ۴ میلیون»، «اقساطی»، «نزدیک ونک».
- Need-finder strip (because the query is broad): one question at a time as chips, e.g. «برای چه کاری؟» → دویدن / پیاده‌روی / باشگاه، with «رد شو». Show the strip in its question state and its collapsed state after answering.
- Horizontal filter chip bar: قیمت، اقساطی، ترب‌پی، کالابرگ، الان باز، فاصله، برند، + «همه فیلترها». Active chips in radish-tint with a radish outline.
- Sort control: مرتبط‌ترین / ارزان‌ترین / نزدیک‌ترین فروشنده / بیشترین فروشنده.
- 2-column product grid using the 4 sample products. Each card: image, Persian title, brand/model (LTR), listed price range, «۴ فروشنده»، nearest seller distance, a small freshness hint (leaf when fresh, wilt when old), and a «چرا این؟» reason line (e.g. «۳ فروشنده در ۲ کیلومتری، اقساطی»). Add-to-compare and save actions. No mascot on cards.
- Compare tray docked above the bottom nav after adding 2 products: thumbnails + «مقایسه (۲)» in radish.
- An inline honest notice when unknowns were filtered out: «۴ فروشنده با وضعیت اقساط نامشخص حذف شدند. نمایش بده؟» (dashed ash outline, since it's about unknowns).

2. Full filter sheet: RTL price range slider (min on the right, track and thumbs in radish) with typed min/max, payment toggles, open now, distance radius chips (۱/۳/۵/۱۰ کیلومتر/همه), brand list with search, «اعمال (۲۳ نتیجه)» sticky radish button that shows the live count.

3. Empty results state: Lalezar headline, the mascot in its confused pose, an explanation of which filter is the most restrictive, and a one-tap relax action («بدون فیلتر اقساطی ببین»).

4. Loading skeleton for the grid: flat flesh/line blocks, no shimmer gradient, with a small glasses symbol whose lenses blink while loading.
```

---

## Prompt 4: product detail, sellers (list and map), and compare

```
Design these screens for product 1 (Nike Pegasus 41):

1. Product detail:
- Image gallery, title, brand/model, listed price range, «۴ فروشنده در فهرست».
- Trust summary line: «قیمت‌ها ثبت‌شده‌اند؛ موجودی را باید از فروشنده پرسید.»
- Key specs table (6 rows + «همه مشخصات»).
- Sellers preview: top 3 receipt rows + «همه فروشنده‌ها».
- Similar products strip with "why similar" («همان دسته، قیمت نزدیک»).
- Sticky bottom action: «از ۳ فروشنده‌ی برتر بپرس» (radish) + secondary compare/save.

2. Sellers screen (the most important screen of the app):
- Header with product mini-summary, location chip, filter chips (اقساطی، الان باز، …).
- Segmented ranking control «متعادل / ارزان‌ترین / نزدیک‌ترین».
- List/Map toggle.
- Receipt-style SellerRows for stores A–D. Each: name + mall/floor/unit if known; dotted leader to the price block (with freshness or stamp); line 2: distance + ETA («۱۰ دقیقه پیاده، تخمینی»), open status at arrival, payment badges (dashed when unknown); line 3: reason line; actions: «بپرس»، «مسیر»، «به برنامه».
- Show store A with a VERIFIED price stamp (after reply), store B with the wilted stale-price warning and closing-soon, store C with unknown hours (dashed), store D closed (beet). Let the saturation rule be visible down the list: A is the most vivid row, B looks faded, C has dashed gaps.
- Below: collapsible «فروشگاه‌های مرتبط» section with «کتانی‌سرا», no price, with the explanation that the product isn't in its listing.
- «چرا این ترتیب؟» link → a bottom sheet with score bars (قیمت، فاصله، باز بودن، به‌روز بودن قیمت، تأیید فروشنده) in soil, the verification bar in stamp green, and the mode weights.

3. Map view of the same sellers: map tiles desaturated to a pale green-grey so only our two hues carry meaning. Pins by open status, each with its own glyph as well as color: leaf = open, wilt = closing soon, beet = closed, dashed ash = hours unknown. A mall pin in soil with a count badge. The user's location as a radish dot with a white ring. A tapped pin shows a mini SellerRow sheet.

4. Compare (products 1, 2, 4): sticky product headers, horizontally scrollable table with sticky row labels, differences marked with bold text and a small soil dot (not red/green fills, which would read as bad/good), «نامشخص» for missing specs (dashed), "best for" labels («ارزان‌ترین»، «نزدیک‌ترین فروشنده»، «بیشترین فروشنده») and a one-line verdict per product, «فروشنده‌ها» action per column.
```

---

## Prompt 5: store page and mall finder

```
Design:

1. Store page for «کفش آریا»:
- Header: name, categories, open status; for real-name stores (variant) an Instagram/website link with a subtle "real store" mark (small soil outline badge with the glasses symbol).
- Week hours table (شنبه to جمعه) with today highlighted in radish-tint, including a split-shift day (۱۰–۱۴ و ۱۶–۲۱) and Friday closed (beet text + icon).
- Address with copy; mall card: «پاساژ نگین ونک، طبقه ۲، واحد ۲۱۴».
- Payment features list with known (leaf check) / ندارد (stem, plain) / نامشخص (dashed) states.
- Contact channels as stem line icons with an honest note that phone numbers are not real in this demo; primary action «از فروشگاه بپرس».
- Recent verifications («قیمت Pegasus 41 تأیید شد، ۱۷:۵۲» with mini stamp).
- Searchable list of this store's listed products.

2. "Find it inside the mall" card, two variants:
- Known: floor and unit, a simple floor strip showing neighbouring known units as landmarks (target unit in radish, others in line/stem), «مسیر تا پاساژ».
- Unknown (store C): «طبقه و واحد ثبت نشده» (dashed), action «از فروشنده بپرس دقیقاً کجاست», and an optional «نتیجه‌ی جست‌وجوی وب» row clearly marked as unverified (dashed ash outline, zero saturation).

3. Mall page «پاساژ نگین ونک»: address and directions, «۱۲ فروشگاه باز از ۳۴»، directory grouped by floor (زیرزمین، همکف، طبقه ۱، طبقه ۲…), search within the mall.
```

---

## Prompt 6: ask the store, follow-ups, and alternatives (the "wow" flow)

```
Design the inquiry flow, the heart of the product's intelligence:

1. Composer bottom sheet opened from store A («از فروشگاه بپرس»):
- Checklist of questions, smartly pre-checked: قیمت امروز، موجودی (with a small text field «سایز/رنگ: ۴۳»), ساعت کاری امروز، جای دقیق در پاساژ، شرایط اقساط، «برام نگه دارید تا …».
- Optional note. Recipient(s) shown. Send button (radish) in the thumb zone.
- Variant: "ask top 3" with three store chips.
- Variant: warning when the store is closed now («الان بسته است؛ احتمالاً بعد از ساعت ۱۰ جواب می‌دهد») in wilt tint with a moon icon.

2. Follow-ups tab (پیگیری‌ها): inquiries grouped by product, status chips (ارسال شد، دیده شد، جواب داد، جواب نداد), unread dots in radish.

3. Inquiry thread for store A:
- Compact timeline: ارسال شد ۱۷:۴۱ → تحویل شد → دیده شد → جواب داد ۱۷:۵۲. While waiting, the glasses symbol blinks at the open end of the timeline.
- Answer card: structured answers each with stamp-green verified marks (price ۳٬۷۰۰٬۰۰۰ vs. listed ۳٬۶۵۰٬۰۰۰ shown as a small change, «موجود است، سایز ۴۳», «تا ۲۱:۰۰ باز است», «طبقه دوم، روبه‌روی پله‌برقی»), the seller's message bubble, and the «پاسخ شبیه‌سازی‌شده» label.
- The big VerifiedStamp moment: design the frame where the stamp has just landed. This is the one place the mascot appears inside a flow: small, in its happy pose, beside the stamp. Everything around it stays calm so the stamp is the most saturated thing on screen.
- Next actions: «به برنامه اضافه کن»، «مسیر».

4. Failure states with alternatives:
- Store B didn't answer: timeline ends with «جواب نداد (۹۰ ثانیه)» in wilt, actions «یادآوری دوباره»/«لغو», and an AlternativesCard.
- Store C said out of stock: beet «ناموجود، ۱۷:۵۵», AlternativesCard.
- AlternativesCard: tiered sections: «همین مدل، فروشنده‌ی دیگر» → «مدل مشابه در همین فروشگاه» → «مدل مشابه در نزدیکی» → «فروشگاه‌های مرتبط». Each item with a reason («همین مدل، ۱٫۲ کیلومتر دورتر، تا ۲۱ باز است») and an action. The card is a fresh start, so it stays neutral (white, soil text, radish actions), with no beet carried over.

5. Toast that appears anywhere in the app: «کفش آریا جواب داد» with a «ببین» action (soil surface, mini stamp, action in radish-night).
```

---

## Prompt 7: visit plan

```
Design «برنامه من» (visit plan):
- Header: start «از ونک، ساعت ۱۸:۰۰» (editable), mode toggle پیاده/ماشین, «تا ۱۹:۲۰ تمام می‌شود».
- Ordered stops (drag handles), numbered in small radish circles and joined by a thin radish route line: stop 1 «کفش آریا» (پاساژ نگین، طبقه ۲) with ETA, «وقتی برسی باز است» (leaf) and verified stock stamp; stop 2 «اسپرت سنتر میلاد» with a wilt warning «وقتی برسی بسته است» and a one-tap «جایگزین کن».
- Stores in the same mall grouped as one stop with sub-units.
- Per stop: «مسیر» action; global «شروع» button (radish) in the thumb zone.
- Variant: the demo clock set to «جمعه ۲۰:۳۰», showing multiple closed warnings (beet for closed now, wilt for will be closed on arrival) and suggested swaps.
- Saved section below (saved products and stores).
- Empty state: Lalezar headline, the mascot in its default pose, invitation to add stores from the sellers list.
```

---

## Prompt 8: the assistant (chat with interactive blocks)

```
Design the assistant tab («دستیار»):
- The assistant's avatar is the mascot head wearing the glasses (pixel, 32 px, crisp). It is the only mascot on this screen.
- Conversation: user message «یه کفش رانینگ خوب تا ۴ میلیون می‌خوام، اقساطی، نزدیک ونک» (user bubbles in radish-tint, assistant text on flesh, no heavy bubbles).
- Assistant: a subtle tool-status line in progress with the blinking glasses symbol («دارم فروشنده‌های نزدیک رو مقایسه می‌کنم…»), then one clarifying question as chips («برای دویدن روی تردمیل یا خیابان؟»), then a short reply (max 2 sentences) followed by INTERACTIVE BLOCKS that reuse the app's components: a compact product list (3 items with reasons), then a seller list block (receipt rows), then a confirmation block «از ۳ فروشنده‌ی برتر بپرسم؟» with «بپرس» / «نه فعلاً».
- After confirming: an inquiry status block that updates live (one answered with stamp).
- Composer at the bottom with suggestion chips («ارزون‌ترش؟»، «فقط اونایی که الان بازن»، «برنامه‌ی بازدید بچین»).
- Notice variant when the AI is unavailable: «دستیار هوشمند در دسترس نیست؛ جست‌وجوی ساده انجام شد.» in wilt tint, the avatar switched to the wilted pose, with normal results below.
The chat must feel like part of the app, not a separate chatbot: same cards, same trust visuals, same two hues.
```

---

## Prompt 9: seller panel, about, and system states

```
Design:

1. Seller panel («پنل فروشنده», separate minimal chrome, for a shop owner on their phone). Make it instantly distinguishable from the shopper app: a soil top bar, and the mascot avatar wearing a small shopkeeper apron. Here the seller holds the stamp, so the main send action is the ONE filled stamp-green button in the whole product: what the seller sends becomes a verified fact.
- Shop picker (search + quick picks).
- Inbox with a new inquiry from «سارا» about Pegasus 41, size ۴۳, asking price, stock, hours, location.
- Quick-answer form: موجود؟ (بله / خیر), price prefilled with the listed price (editable), today's hours, location text, message field with quick replies, big «ارسال پاسخ».
- Sent confirmation state: the stamp lands on the answer.

2. About / settings: the «ببین» / "look" lockup and the torob glasses wordmark at the top, data snapshot date, coverage note (about 10% of Tehran stores in selected areas), honest caveats (stock not in the data, phone numbers not real, replies simulated), «پاک کردن داده‌های من», and a «کارگردان دمو» section (force next reply outcome per shop; set the clock, e.g. جمعه ۲۰:۳۰; simulator speed).

3. System states: offline banner (soil) + offline page (mascot wilted), generic error with retry (mascot wilted), image placeholder with a category icon in ash on flesh (no mascot), SSE reconnecting indicator (very subtle: the tiny glasses symbol blinking), PWA install prompt using the app icon (mascot head with glasses on soil).
```

---

## Prompt 10: consistency pass and handoff

```
Review every screen we made against the system board and fix inconsistencies: same names for the same actions everywhere (e.g. «بپرس», «به برنامه اضافه کن» → toast «به برنامه اضافه شد»), same trust visuals, logical RTL alignment, Persian digits everywhere, thumb-zone primary actions, 44px touch targets, contrast.
Also check the identity rules on every screen: only red and green hues (including map tiles and illustrations); saturation matches certainty (verified is always the most saturated thing on screen); radish is never used for errors and beet is never a filled button; at most one mascot per screen and never inside lists; mascot pixels crisp at whole-number scales; every red/green distinction survives a deuteranopia check.

Then produce a handoff sheet for the developer:
- Final tokens (colors with hex + role, including the full red and green saturation ramps; type scale; spacing; radii; the one shadow).
- Brand assets: the "look" and "torob" glasses wordmarks and the glasses symbol as SVG; the «ببین» lockups; app icon and favicons; the mascot sprite sheet (24×24 grid, all poses) exported as SVG with shape-rendering="crispEdges" and as PNG at 1×, 2×, 4×, 8×, with the note to render it with image-rendering: pixelated.
- Component list with variants and states (especially the trust components and the stamp's rotation/size/animation: scale 1.4→1, rotate −14°→−6°, ~220ms).
- Per screen: layout notes, which components it uses, and any interaction notes (sheets, reorder animation, sticky elements).
```