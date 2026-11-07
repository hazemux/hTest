# ChargerQuick Storefront — Developer Handbook

You are working on the customer-facing store of a business that already has
**real customers and real revenue** on its old platform. This document is not
style advice — nearly every rule in it exists because the opposite was tried,
shipped, or caught in review, in this repo, and the commit history has the
receipts. When a rule sounds paranoid, `git log --grep` its keyword and read
the story.

**The product:** Arabic-first store selling game top-ups and app credits
across the Gulf (KSA is #1, UAE #2, Germany #3 — Germany pays ~95% by bank
transfer). Customers are mostly on mobile data. Arabic is the default
language, not a translation.

---

## 0. The map

| What | Where |
|---|---|
| This app | `storefront/` — Next.js App Router, TypeScript strict, Tailwind v4 |
| The API | Laravel, same repo root. You talk to it **only** over HTTP |
| API contract | `openapi/v1.yaml` — generates your types |
| Pre-production | `https://stage.chargerquick.net` (API: `stage-api.`; team-only, `docs/runbooks/cpanel-server.md`) |
| The real store | `https://chargerquick.net` — **WooCommerce, live, untouchable** until cutover (ADR 0014) |
| Where everything is | `docs/START_HERE.md` → `docs/architecture/CURRENT.md` (what exists), `docs/ROADMAP.md` (what remains) |
| Decisions | `docs/decisions/` — 0014 (domains/cutover), 0015 (pricing/tax/methods), 0027 (search), 0031 (Zaraz) matter most to you |
| Agent workflow | `.claude/skills/cq-storefront/SKILL.md` (with `cq-implement`) |

Nothing you deploy is customer-facing yet. It becomes customer-facing at a
planned cutover, which is exactly why the bar is "correct", not "demo".

---

## 1. Money — the rules that are never yours to relax

**The storefront computes no money. Ever.** No add, no multiply, no percent,
no rounding, no currency conversion. Every figure on every screen is a string
the server produced, displayed verbatim through `Intl` (`formatMoney` in
`lib/i18n/messages.ts`). If you ever find yourself writing arithmetic near a
price, stop — the server has an engine with FX pegs, VAT-inclusive
derivation, band rounding and three-decimal currencies, and your JavaScript
float version of it will disagree with it in production.

**The customer is never charged a figure they did not see.** After
`POST /orders`, the result is compared against what the page displayed —
`lib/checkout/price-delta.ts`. On ANY difference (higher, lower, or same
number in a different currency) the customer sees both figures and must
explicitly accept. Do not "improve" this comparison with `parseFloat` and a
tolerance: KWD's smallest unit is a **thousandth**, and a two-decimal
tolerance calls 3.100 and 3.105 equal. The test suite bites on exactly that.

**Compare against `order.pricing.final_price`** — the immutable snapshot a
database trigger froze — never any other field.

**The payment method is chosen BEFORE the order is created** (ADR 0015). Some
rails accept one currency only (Binance Pay → USD, KNET → KWD). A method that
charges in a different currency than the customer is browsing must say so,
with the converted amount, before they commit (`chargeNotice` in
`lib/checkout/methods.ts`). Never let a provider's page be where they find
out.

**Payment methods come from `GET /payment-methods`.** Never hardcode which
methods exist, and never render one the server didn't offer. Fees come
computed from the server; you format, you never derive.

**One checkout attempt, one key — a re-press never buys twice.** Every
`createOrder` carries the browser's attempt key as `Idempotency-Key`
(`lib/checkout/attempt-key.ts`): minted in the browser (never in the Server
Action, which would mint a fresh one per press), KEPT while the outcome is
unknown (no answer, 5xx, a 409 in progress or for staff — the result's
`unsettled`) and the choices are unchanged, and replaced after any certain
answer — a 409 `idempotency_mismatch` (`restart`) included — or a changed
method, currency, contact or code. A new key on a guess is exactly the
duplicate order it exists to prevent; the same key with a changed request is a
409 forever. Only the 409's `code` (v0.1.98) says which.

**Bank transfer is not a payment.** The transfer screen's first sentence —
"your order is not paid yet" — is load-bearing. Finance confirms receipt
before anything captures, the backend enforces that, and copy implying
otherwise is a promise the system deliberately does not keep.

**Saving a card is opt-in and server-gated.** The checkbox starts unticked,
appears only to a signed-in customer, and only when the API offers saved cards
(`TAP_SAVE_CARD_ENABLED`); consent and the agreement are recorded per charge
(see §3). History worth knowing: before Tap granted `card_wallet_enabled`,
`save_card: true` failed the whole charge (error 1108) instead of declining
quietly — if a save ever starts failing charges, suspect the grant first.

---

## 2. The guest token is a credential

It is the only thing between a stranger and someone else's order.

- HttpOnly cookie, **one per order**, named `cq_ot_<orderId>` — one cookie
  holding many tokens means one leak exposes every order. Flags exactly:
  `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, 30-day `Max-Age`.
- The API reads it from the **`X-Guest-Token`** header, attached server-side
  (`lib/api/client.ts`) — never as `Authorization: Bearer`, which is the
  signed-in customer's token.
- `SameSite=Lax`, **not Strict**. Tap's 3-D Secure return is a cross-site
  top-level navigation; a Strict cookie is not sent on it, and payment
  recovery silently breaks for every card customer. Someone will want to
  "harden" this. Don't.
- Never in a URL after the first hop, `localStorage`, analytics, Sentry
  breadcrumbs, logs, or referrers. `Referrer-Policy: same-origin` on
  order-bearing routes: no Referer to any other origin. **Not `no-referrer`**
  — under it a browser sends `Origin: null` on a form post to our own pages,
  Next refuses the Server Action, and every form there answers 500 with
  JavaScript off or before hydration (§4's plain form posts, sign-in
  included). `same-origin` does send the full URL as Referer to our own
  server, so any access log we turn on treats Referer like the URL itself.
  The one exception is `/payment/complete`: its URL carries Tap's charge id and
  it has no form, so it stays `no-referrer`. Set that in `next.config.ts`.
- Every response also carries `nosniff` and a `Permissions-Policy`
  (`BASELINE_SECURITY_HEADERS` in `next.config.ts`) that switches off only
  device features the store never uses, for the page and every frame in it.
  **Never add `payment`, `publickey-credentials-*`, `clipboard-write` or
  `web-share` to it**: that is Apple Pay, Google Pay and Tap's frames, passkeys,
  the copy buttons and the share button, dead in one line. A new feature that
  needs camera, location or the like must come off the list first.
  A route handler's own header does not override a config header.
- CI greps the **built client bundles** for the `guest_token` literal and
  secret-shaped strings (the `scan:bundle` step that ends `storefront-checks`). It has bitten before.
- Order-status answers **404, not 403**, when the cookie is absent. Order ids
  are guessable; a 403 confirms the order exists, which is exactly what
  someone enumerating ids wants to learn.

All API calls happen server-side (Server Components, route handlers, server
actions). `API_BASE_URL` has no `NEXT_PUBLIC_` prefix on purpose. Adding a
client-side fetch to the API is an architecture change — raise it first.

Search-as-you-type is the one such change, raised and approved (ADR 0027,
2026-10-02): the browser calls OUR route handlers `app/api/search/suggest`
(no-store) and `app/api/search/popular` (public, 5 min), which call the API
server-side. Never the API itself, and never Meilisearch.

**A returning guest is named by an order, never by its contact** (owner,
2026-10-31). After a guest order, `lib/analytics/returning-guest.ts` keeps the
order's public id — sealed with its own key, HttpOnly, 30 days — and the
browsing steps name it for the API to match on. It is never set in a banner
country (`adCookiesAllowedIn`, the click ids' rule), never read for a
signed-in visitor, and `startSession` deletes it. Off unless
`MARKETING_GUEST_MATCHING=true`.

**A basket password is shown only on a tap** (owner, 2026-10-07 — this
reverses the earlier "a credential is never shown in the basket"). A game
login's password lives only in the encrypted two-hour `cq_vault`
(`lib/cart/credential-vault.ts`), keyed by basket line; the basket draws its
label, a FIXED row of dots and «إظهار». The value is never in the page's HTML
or RSC payload — the page learns only which keys are held (`vaultedKeys`), and
`SecretFieldValue` is handed the line id, key and label, never a value. A tap
POSTs to OUR route `app/api/cart/lines/[lineId]/reveal`, which:
- accepts only `Sec-Fetch-Site: same-origin` — not `same-site` (the admin and
  API hosts are the same site and carry the `Lax` vault cookie), not `none`;
  without the header, only an `Origin` equal to `SITE_URL` (never
  `request.url`'s origin, which is loopback behind the server's proxy);
- answers only for a line in THIS visitor's basket, `no-store`, logging
  nothing; a vault miss is a 404 and the page offers «أكمل البيانات».
The value never goes into another cookie, a URL, analytics or the server cart
mirror (`lib/cart/recovery-sync.ts` still strips credentials). No eye glyph
exists in the design file yet, so the control is the word until one is
exported (never hand-draw it, ADR 0018).

**A link that holds a token is a button, never an action on arrival.** The
unsubscribe page and, since 2026-10-27, the guest back-in-stock confirm and
cancel pages (`/stock-alerts/confirm|cancel?token=`) say what will happen and
post it from a Server Action: mail scanners and link previews open links, so a
page that acted on opening would sign up or unsubscribe people who never
pressed anything. Those routes are PRIVATE_ROUTES (noindex, `same-origin`
referrer — never `no-referrer`, which posts `Origin: null`).

**«نبهني عند التوفير» for a guest (owner, 2026-10-27, amending 2026-09-29's
«a guest signs in first»).** With `STOCK_ALERTS_GUEST_ENABLED` on the
storefront AND the API, a guest leaves an email on `/stock-alerts/email`
instead of signing in; sign-in stays offered there. The address is confirmed
from its own inbox before anything is sent to it, and the page only ever says
«sent» — the API answers the same whatever it did with an address.

---

## 3. The payment return page tells the truth

Arrival at `/payment/return` **proves nothing**. Tap appends `tap_id` to the
URL; anyone can type it, browsers replay it from history, customers arrive
having abandoned payment. The only authority is our API — which, since
2026-09-25, asks Tap itself: Tap returns the customer to
`/{locale}/payment/complete`, a route handler that hands `tap_id` to
`POST /orders/{id}/payment/verify` (Laravel fetches the charge from Tap; the
id must be one Laravel started for THIS order), empties the basket only if
that order is now captured, then redirects — RELATIVELY — to
`/payment/return`.

**A card's 3-D Secure opens FULL PAGE** (owner, 2026-10-28, reversing
2026-10-01's "always iframe"): `BANK_CHECK_IN_PAGE` in
`lib/checkout/bank-check.ts` is off. SNB AlAhli's challenge answered our frame
`ERR_EMPTY_RESPONSE` in WhatsApp's browser and one Saudi customer abandoned
three cards; Tap documents only a full redirect to `transaction.url`. The
customer goes to the bank's page and Tap returns them to `/payment/complete`;
the order page's «أكمل التحقق من البطاقة» reopens THE SAME charge's page, full
page. What follows describes the sheet, kept for a later decision:

`BankCheckSheet` frames Tap's page over the checkout, the order
page and pay-again; hosted pages (BenefitPay, «الدفع الإلكتروني») still open
full page. The frame NEVER shows a result: framed, our cookies may not come
(Safari, Chrome after a cross-site redirect), so `/payment/complete` answers
`Sec-Fetch-Dest: iframe` with a page that moves the WHOLE window to itself,
the sheet also follows the frame once it is ours again, and `/payment/return`
leaves any frame it finds itself in. Only those two routes — and the
dashboard's app-preview inner page, `/preview/home/frame` — allow
`frame-ancestors 'self'`; every other page is `'none'` (`next.config.ts`).
«افتحها بملء الشاشة» is always in the sheet, first after 12s without a load;
✕ goes to the order, whose «أكمل التحقق من البطاقة» reopens THE SAME charge.
And every other page a payment action leads to — Tap's, a settled payment's
result, the guided transfer's — is reached by `redirect()` FROM THE SERVER:
the action wrote a cookie, and a client leaving while Next still streams the
re-render is what showed a paid customer «حدث خطأ» (Sentry STOREFRONT-2/-3).

Four honest outcomes: captured → success; **retry** → the card did not go
through but the order is still open, so another card is offered on the SAME
order (its page draws Tap's card form); failed → the order has closed (its
retry window passed) — re-order; anything else → **"we are confirming your
payment"**. Pending is not a failure. Calling it one invites a second payment.
And no success animation may ever play on a state the API has not confirmed
as `captured`.

**Cards are Tap's embedded Card SDK V2** (`components/checkout/TapCardForm`,
behind the API's `card_sdk` on `tap_card`). Its fields are Tap's iframes; the
only thing that leaves them is the single-use `tok_…` — never read, keep or
log anything else from the SDK. The form stays MOUNTED while an order is being
paid (swapping it for a panel throws the typed card away); a retry pays the
same order with a fresh token. An order may have several charge ATTEMPTS
(`payment_charge_attempts`), never two open at once — that rule is the
server's, and it is why a "try again" never needs a new order. The basket
empties only when the server says the order is captured.

**Every other way to pay ends the same way** (2026-09-26,
`components/checkout/payment/`): the browser hands over a token or an id and
Laravel charges the order's own amount through the same attempts.
- *How the method is chosen* («Checkout Mobile», 2026-09-30): ONE row shows
  the chosen method beside «تغيير»; every method the server offers — saved
  cards first for a signed-in customer — is in the sheet it opens. Only the
  chosen method's own area sits under the row. Picking a method re-prices
  the basket with it, and the pay button stays locked until that answer is
  in: the fee is per method, so another method's total is not this one's.
- *Express wallets* (Apple Pay via Tap's Apple Pay SDK 1.2.0, Google Pay via
  Google's `pay.js` with `gateway: "tappayments"`) are rows in that sheet,
  listed only where the browser can pay. Picked, the wallet's OWN button
  takes the pay button's place in the pay bar. Their sheets must open
  straight from the tap, so the order is placed AFTER the token arrives —
  and is never charged if its total moved (the customer sees the new figure
  and taps again). Google's token goes to Laravel untouched; only Laravel
  talks to Tap with it.
- *What a wallet says afterwards* (owner, 2026-10-14). «لم يتم خصم أي مبلغ»
  (`walletFailed`, `walletCancelled`) only where NO payment can have
  started: never after this sheet handed a token over (`afterToken` on the
  buttons' `onCancel`/`onError` — Apple's sheet stays open on a refused
  payment and closing it is a cancel), and never while an earlier sheet's
  placement is unanswered (the kept attempt). The payment's own notice
  stands. Any notice in a bar of buttons (the product page's buy bar) is the
  bar's OWN full-width line under the buttons' row (`BarNotice`) — never a
  flex sibling of the buttons, which squeezed their labels over each other.
  A wallet's failure is reported by the CALLER (`express_pay_failed`,
  `wallet_error`), which keeps it when it removes the button in answer.
- *Apple Pay needs a first name and an email or phone* (Tap's setup,
  verified 2026-10-14: 1129 no customer, 1130 no first name, 1139 neither
  email nor phone — `appleCustomerGap`) — or the signed-in account's own Tap
  customer id (`GET /me` `tap_customer_id`, v0.1.130), which Tap takes in
  their place (owner, 2026-10-14; sent with whatever details we have).
  Without them its button is never drawn and Tap never asked. Express Apple
  Pay on the product page is for signed-in customers only, and shows
  «شراء سريع» when they lack both; the checkout keeps Apple Pay chosen and
  puts a hint naming what is missing where its button would be (a guest
  types it, an account is sent to its profile — `applePayDetailsFrom`); a
  guest paying an order again is not offered it. Nothing is invented; the
  Tap customer id is never logged or reported. Tap's own refusal reaches
  Sentry as `tap_code` (digits only) and `tap_error` (a known word, else
  `other`), plus our `reason` word — read only from the Axios error's
  `response.data.errors[0]`, never its `description` (Tap's free text could
  echo what the customer sent) and never its `config` (what was sent).
- *Saved cards* send the card's public id (`saved_card_public_id`, ADR 0037) — OUR row, never the gateway's token; Laravel mints a fresh Tap token from the card.
  «حفظ البطاقة لعمليات الشراء القادمة» starts UNTICKED and is shown only to a
  signed-in customer.
- *BenefitPay* (BHD, Bahrain) is signed by LARAVEL — its `hash_string` needs
  the secret key and is never made here. The QR panel polls Laravel; a charge
  id the button reports is only a lookup key.
- *Express Google Pay* (owner, 2026-10-14) on the product page keeps every
  rule express Apple Pay keeps (`ExpressGooglePay` beside `ExpressApplePay`):
  signed-in only, the sheet only on the server's figure quoted WITH
  `google_pay`, one order per attempt key, an unsettled or unreadable answer
  keeping the attempt and the button, its notice on the bar's own line, its
  failures reported as `sdk: google_pay`. It is Apple Pay's FALLBACK — drawn
  only where Google says it can pay (`googlePayReady`) and Apple Pay cannot;
  never both. A card that needs 3-D Secure comes back with the bank's page,
  which the action leaves for (full page); checkout opens the same page in
  the sheet (`inPageBankCheck`).
- *A wallet that cannot be offered says nothing* (owner, 2026-10-21). Express
  buttons draw only for a customer whose session the API proved (one `getMe`
  read for both wallets — a stale cookie is a guest) and only in a currency
  the gateway's list carries the wallet in. A wallet that fails BEFORE a press
  (`failedBeforeAnyAttempt`: Tap's setup call refused, the SDK would not
  start) is dropped silently, here and at checkout — «payment failed — nothing
  was charged» is only ever said after the customer pressed the button.
  Google's slot fills its container and may shrink (`GOOGLE_PAY_HOST`).
- *Card networks* come from the server per surface — the card form's
  `card_sdk.supported_brands` (v0.1.131), Google Pay's `allowed_networks`,
  Apple Pay's `supported_brands` (empty = Tap's profile). Never hard-code a
  list here: a network the merchant lacks is a card typed (or approved in
  Google's sheet) and then refused. mada is not offered by default.
- *Bank transfer* has its own page, `/[locale]/orders/{id}/bank-transfer`
  (the account the customer was shown, the order-number warning, the proof
  upload). Bank details never appear in the checkout form.
- ChargerQuick's own copy never names the payment provider; SDK-drawn
  branding stays as the SDK draws it.

---

## 4. Arabic-first, RTL by construction

- `dir` and `lang` are set on `<html>` in `app/[locale]/layout.tsx`, both from
  the same `locale`, on one line. That is the only place direction is declared.
  If a component needs a direction conditional to look right, the component is
  wrong.
- **`dir` is not the whole story, and this surprised us.** Tailwind v4's
  `rtl:`/`ltr:` variants do NOT compile to `[dir=rtl]` alone. `ltr:` compiles
  to `:where(:not(:lang(ae),:lang(ar),…19 RTL languages…), [dir=ltr],
  [dir=ltr] *)` — an **OR**. So a page whose `lang` says English would get LTR
  styling *even with `dir="rtl"`*. That never happens here only because the
  layout derives both attributes from one value, which is why that line must
  stay as it is. Verified by reading the compiled CSS, not the docs.
- Use logical properties: `ms-`/`me-`/`ps-`/`pe-`/`start`/`end` — never
  `ml-`/`mr-` or `left`/`right` for layout.
- Exceptions that are always LTR, even on Arabic pages, via `dir="ltr"` on
  the element: prices, IBANs, phone numbers, emails, player IDs, order
  numbers. An RTL-rendered IBAN visually reorders its groups and customers
  copy the wrong number.
- Arabic is the **source** language. `messages/ar.json` defines the shape;
  TypeScript makes English keep up; a test enforces identical key sets and
  refuses empty strings. Every user-visible string goes through the
  dictionaries — a hardcoded literal in a component is a defect.
- Every API enum a customer can see (payment states, fulfilment states) has a
  translation in both languages, pinned by `lib/i18n/state-labels.test.ts`.
  A customer must never read `refund_pending` next to their money.
- Fonts are self-hosted from `app/fonts/`, every face split by
  `unicode-range`: **Poppins draws Latin on both locales** (owner,
  2026-11-03 — letters, digits and prices on /en and /ar), **Cairo draws
  Arabic**, Tajawal is the cold-cache fallback. Poppins is static: a file per
  weight the store uses (400–900); a new weight class needs its file, or the
  browser fakes it. Do not add a Google Fonts link — third-party uptime and
  third-party logs, for nothing.
- Prefer plain `<form>` POSTs over hydrated widgets where a form does the job
  (see the currency/locale switchers → `/api/preferences`). Most customers
  are on mobile data; "the picker needs React loaded" is a lost sale.

---

## 5. The design is law — here is exactly where it lives

Figma file **`tsjvcy7q3FDi2gy0xB9sFk`**, pages **"Web - Desktop"
(`2516:3331`)** and **"Web - Mobile" (`6664:13800`)**. The old "Edits" page
and every `4330:*` / `5278:*` node were deleted in a restructure (found
2026-09-23); every screen now exists as a light AND a dark copy. The full
node map is in `docs/audits/2026-09-storefront-completion-audit.md` §3.

| v1 route | Desktop (1440) | Mobile (360) |
|---|---|---|
| `/` home | `3840:6062` | `6847:97393` |
| category listing | `6877:141864` / `6877:140024` | `6904:22758` / `6847:96404` |
| product (ID) | `6883:31202` | `6847:97051` |

Mobile frames are authoritative, not a courtesy — this is a mobile-majority
market.

**Colours:** the source of truth is the **Figma variables** (Semantic Colors
`6580:11107`, Color Primitives `6580:10328`) — **not** the "Color Shades Kit"
swatch frame `5278:23298`. ADR 0017 settled it: a variable is what a component
binds to; a swatch is a picture of one. The earlier ruling here ("the fills
win", "600 is lighter than 500") was an artefact of reading the wrong source —
the real ramp darkens monotonically and `primary-main` is `#007bbf`.
The variables were applied to `app/globals.css` on 2026-09-23 and are pinned
by `app/tokens.test.ts` — change both together. **A hex literal in a component
is still a defect.**

**Type:** sizes come from the Figma **text styles** (Display / Heading / Body /
Caption), as the `@theme` tokens `text-caption-xs` 10 · `text-caption` 12 ·
`text-body-s` 14 · `text-body-m` 15 · `text-body-l` 16 · `text-heading-m` 18 ·
`text-heading-l` 20 · `text-display` 24 — size only; the weight is its own
`font-*` class, as Figma pairs each size with several weights. An element takes
its **mobile** frame's style as the base and its **desktop** frame's at `lg:`:
the desktop comps step text up (Home's body copy is Medium 12 on the phone and
Medium 18 at 1440), and one size for both is how desktop came to read at phone
size. `text-[13px]` and other off-ramp sizes are a defect; an arbitrary size
is only for a display figure a comp draws above 24. **Tablets (owner,
2026-10-08):** no comp exists between 768 and 1023, and the phone layout
stretched across them read as broken on iPads — so the home page takes a
tablet step at `md:` (home rows six-up at the desktop card ratios, payment
tiles at desktop size, the app banner's badges in a row, the footer column
capped at 600px), and the text-only hero scales as one unit in container
units (`cqw`) below its 1200px comp. Check 768, 834, 912, 1024 and 1180 as
well as 360 and 1280 when touching the home page. Cairo is declared over its
whole `wght` axis (200–1000) so `font-extrabold` is real — use it only where a
comp shows ExtraBold. Inputs stay at 14 or more even where a mobile comp draws
12: iOS zooms on focus below 16, and smaller makes it worse.

**Scope.** What the storefront already does is listed in
`docs/architecture/CURRENT.md` §4; what remains is `docs/ROADMAP.md`. Owner
rulings live in ADR 0019 (the question book) and the ADRs after it — check
there before treating anything as out of scope. B2B wholesale is an explicit
no. Build a screen's *structure* from the comp, but ship only the parts that
have data behind them.

Screen-level definition of done: put your build beside a screenshot of the
node, desktop and mobile, both languages. Fidelity review is against the
image, not a description of it. No comp for a screen? Say so in a comment and
build to the design system — never invent silently.

**Icons** come from the Hicon pack on its 24 grid, Outline by default and Bold
when active (ADR 0018); never crop one out of a comp or hand-draw a path.
**Every SVG exported from this Figma file arrives with junk** — a `#313131`
canvas rect, sometimes the whole page as a white rect. `lib/brand/svg-assets.test.ts`
fails the build on plates: the test is right, the export is wrong.

**Logos** come from the owner's master pack (2026-10-07, ADR 0017 amendment),
in `public/brand/`: `logo-chargerquick-wide` (+`-light` for dark surfaces) for
the header, menu and payment pages; `logo-chargerquick` / `-mark-light` and
`-light` on the sign-in panel and footer; `-stacked` (primary), `-stacked-on-dark`,
`-stacked-white`, `-stacked-black` for anywhere a full lockup sits on a photo,
print or a single-colour surface (the invoice prints `-stacked-black`; on
screen it shows the wide lockup); `-mark` (the bolt alone) and `-app-icon`.
Dark theme keeps the **coloured** mark with light text. The browser and phone
icons are `app/favicon.ico`, `app/icon.svg` and `app/apple-icon.png`; the
share cards are below. Never re-export a logo from Figma — the pack is the
source.

**Share cards** (owner, 2026-10-12: a store link in WhatsApp and every social
app previews well, Arabic first; policy and how to test one:
`docs/seo/indexing-policy.md` §8). Every page's tags come from
`pageMetadata()` (`lib/seo/metadata.ts`). Nothing else sets `openGraph` or
`twitter`, and nothing there reads the request: values come from params and
shared reads (§8).
- **The picture is always 1200 × 630 PNG under 300 KB**, at an absolute URL
  on `SITE_URL`, with width, height, type and alt. X gets
  `summary_large_image`.
  - Pages without catalogue art use `public/brand/share-default.png`: the
    stacked lockup, the Arabic line, then the English line.
  - Products and categories with art use `/share/{products|categories}/{slug}.png`
    (`app/share/[kind]/[image]/route.ts`): the hero's art (`productArtwork`,
    `categoryArt`) on `public/brand/share-frame.png`.
  - The raw art is never the card. It can be WebP, it has no size in the
    contract, and a portrait tile crops to a strip. JSON-LD keeps the raw art.
- **Arabic is never drawn at request time.** satori (`ImageResponse`) shapes
  Arabic badly, so the two committed PNGs are drawn once by Chromium
  (`scripts/render-share-images.mjs`, Cairo, the pack's logos untouched). The
  card route draws no text at all, only the frame and the art. Changed
  wording or layout means re-running the script under a NEW file name:
  apps cache a picture by URL for days. The `?v=` on a catalogue card changes
  with its art's URL for the same reason.
- **The card route fetches only the store's media hosts**
  (`API_BASE_URL`, `MEDIA_BASE_URL`; no redirects, 5 MB, 5 s). It never
  answers an error picture: it falls back to the default card, kept a second.
  It lives outside `/api/` (robots.txt) and has a dot in its path (the proxy
  leaves it alone).
  - **PNG, JPEG and WebP art.** resvg paints WebP as an empty square, so
    WebP is decoded to PNG with `sharp` first (`artForRenderer`). `sharp` is
    a storefront dependency for that alone (owner, 2026-10-12): it never
    draws on the card. Anything else gets the default card.
  - Its `X-CQ-Share-Card: framed|default` header says which card answered.
    `check-seo.mjs` fails when a product's card is `default`, because that
    product has art.
- **Locale and brand.** `og:locale` is `ar_AR` or `en_US`, each with the
  other as `og:locale:alternate`. `og:site_name` is «تشارجر كويك |
  ChargerQuick» in both languages.
- **Descriptions** are plain text of at most 160 characters, cut at a word
  (`cutAtWord`). That includes staff SEO text that runs over.
- **Preview fetchers** (`lib/seo/crawlers.ts`):
  - They get `/ar` for the bare `/`. Their country is a data centre's.
  - They are in `htmlLimitedBots`, so the tags are in `<head>`, not streamed.

**Honesty rules the code enforces:**
- A control renders only if its destination works — no link to a 404, no
  button wired to nothing. Withheld rows are data (`lib/account/menu.ts`),
  not commented-out JSX.
- A section with no data renders **nothing** — never mock data, never the
  comp's placeholder content presented as real.
- Errors are never disguised: a 404 is a real 404 with a real status; a 5xx
  is never dressed up as "no products".

### Motion (ADR 0041, 2026-10-07)

Motion tells the customer what just happened; it never decides it.

- **CSS for states, Motion for presence and size.** Selected, pressed,
  focus, spinners, sheets' own entry and exit, a changed figure's wash
  (`cq-changed`), the captured tick (`cq-tick-draw`) and the navigation line
  are CSS in `app/globals.css`, on the `--cq-motion-*` / `--cq-ease-*`
  tokens. Motion for React adds only enter/exit (`AnimatePresence`) and
  height — through `m` from `motion/react-m` inside a `MotionScope`
  (`LazyMotion strict`, `domAnimation` loaded after hydration) around the
  component that renders it, never the layout: a page without presence or
  height motion ships none of Motion's core. ESLint refuses `motion.*`, `domMax` and `framer-motion`.
- **Animation never decides anything.** No `onAnimationComplete`, no timer
  moves state, submits, navigates, empties the basket or shows an outcome.
  Exits never hold an action or a navigation. Keyed by value, so a quick
  repeat restarts rather than queues.
- **What leaves has already left.** An element kept for its exit is `inert`
  (`useLeaving`); form controls that leave a form that stays sit in
  `LeavingFieldset` — disabled, so not submitted and not validated. Payment
  method areas and a region's package grid are not retained at all: the old
  one goes at once, only the new one fades in (`AutoHeight` eases the box,
  and only when its key changes). `TapCardForm` is a singleton — never two.
- **Server HTML is the final state.** `AnimatePresence initial={false}`; no
  animation on first render; height changes only after a customer action.
- **The language switch's portal (ADR 0041 amendment 2026-11-03) is the
  ONLY cross-document view transition.** `lib/portal/`: the inline head
  script (`boot.ts`) owns `pagereveal` and is built from the SOURCE TEXT of
  self-contained functions (`portalRadius`, `portalTimeline`) — they may read
  only their arguments; `boot.test.ts` runs the shipped string. The ring's
  canvas is rendered by the layout (an element added during parse breaks
  hydration) and hidden by an inline style (Tailwind forces `[hidden]` with
  `!important`). three.js lives only in dynamically imported chunks (`ring.ts`,
  `lib/celebrate/*`) — never import it statically. Flag `PORTAL_TRANSITION_ENABLED`, read at build. The
  dark-mode switch uses the same portal (`lib/portal/theme.ts`); its
  `apply` always runs, portal or not.
- **Celebrations (`lib/celebrate/`, `CELEBRATIONS_ENABLED`):** three.js only
  inside a dynamically imported chunk, mounted only where the server already
  said the thing happened (captured payment, `tier_up` notification), once
  per id through `playOnce` (it counts a celebration as seen only when it
  really starts — React runs effects twice in development). The static
  result stays in the page underneath; a celebration that cannot play leaves
  exactly the page as it was. GLSL `smoothstep` with reversed edges is
  undefined (ANGLE draws nothing): write `1.0 - smoothstep(low, high, x)`.
- **Reduced motion is explicit.** Motion 14 still fades opacity under
  `reducedMotion="user"`, so wrappers use `useMotionTransition()` (instant
  when reduced); one global CSS rule collapses every CSS animation and
  transition. A spinner then stands still beside its words.
- **Pending feedback is `components/ui/SubmitButton`.** For every
  server-action form: never disabled before the submit event (validation
  first; the submitter's `name`/`value`/`formAction` intact), `lock` by
  default, `feedback` where repeats are meant to count (the basket
  stepper's ±1). It is a safeguard, not the protection — the server's rules
  are (§3: one open charge attempt per order).
- **Navigation:** `instrumentation-client.ts`' `onRouterTransitionStart`
  starts the top line (`components/ui/NavigationProgress`), the committed
  URL ends it; refreshes and server-action redirects never show it.
  Both the line and the **slow-page loader** (`components/ui/PageLoader`,
  Claude Design «Loader Concepts» 2026-10-08) read `useNavigationWait`.
  The loader covers the screen only after 600 ms, only on browse and
  account pages (`lib/navigation/page-loader.ts` — never checkout, basket,
  payment, top-up or the sign-in forms), with a random pick of pixel
  charge, battery fill, thunder (dark strike on the dark theme, light on
  the light) and, on grid pages only, the catalogue skeleton; «pixel
  orbit» is out (owner, 2026-10-08). It is client-only on purpose: a
  `loading.tsx` streams, and its 200 goes out before a page can answer
  404 — so no route has one.
- **Success is the server's.** The tick draws only in the `captured` branch
  (§3); nothing celebrates a state the API has not confirmed.
- **Tested with animation ON:** `e2e/journeys/motion.spec.ts` runs with
  motion and under reduced motion and asserts what the server holds. The
  visual suite keeps freezing animation.

### VIP's surface («VIP Experience», ADR 0044)

- **The VIP surface is theme-independent**: the navy hero, the chip, the
  crest and the avatar frames are the same in light and dark. Their tokens
  (`--vip-*`, `--vip-ring-*`, `--vip-crest-*`) are literal in `globals.css`
  on purpose — the brand ramp flips in dark mode and the navy must not.
  Gold is a stroke or a fill on navy, never text on a light surface.
- **Every VIP figure is the server's**: the shortfall, the days left, the
  struck fee, the multiplier on a chip, what points are worth. A VIP figure
  the API does not state is left out, never worked out. «×1.5» inside a
  sentence is one LTR run (`factorText`), or Arabic reads «1.5×».
- **An inline SVG names its gradients per instance** (`useSvgId`): the
  avatar frame is drawn in the header, the drawer and the side menu at once,
  and a repeated id paints from the first copy, hidden or not.
- **VIP motion is CSS** (sweeps, the sheen, the halo, entrances), mirrored
  under `[dir="rtl"]` and stilled under reduced motion; a dismissed link
  leaves by a discrete `display` transition, never a timer. Motion's `m`
  for one fade cost the checkout ~24 KB gzipped.

### Alerts — one bar, two ways to raise it

Every customer-facing confirmation or warning is an entry in
`lib/notifications/registry.ts` (tone, icon, role, words in both languages) and
is drawn by `components/ui/AlertBar.tsx`. Never hand-roll a bar.

- **After a Server Action redirect:** `await flash("cart.added")` BEFORE
  `redirect()`. `ToastHost` (mounted once in the locale layout, outside
  `SiteChrome`) reads the 30-second `cq_flash` cookie — it holds only the KEY —
  and shows the bar, in the page's language.
- **In the browser:** `notify("coupon.copied")`.
- **On a page that is rendered per request and must work with JavaScript off**
  (the cart, the account area): keep the `?saved=1` / `?removed=1` style flag and
  draw the bar on the server with `<AlertBar {...alertProps(key, locale)} />`.
- A blocking error keeps its inline text beside the field; the bar never
  replaces it.
- A page cannot set a cookie while it renders, so a page that must raise an
  alert (the stock-alert resume page) returns to its product with
  `?stock_alert=1`, which `ToastHost` reads and spends.
- Adding an alert: words in `messages/ar.json` and `en.json`, an entry in the
  registry, then raise it. The registry test fails until both languages and the
  icon file exist.
- **The status banner** (owner, 2026-10-13; contract v0.1.128) is the one bar
  whose words are not ours: staff write them (Settings › Status banner) and the
  API serves them, resolved, as `status_banner` in `GET /content/settings`
  (null when off, half-written or past its end). Its two kinds are
  `STATUS_BANNER` in the registry — `info` and `warning` tones, both `role
  ="status"` — and it is deliberately **not** an `ALERTS` key, so no `cq_flash`
  cookie or `notify()` can raise it. `StatusBannerSlot` draws it in the locale
  layout, outside `SiteChrome` (it must show on phone checkout), in the shared
  shell from the footer's `storeSettings` entry; a failed read is no banner.
  «×» lives in `sessionStorage` and is applied before paint by an inline
  script keyed by a hash of the words (`lib/content/status-banner.ts`), so
  nothing moves and new words show again. Its link is https or a store path
  only, checked on both sides. It is a notice — never read it to change what
  checkout or payment does.

---

**Order status is the server's word (v0.1.121).** Show `customer_status`
(«بانتظار الدفع», «قيد التنفيذ», «مكتمل», «ملغي», «مسترجع») and the line for its
`customer_status_reason` (`lib/orders/customer-status.ts`). Never collapse
`payment_state`/`fulfillment_state` into a label yourself again — that is how
six different outcomes all read «لم يكتمل». The finer stage logic in
`lib/orders/status.ts` still decides which ACTION fits (pay, upload a proof,
order again); it never names the status.

**A wrong player ID is corrected once, then by support (Q20, v0.1.126).** The
order page reads `order.field_correction` and draws what the server says:
`available` → the correction form (`FieldCorrectionForm`; the value must
differ, and a refusal is said in place without clearing what was typed),
`used` → the way to support (WhatsApp), never the form. The page counts
nothing itself. A paid order that is `rejected` offers no «إعادة الشراء» —
on the order page or in the account list (`canReorderOrder`, owner 2026-10-13):
it is corrected, not bought again.

## 6. Types come from the contract — and the contract can lie

`lib/api/generated/v1.d.ts` is machine-written from `openapi/v1.yaml`
(`npm run generate:api`). Never hand-edit it, never restate an API shape in
your own interface — CI (`check:api`) regenerates and fails on any diff.

But two real incidents to keep you honest **in the other direction**:

1. `GET /categories` was declared as a bare array; it has always returned
   `{"data": [...]}`. Generated code compiled and broke at runtime.
2. `CategoryField.label` is declared **required**; real seeded data omits it.
   An unguarded `field.label[locale]` 500'd the entire checkout page — with
   every test green.

Since then the gap has been closed structurally:
`tests/Feature/Contract/` validates every public endpoint's REAL response
against the OpenAPI schemas on every CI run (Spectator + a JSON Schema
engine). Six shape lies were found and fixed getting it green. So the types
you generate are now enforced, not aspirational — but two habits stay:
be defensive at runtime about anything an admin can save (labels, images,
descriptions), and when you DO find drift, fix the **contract and the
conformance suite**, never quietly code around it. Known limit: the suite
does not yet flag EXTRA fields the API leaks (additionalProperties is
unrestricted), so don't rely on absence.

---

## 7. Next 16 — things that already bit

1. **`proxy.ts`, not `middleware.ts`.** The convention was renamed. A file
   with the old name is silently ignored: no error, every request unrouted.
2. **`params` and `searchParams` are async-only.** `await props.params`.
3. **`next start` ignores the `HOSTNAME` env var.** In production it bound
   `*:3000` — publicly — while the unit set loopback. The systemd unit passes
   `--hostname 127.0.0.1` explicitly. If you touch the service, verify with
   `ss -tlnp | grep 3000`: it must read `127.0.0.1:3000`.
4. **No `after()` in a render or an action that re-renders.** A request that
   calls `after()` is switched WHOLE to the after phase the moment the
   response closes — and a visitor who leaves mid-stream closes it early.
   Every `cookies()`/`headers()` still waiting behind an API fetch (a
   streamed section, the layout's announcements, the page a checkout action
   re-renders) then throws «used `cookies()` inside `after()`», though no
   callback touched it (Sentry CHARGERQUICK-STOREFRONT-B). Advisory sends go
   through `inBackground` (`lib/cart/background.ts`) instead; read the
   request data they need first and hand it over.
5. **One image per page is fetched first — never `priority`.** React's
   server render preloads EVERY `<img>` that is not lazy and not
   `fetchPriority="low"` (in the body or as a `Link:` header), so "eager"
   alone is a preload. Use the constants in `lib/brand/image-priority.ts`:
   `LCP_IMAGE` on the page's one largest first-screen image, `ABOVE_FOLD_IMAGE`
   for other first-screen pictures, lazy for the rest. A CSS background IS an
   LCP candidate (found only after the stylesheet); an inline `<svg>` is not.
   A banner whose light and dark artworks differ ships both (`ThemeImage`,
   ADR 0046 §4): both lazy, both `fetchPriority="high"` when it is the LCP,
   never preloaded — so it counts as one image, and that page has no image
   preload. `image-priority.test.ts` and `e2e/journeys/speed.spec.ts` hold the
   line (2026-10-11 trace, speed spec §2).
6. **A soft navigation never follows a page's `redirect()` or `notFound()`**
   (Next 16.3.8 with Cache Components, found 2026-10-11). A `<Link>` tap whose
   page answers with one leaves the visitor where they were — no URL change,
   no console error. It hangs within one dynamic route (`/ar/products/a` →
   `/ar/products/no-such`) and across routes that share a segment
   (`/ar/categories` → a leaf that redirects to its product, a short path, a
   lone child, a missing category, `[...rest]`'s `notFound()`). The flight
   answer carries the redirect as a rejected row the client router never acts
   on; `experimental.optimisticRouting: false` fixes only prefetched taps. So
   **no link the store draws may point at a redirect**: every category link
   goes where the category lands (`lib/catalog/landing.ts`, the API's
   `sole_product_slug`, contract v0.1.119), and the redirects stay for old
   links and full loads, where they are real 3xx. `categories.spec.ts` ("no
   store link on the catalogue pages points at a redirect", "a game with one
   product opens that product from its tile, in the page") guards it. **Re-test
   at every Next upgrade**, on the e2e build: open `/ar/categories`, run
   `window.next.router.push("/ar/categories/pubg-mobile-via-id")` (a short
   path that redirects); then, on `/ar/products/pubg-uc`,
   `…("/ar/products/no-such-x")`. When both land, the trap is gone and this
   rule can relax.
7. **History: a Server Action that redirects to the SAME page with a new
   query never navigated on Next 16.3.8 with Cache Components ON — fixed in
   16.4.0** (production build only; found 2026-10-11, CI of PR #305; owner
   turned the switch on again 2026-10-12). Profile → `?saved=1`, cart →
   `?coupon=…`, payments → `?card=updated`, two-step → `?done=enabled`: on
   16.3.8 the server did the work and answered `x-action-redirect` to its own
   pathname, but the URL and message never changed. That is why the switch was
   OFF from 2026-10-11 (§8, ADR 0046 notes). The re-test on the ON tree under
   Next 16.4.0 (CI run 38174202081, 2026-10-12) passed: `account.spec`
   (profile save → `?saved=1`), `payments.spec` (rename a card →
   `?card=updated`), `security.spec` (two-step on → `?done=enabled`) and
   `isolation.spec` (three visitors never see each other). `cart.spec`'s
   coupon step works too; it failed only on the next item's trap below. Re-run
   the same specs at the next Next upgrade, on the e2e build.
   Two things from that re-test stay true, and the tests and `proxy.ts` carry
   them:
   - **A `redirect()` after a cookie read in a request-time page still
     answers 200 plus a client hop on 16.4** (checked on a local ON build: a
     guest on `/ar/account` got 200). That covers `requireCustomer`. So
     `proxy.ts` sends a guest (no `cq_session` cookie) on any account page
     except sign-in, the sign-up first screen, `password/*` and `points/*` to
     sign-in with a real 307 and `?next=` (2026-10-12) — the same pattern as
     the order-page 404 there (§8). `requireCustomer` stays as the check for a
     stale cookie. `curl -sI /ar/account` as a guest must be a 307.
   - **Next 16.4 keeps the previous page in the DOM, hidden** (React
     Activity route preservation), so after a soft navigation
     `locator("main")` matches two elements. Every e2e journey reads
     `getByRole("main")`, which sees only the visible one (commit `56ccc26a`);
     do the same in any new test. **The same goes for CSS:** a hidden page's
     `<main>` carries an inline `display: none !important`, and an
     `html:has(...)` rule keyed on what a page holds still matches it — the
     buy bar's rule left every page after a product page without its tab bar
     and balance (2026-10-26). Exclude it:
     `html:has(X:not([style*="display: none"], [style*="display: none"] *))`
     (globals.css; `phone-header.spec` checks Back and Forward).

   The mobile-project timeouts in CI run 38155811269 (switch ON, Next
   16.3.8: `payment-screens.spec` :32/:47/:61,
   `search.spec:53`, the visual `pages.spec:62`) are explained (PR #309,
   2026-10-11): one request, `/_next/image?url=/brand/group-joygames.png`
   (the footer's group logo), stalled and never answered. With JavaScript
   off Chromium does not lazy-load, so the page's load event waited on it
   forever, and every `networkidle` wait hung on the same request. Fixed by
   serving the footer's group logos `unoptimized` (as files), and the e2e
   waits no longer use `networkidle` (`waitForPageDrawn`,
   `e2e/support/helpers.ts`). Why `/_next/image` stalled is item 8
   (found 2026-10-12): on 16.3.8 a cancelled request wedged that one picture
   for good; 16.4.0 fixed it upstream.
8. **A file from `public/` never goes through `/_next/image`** — every
   `<Image>` whose source is ours carries `unoptimized` (found 2026-10-12 on
   Next 16.3.8; **fixed upstream in 16.4.0**). On 16.3.8 the optimizer fetches a local file IN-PROCESS, through a mock
   response that is handed the visitor's own socket
   (`fetchInternalImage` → `createRequestResponseMocks({ socket: _req.socket })`).
   When the visitor goes away first — a page closed or navigated mid-load,
   which the e2e suite does all the time and real visitors do too — `send`
   sees that socket closed, drops the file read, and the mock never finishes.
   The optimizer's in-flight entry for that URL + width + format (its
   `Batcher`) is then never cleared, so **every later request for that one
   picture waits forever, for every visitor, until the server restarts**;
   other widths, the plain file and remote pictures (fetched over HTTP) still
   answer. CI saw it as `status -1` on `group-joygames.png` (w=256),
   `method-google-pay.png` (w=48) and the empty-cart PNG. Reproduced on a local
   `next start`: abort a cold `/_next/image?url=%2Fbrand%2F…` request, ask again
   → 86 of 120 variants hung for good; with the mock detached from the socket,
   0 of 120. Our own config widened the window: `experimental.isrFlushToDisk:
   false` (§8) also turns off the optimizer's disk cache, so EVERY image
   request runs the optimizer cold, not just the first. 16.4.0 gives the
   mock response no socket (`fetchInternalImage`, with a comment naming this
   exact hang); the same repro on 16.4.0 hung 0 of 120 at every abort delay
   tried (0–20 ms). **The rule stays anyway:** with no disk cache, an
   optimized local picture is re-read and re-encoded on every request, and a
   file that is already the right size and format costs nothing to serve. The
   price: nothing
   resizes or re-encodes our own files, so they land here already sized
   (at most 2× their largest drawn CSS size, never enlarged) and
   compressed — WebP at quality 75 with `sharp` for photos and panels
   (`auth-panel.webp` 119 KB, was a 241 KB JPEG; `app-download-panel.webp`
   24 KB, was a 254 KB PNG), and the wallet marks at 3× their slot (~3 KB).
   `lib/brand/local-images.test.ts` fails on a local `<Image>` without
   `unoptimized`, and on a new constant that hides one. To check that a later
   Next has not brought the hang back: build, `next start`, open a raw socket,
   send one `GET /_next/image?url=%2Fbrand%2Fshare-default.png&w=64&q=75`, close
   it at once, then `curl -m 5` the same URL — it must answer.

9. **A streamed boundary shows no sooner than ~300 ms after the first paint**
   (React 19.2's batched reveal, measured 2026-10-13 on the 16.4 build). The
   shell schedules `$RT` on its first animation frame; every `$RC` (a
   boundary's content arriving) after that waits until `$RT + 300 ms` and is
   revealed with whatever else landed in that window (`$RV`). So the product
   page's packs, ready on the server ~15 ms after the shell (warm guest),
   appeared at first paint + ~295 ms — with or without a 120 ms network —
   and the suggestions row, which never gated them, appeared in the same
   batch. Server time below that floor buys nothing visible; a boundary's
   FALLBACK is what the visitor looks at for those 300 ms, so draw it in the
   content's shape (`PurchasePanelFallback`). Only content in the shell
   itself escapes the floor.
10. **A list of links prefetches on intent, not on sight** (2026-11-02). A
   plain `<Link>` prefetches its route the moment it scrolls into view, one
   `?_rsc=` request per URL, and no cache in front of the server answers any
   of them (the edge skips router headers, the browser keeps no RSC answer —
   both on purpose). So the long lists — the home's tile rows, category and
   product grids, pack cards, the sector strip, the search suggestions, the
   footer menus — use `IntentLink` (`components/ui/IntentLink.tsx`): Next's
   documented hover pattern, with a touch and a keyboard focus counted as
   intent too (phones never hover, and `<Link>`'s own touch prefetch is off
   while `prefetch={false}`). `IntentLink.test.tsx` lists those files; a new
   grid joins the list. Primary navigation (header, tab bar, rail, menu
   drawer) keeps plain `<Link>`. When Partial Prefetching is turned on, the
   one line in `IntentLink` becomes `intent ? true : "auto"` (the doc's
   version for it).

**Version skew between releases (2026-10-17).** A tab outlives a deploy, and
Next's client DECODES an RSC answer — loading every chunk it names — before
it checks which release sent it. So: RSC answers are never cached
(`next.config.ts`, `Cache-Control: private, no-store` on `RSC: 1`); the
release id is the release folder's commit (`lib/config/deployment-id.ts`);
`proxy.ts` refuses RSC from a page of another release so its navigation
becomes a full load (`lib/navigation/other-release.ts`); and a Server Action
the server no longer has reloads the page once (`recoverFromDeploySkew`,
`lib/navigation/deploy-skew.ts`) — in a call site that catches its own error,
call it there. Reloading is safe because an action the server did not find
ran nothing; still, prefer it for reads before anything is committed (a
quote) over a payment's own error handling. Runbook: `docs/runbooks/cpanel-server.md`
→ "Version skew between releases".

**A dropped connection is not skew (2026-10-28).** An action the browser got
no answer to (`isConnectionDrop`, `lib/navigation/network-failure.ts`: Chrome's
"Failed to fetch", Safari's "Load failed", Firefox's "NetworkError…") shows
the error page's «انقطع الاتصال» and reaches Sentry as a warning. Never
reload or retry it by itself and never say nothing was sent: unlike an action
the server did not find, the server may have run it and only the answer was
lost.

The scaffold's own `AGENTS.md` warning stands: this Next version differs from
your training data and from most blog posts. `node_modules/next/dist/docs/`
is the reference that matches the installed version.

---

## 8. Currency and caching

- `lib/currency/visitor.ts` resolves the browsing currency: the customer's
  cookie first (their choice always wins), then `CF-IPCountry`, then USD.
  **Known gap:** the CF header only exists behind Cloudflare's proxy.
  `stage.chargerquick.net` is proxied, so geo-defaulting works there; locally
  it is inert. A Cloudflare-independent fallback is ROADMAP 1.9. The switcher
  is the working path.
- **Currency signs.** SAR and AED print the central banks' official signs
  (U+20C1, U+20C3), not «SAR»/«ر.س» or «AED»/«د.إ» — `formatMoney` does it via
  `lib/currency/signs.ts`, because `Intl` (CLDR 48) still prints the old marks.
  The banks' guidelines: sign to the LEFT of the figure in every language, a
  space between, never beside the ISO code. Device fonts mostly lack these
  characters, so `app/fonts/currency-signs.woff2` (built from the banks' own
  SVGs by `scripts/build-currency-signs.py`) is loaded for exactly that
  `unicode-range`. OMR (U+20C4) waits for the Central Bank of Oman's SVG in
  `scripts/currency-signs/` — add it, rebuild, add one line to the map. Never
  hand-type a sign or an abbreviation next to a price; the staff admin keeps
  ISO codes on purpose (unambiguous across currencies).
- Currency is a **required** argument to catalogue queries
  (`lib/catalog/queries.ts`). The API silently defaults to USD when omitted —
  making it required turns "forgot" into a type error instead of a Saudi
  customer seeing dollars.
- The account currency (Settings) becomes the browsing currency when it is
  **saved** (`lib/currency/cookie.ts`, one writer for every place that sets
  it). Signing in does not apply it (owner, 2026-10-07).
- **Shared or personal (ADR 0046, 2026-10-11).** The store is built for
  Cache Components and the switch (`lib/config/cache-components.ts`) is
  **ON** (owner, 2026-10-12, with Next 16.4.0; it was OFF from 2026-10-11
  because 16.3.8 dropped same-page action redirects, §7.7). Every page is a
  prerendered **shared shell** plus **personal parts** streamed in their own
  `<Suspense>`; both arrive in the one response. **Partial Prefetching is OFF**
  (`partialPrefetching: false`, set explicitly; owner, 2026-10-12): turned on
  the same day, it served a path the build had not prerendered the shared App
  Shell first, so a params-only `redirect()`/`notFound()` on a category or
  product page answered 200 — the only app-side fix was the undocumented
  `unstable_paramMatching`, so it waits for a supported one. With the switch OFF (the rollback) every page renders per request
  (the root layout's `await connection()`), redirects and 404s keep their
  real status, and the shared reads below are still cached (`"use cache"`,
  compiled by `experimental.useCache`). The rules below hold either way, so
  every new component chooses a side:
  - A component reads the session, the cart, the theme, the visitor's
    currency or country, `cookies()`, `headers()` or `searchParams` **only**
    inside a personal boundary. Its fallback is the guest or empty version of
    the same box (or a box of its measured size), marked `data-cq-fallback`.
    The announcement bar's fallback is the bar itself without its «×»: with
    JavaScript off a visitor can no longer dismiss it, and one who closed the
    top of two bars sees it again (owner accepted, 2026-10-11).
  - Shared API reads go through `lib/api/shared-read.ts`: `lib/api/client.ts`
    sends a GET there automatically when it has cache tags, no bearer, guest
    or cart token, and no `no-store`. It sends `Accept`, `Accept-Language` and
    the storefront server's own key (`X-CQ-Storefront`, below) — no customer
    credential and nothing about the visitor — is tagged (`cacheTag`) and kept
    for the read's window (`cacheLife`). A 404 is kept short (re-asked within 5 minutes, gone after
    an hour); any other failure is re-asked after a second
    (`SHELL_FAILURE_LIFE`: revalidate 1, stale 30, expire 300) and IS part
    of the page it was read for, drawn by the caller's own fallback, until
    the next regeneration replaces it. **Never a dynamic hole** (2026-10-13,
    Sentry CHARGERQUICK-STOREFRONT-D/E): the shared reads sit outside
    Suspense (the layout's menus, settings and announcements, the tree, the
    home's layout and banners, a product's category content), and at
    runtime a page's regeneration is a prerender — a read kept under five
    minutes (or stale under 30 s) is left out of it, and a hole outside
    Suspense fails it (`NEXT_STATIC_GEN_BAILOUT`). The old one-second
    profile did exactly that: in the background the previous copy stayed
    and Sentry logged an empty `Error`; once a webhook had expired the page
    (`expire: 0`, the next request waits) one failed settings read made
    every page answer 500. The trade (owner, 2026-10-13: approved): during a
    brief API failure a regeneration serves the page drawn by its fallbacks
    instead of a 500, replacing a good copy for at least one request, and is
    rebuilt a second later.
    `e2e/journeys/regeneration.spec.ts` fails a read through the suite's API
    pass-through (`e2e/support/api-fault.mjs`) and holds this. Wrapping
    shared content in Suspense instead is not the cure: a boundary holding a
    read with stale under 5 minutes is postponed to request time, and React
    moves a completed boundary over ~12.8 KB out of the shell (revealed by
    script — with JavaScript off the fallback stays), both measured on the
    footer and the home. Each failure is logged once per miss
    (`[shared-read] GET <path> failed (<status>)`, path and status only).
    A read that fails during `next build` fails the
    build: a release needs the API (only CI's thrown-away builds set
    `CQ_BUILD_WITHOUT_API=1`). With the switch OFF the build prerenders no
    page, so it reads nothing that matters and passes without the API.
  - The shell is read in `SHELL_CURRENCY` (USD) and carries no money
    (`lib/catalog/shell.ts`). Every price — and the JSON-LD that carries one —
    is read in the visitor's currency inside their boundary.
  - 404s and redirects that depend only on the path's params stay above every
    Suspense, so their status is real (a 3xx or 404 header, not a client hop).
    Query-dependent redirects (`?option=`) are client-side (plan D1); a
    visitor with JavaScript off gets a `<noscript>` meta refresh to the same
    target (`LegacyOptionRedirect`). Links never point at a redirect (§7.6).
  - Private routes may block: their layouts export `instant = false`
    (account, cart, checkout, contact-us, orders, order-status, payment,
    preview, search, stock-alerts — none exist with the switch OFF; the
    turn-off revert below takes them away). That opts them out of instant
    validation and nothing more: every request-time page still streams its
    shell first,
    so a `notFound()` or `redirect()` decided after a cookie or `connection()`
    answers 200 (a client hop / noindex; still true on Next 16.4). A status
    that must be real is decided before the first request read — from params
    or a shared read, as the VIP page's «VIP off» is — or in `proxy.ts`, as an
    order page asked for by a browser holding neither the order's key nor a
    session is, and a guest on a signed-in account page is (sent to sign-in
    with a 307 and `?next=`; §7.7).
  - The theme comes from `lib/theme/script.ts` (an inline `<head>` script sets
    `data-theme` from the cookie before the first paint; the server never
    writes it); the current path from `usePathname`, never a request header.
  - Guards: `lib/cache-scope.test.ts` (no personal module is reachable from a
    cached scope); `lib/api/shared-reads-inventory.test.ts` (every tagged
    read is listed); `lib/catalog/purchase-data.test.ts` (import ban and the
    money-free allowlist); `app/segment-config.test.ts` (route segment
    config); and `e2e/journeys/isolation.spec.ts` (two signed-in customers and
    a guest on one server never see each other's name, email, points, balance,
    basket, theme, closed bar or currency — required green before any merge
    that touches this). The SiteHeader shell test covers the header.
  - Page HTML is still `private, no-cache, no-store` (ADR 0046 §6): the shell
    is reused inside the Node process, never at the edge.
  - **Turning it off** (a rollback): revert the turn-on commit `9e563fc6`
    ("Turn Cache Components on again…", itself a revert of the switch-off
    commit `9628a3d6`, which reverted the enable commit `dbbea11d`), then
    redeploy (ADR
    0046, notes of 2026-10-11 and 2026-10-12). That flips the default to OFF,
    takes away the ten private layouts' `instant = false`, puts back the root
    layout's `await connection()` (`partialPrefetching` is set only with the
    switch on, so it goes with it). Setting
    `CQ_CACHE_COMPONENTS=false` alone is not the OFF tree: it does not build
    while the `instant = false` layouts exist (E1162). CI's "rollback check"
    build (a stricter hybrid of the revert tree) builds with the switch off
    on every run, so the rollback does not rot.
- **Language redirect.** Country detection stays out of `proxy.ts` with ONE
  exception: a path without a language redirects by the remembered `locale`
  cookie, then Arabic when the browser's FIRST language is Arabic
  (`firstLanguageIsArabic`; owner, 2026-11-01 — an Arabic phone abroad got
  English and Chrome's translate crashed on iPhone), then the country
  (`localeForCountry` — Arab countries Arabic, elsewhere English; owner,
  2026-10-10), then `Accept-Language`. That redirect
  is `private, no-store`, so no shared cache hands one visitor's language to
  the next. `proxy.ts` also sends `/index.html|htm|php` home: LiteSpeed's
  `DirectoryIndex` turned `/` into one of those before its proxy rule.
- **The visitor's country picks the product page's region chip** when the
  link names none (`tierInCountry`, owner 2026-10-10) — `countryForVisitor()`,
  the same answer as the header pill, so the two always agree.
- Cache tags are load-bearing strings shared with the backend's events —
  defined in `lib/catalog/tags.ts` and the content modules. Misspell one and
  nothing errors; pages just quietly stop rebuilding and serve stale prices.
  What carries which tag (`cacheTag` in `sharedRead`, kept `revalidate` seconds
  by `cacheLife` — 3600 unless noted):

  | Read | Tags |
  |---|---|
  | categories, category listing | `catalog` (+ `category:<slug>`) |
  | product | `catalog`, `product:<slug>`, `loyalty` (its earn badge) |
  | home layout | `catalog`, `home-layout`, `banner` |
  | banners · announcements · menus | `banner` · `announcement` · `menu` |
  | store settings (every call — a scan test enforces it) | `settings` |
  | content pages · FAQ | `content` + `page:<slug>` · `content` + `faq` |
  | partner coupons (60 s) · popular searches (300 s) | `catalog` (+ `partner-coupons`) · `catalog` |
  | redirects (60 s; `movedToForPage`, `lib/seo/redirect-table.ts`) | `redirects` — no webhook event: it lags up to 60 s when the proxy table missed |
  | featured reviews (600 s; `lib/reviews/featured.ts`) | `reviews` (`reviews.changed`) |
  | a product's reviews (600 s; `lib/reviews/product-reviews.ts`, read with no session) | `catalog`, `product:<slug>` — no event of its own: every moderation recounts the product and saves it, so `catalog.changed` names it |
  | a product's recommendations with no history (`lib/catalog/recommendations.ts`; 2026-10-13) | `catalog`, `product:<slug>` — a visitor's own `viewed` list is asked per request (`no-store`), never a cache key |
  | payment methods (300 s; `lib/checkout/shared-methods.ts`) — home strip and product-page Apple Pay only | `payment-methods` (`payment_methods.changed`), `catalog` (FX refreshes, Storefront Sync) |
  | loyalty programme (`GET /loyalty/program`, no locale) · points value | `loyalty` · `loyalty`, `catalog` (FX refreshes expire it) |

- **What expires them** (`app/api/revalidate`, signed): every
  `catalog.changed` expires `catalog` — every priced read — plus the named
  `product:`/`category:` tags. It is emitted by the catalogue model observers;
  page-less by `PricingSetting`/`LoyaltyLevel` saves and by `FxRateRefresher`
  after it stores rates (markup, VAT, tiers and FX reprice everything); and by
  Storefront Sync. Content events map to their tags; `page.changed` carries
  `previous_slug` on a rename, so the old address expires too.
  `loyalty.changed` expires `loyalty` — sent on every loyalty admin save
  (settings, tiers, rules, perks, campaigns, panel) and at each campaign
  start/end, so a cached «2×» never outlives its campaign. The 3600 s
  window is only the backstop for a lost delivery.
  `payment_methods.changed` expires `payment-methods` — sent on every
  `PaymentMethodSetting` save (the Payment gateways page) and every bank
  account save or delete (`PaymentMethodsChangeObserver`). Fees, rail
  switches, wallet settings and gateway keys are API config: changing them
  is a deploy that expires nothing, so after one press Storefront Sync's
  revalidate (it expires `catalog`, which these reads carry too). Without
  that, an entry lives about one 300 s window plus ONE stale answer after
  it (served while it refreshes; `lifeFor` keeps an entry up to a day), so
  a rarely asked currency/country/amount can show an old list once. The
  event name is pinned on both sides
  (`PaymentMethodsChangedTest` reads `lib/checkout/shared-methods.ts`).
- **Payment methods: shared where nothing is chosen, per request where the
  customer pays** (2026-10-12). The home strip and the product page's Apple
  Pay button read `sharedPaymentMethods` — currency (required by type),
  country and amount are its explicit arguments and so its cache key, read
  by the caller inside its personal boundary; SAR's fees can never be served
  to AED (`lib/checkout/shared-methods.test.ts`). Checkout and pay-again keep
  `listPaymentMethods` (`no-store`): the amount is that basket's or order's
  own total, so nothing would be shared, and that list is where a method and
  its fee are chosen. A shared read sends no `X-Forwarded-For`, so the API
  sees every miss as the storefront server's one address.
- **The storefront server's own key** (2026-10-12, ADR 0046 note):
  `sharedRead` sends `X-CQ-Storefront: $STOREFRONT_API_KEY`
  (`lib/api/storefront-key.ts`; the same value in the API's `.env`), and the
  API's seven throttled shared-read routes (`throttle.shared`: featured
  reviews, a product's reviews, a product's recommendations, popular
  searches, payment methods, loyalty programme and points value) count those
  misses in one `storefront-server` bucket (3000 a minute) instead of the
  address's counter — which Laravel shares across every bare `throttle`
  route, so a crawl used to blank them all with 429s. Everybody else keeps
  the per-address limits (600 on reviews and payment methods, 120 loyalty and
  recommendations, 60 the rest). Rules: ONLY `sharedRead`
  sends it — never `send`, which forwards the customer's address and keeps
  per-customer limits; never `NEXT_PUBLIC_` (`scan:bundle` greps the build
  for the name); unset or under 32 characters, nothing is sent and nothing
  changes. Setting it on a server: `docs/runbooks/cpanel-server.md`.
- **Loyalty panel lists are personal**: history, notifications, challenges,
  referrals and perks are private `no-store` route handlers under
  `app/api/loyalty/` (bearer read server-side, never cached); only the
  programme and points-value reads are shared. `/[locale]/rewards` reads no
  account: its heading is shared, and the programme is read in the visitor's
  currency inside its own boundary (the level thresholds are money). That
  boundary's fallback, and the page when the programme cannot be read, is
  the static explanation (never a 500).
- **API reads have a deadline; writes never do** (`lib/api/deadlines.ts`:
  8 s default, 3 s for the layout's profile and wallet, 2.5 s for optional
  reads). It is a `Promise.race`, never an `AbortSignal`: Next (16.3.8, and
  still 16.4.0) drops any fetch with a `signal` out of per-render dedupe
  (`next/dist/server/lib/dedupe-fetch.js`), and the layout and pages rely on
  that dedupe. An order, payment start/verify or preview is never abandoned —
  the server may already have applied it. The one exception is the shared
  read's own fetch (`lib/api/shared-read.ts`): it is shared through its
  `"use cache"` entry, not that dedupe, so it IS aborted after
  `SHARED_READ_TIMEOUT_MS` (15 s) — unbounded, a flood of fills waiting on a
  stalled API exhausted the heap (2026-11-01).
- **Independent reads go out together** (`Promise.all`); a dependency that is
  real stays sequential (checkout's quote → payment methods → method quote).
- **Optional data never blocks or misleads.** It degrades to a hidden section
  or an inline "unavailable" line, and "unknown" is never drawn as empty — the
  heart is `null` (no pressed state, posts the idempotent `1`) when the
  wishlist cannot be read. Suspense fallbacks are static and marked
  `data-cq-fallback` (styled by the motion work, never animated here): a box
  of the content's measured height, or the guest/empty version of the same
  box (Shared or personal, above) — never a shift when the part arrives.
- **An optional section that THROWS is dropped, not the page** (2026-11-02).
  Wrap it in `SectionBoundary` (`components/ui/SectionBoundary.tsx`, Next's
  `catchError`): the home's slider, banners, partner codes, reviews, payment
  methods and app badges; the product page's suggestions and reviews. Know
  where it catches — React's server renderer has no error boundaries:
  - **In the browser**, always: a throw there leaves the section empty and is
    reported once (`reportClientError`), instead of `error.tsx` replacing the
    page. Checked on a release-flag build: a probe throwing under
    `<Suspense>` turned the page into «تعذر تحميل الصفحة» without the
    boundary, and left only that section empty with it.
  - **At request time** only under a `<Suspense>`: the server sends that
    boundary's fallback (status already 200), the browser renders it again and
    the boundary catches. Personal sections already have one (the product
    page's two); put the boundary INSIDE it so the measured fallback stays.
  - **Never in a prerender** of the shared shell: a throw there fails `next
    build` (measured: "Error occurred prerendering page /en", even with
    `<Suspense>` + the boundary) or the regeneration, which serves the
    previous copy while one is still servable and answers 500 once a webhook
    has expired the page (above). So a widget that throws on the server can
    still take the home down; the home's shared sections get no `<Suspense>`
    for this, because it would buy nothing and cost the no-JavaScript view
    (outlining, above).
  - Never catch on the server and return `null` instead: that skips
    `onRequestError`, so Sentry and the edge self-purge never hear of it.
- Anything order-bearing is `no-store`. `GET /orders/{id}` is **never**
  cached — it is the truth about someone's money. A shared read never carries
  a bearer, guest or cart token: `CatalogReadOptions` cannot hold one,
  `client.ts` sends any read that does to the per-request path, and
  `sharedRead` sends no credential header at all.
- `/checkout/**`, `/cart/**`, `/payment/**`, `/order-status/**`, `/orders/**`,
  `/account/**` are `private, no-store` and render dynamically. Arabic and
  English cache independently — the locale is in the path, so no `Vary`.
- **Deployment assumptions the cache depends on** (owner, 2026-10-07;
  ADR 0046, 2026-10-11):
  - **One `next start` process.** The cache-tag state, every `use cache` entry
    (the shared reads) and, with the switch ON, the prerendered pages all live
    in that process's memory — each cache bounded by Next's `cacheMaxMemorySize` (50 MB, the
    default), least-recently-used out first. Nothing is written to disk
    (`experimental.isrFlushToDisk: false`, so bots walking junk URLs cannot
    fill the account's quota). The same flag turns off `/_next/image`'s disk
    cache too (Next 16.3.8 gates it on `isrFlushToDisk`), so every optimized
    picture is fetched and re-encoded on every request — only downstream HTTP
    caches (the browser's, a CDN's if any) absorb repeats (§7 item 8). With several processes the revalidation
    webhook would refresh only the one that received it, and each would keep
    its own copies. Scaling out first needs shared handlers (Redis) for both:
    `cacheHandler` (pages) and `cacheHandlers` (`use cache`) — ROADMAP 3.8.
  - **A restart or deploy starts cold.** Every shared read is asked of the API
    again — expect an API burst after each deploy. With the switch ON, too,
    the first request for a page within a day of the build is answered with
    the build's own copy while it regenerates (the next request gets the
    fresh one).
  - **API down** (switch ON): a page in memory keeps serving its last copy; a
    URL that is not answers a bare `500 Internal Server Error` (21 bytes).
    With it OFF every page renders per request, as before ADR 0046. The owner kept
    that on 2026-10-11 (search engines treat a 5xx as temporary); a
    Cloudflare custom 5xx error page covers it at cutover (ROADMAP 1.19).
  - **No edge cache in front of the API.** It sends `s-maxage=300` on catalogue
    reads. When the API host moves behind Cloudflare, give `/api/v1` a "bypass
    cache" rule, or a revalidation re-fetches a stale edge copy for 5 minutes.
- **The basket empties only on a captured order** — including one captured
  after the customer returned: `SettleBasket` on the return and order pages
  asks `settlePaidBasket`, which re-reads the order uncached and re-checks
  `cq_cart_order`.

---

## 9. How you work

**Environment:** Node `22.22.1` (`.nvmrc`; nvm — the Homebrew system node is
older), `npm ci`, copy `.env.example` → `.env.local`. Point `API_BASE_URL` at
`http://localhost:8000/api/v1` (run the Laravel side with
`php artisan serve`). The stage API refuses a laptop (Cloudflare bot rules),
so there is no remote API to point a local storefront at.

**The gate — all by exit code, before every commit:**

```bash
npm run check:api && npm run typecheck && npm run lint && npm test && npm run build
```

Never judge a run by piping output through `grep` — a pipeline's exit status
has hidden a red suite in this repo before.

**Tests:** Vitest + Testing Library, `globals: false` (import what you use;
cleanup is registered centrally in `vitest.setup.ts` — don't remove it, RTL's
auto-cleanup does not self-register without globals). House style: every
test's comment says *why the behaviour matters*, not what the code does. When
a test guards a money or security rule, **bite-check it**: plant the bug,
watch exactly that test fail, restore. A guard that never bit is a hope.

**Server Actions that touch auth return nothing** — `Promise<void>`, ending
in `redirect()`. A return value is serialised into the page, and a session
token in it is a token in the HTML.

**Dependencies** are pinned to exact versions (no carets); Node is pinned in
`.nvmrc` and `engines`, and CI matches it. A test that greps source text must
strip comments first — tests here have matched their own docblocks twice.

**Commits:** imperative subject; the body explains what failure the change
prevents and why this shape. Stage by explicit path — **never `git add -A`**
(the repo has untracked things that must stay untracked). Never commit
`.env*`, anything under `public/`, or `docs/decisions/*.pdf`. Push to
`stage`; `main` moves only by promotion after the exit gate.

**CI jobs that will judge you:** `storefront-checks` (the gate above),
`storefront-audit` (npm audit, moderate+ fails; the runtime tree has no exceptions, and the whole tree may carry only the expiring entries in `storefront/audit-allowlist.json`), and the `scan:bundle` step
that ends `storefront-checks` (secrets/guest_token in the built bundles — it
was its own job until it was folded into the build that had already made the
bundles). All of them exist because each failure mode actually happened or
nearly did. A pull request also runs the `@critical` browser journeys (the
whole browser suite when it touches sign-in, payment or shared code); tag a
journey with `{ tag: "@critical" }` to put it on that short list. The same
checks run locally with `bash .github/scripts/ci-local.sh fast storefront`.

**Deploying:** you don't — merge into `stage`: once its `ci-gate` passed,
`deploy-stage-net.yml` moves the `stage-net-deploy` tag onto the merge, and
the cPanel server pulls it within minutes and rebuilds the storefront (ADR
0036, amended 2026-10-24; by hand: `docs/runbooks/cpanel-server.md` § Deploy).
Promoting `stage` into `main` is the production release, deployed by hand. The Hetzner
staging box (`staging.chargerquick.ae`) was retired on 2026-10-10.

Then LOOK at it — `https://stage.chargerquick.net` (team-only: Cloudflare
Access, any `@chargerquick.net` email). The rule of this whole repo: green
gates are claims; a page you opened is evidence. The checkout 500 (item 2 in
§6) shipped through every green gate and was found by clicking.

---

## 10. State of the work

Not kept here — it went stale within a week every time. What exists:
`docs/architecture/CURRENT.md` §4. What remains: `docs/ROADMAP.md`.

**Known, deliberate:** geo-currency depends on `CF-IPCountry`, which exists
only on a Cloudflare-proxied host (a local GeoLite fallback is ROADMAP 1.9);
a field's raw key shows when staff have not filled its label (the fix is data,
not code).

---

## 11. When in doubt

Read this handbook, then ADR 0015 and ADR 0027. If a requirement seems to conflict with a
decision recorded there, **the recorded decision wins until the owner says
otherwise** — this project's costliest bugs were all two documents quietly
disagreeing. Ask, in writing, and get the answer written down.
