# ChargerQuick storefront — UI team kit

**What the store looks like today.** Captured from stage.chargerquick.net on **2026-11-07**, stage commit **`769488a3e`** (PR #780, deployed 12:02 UTC). Production (www) is one release behind stage. The screens in this kit look the same there; the only storefront changes on stage since then are the account-closure flow, the payment-return page and the points pop-up.

> **بالعربي:** هذه الحزمة تحتوي شكل المتجر الحالي كما هو على stage بتاريخ 2026-11-07: صور كل الشاشات (عربي وإنجليزي، جوال 360 وكمبيوتر 1280، فاتح وداكن)، الألوان والخطوط والأيقونات، وكود واجهة المتجر. أعطِ أداة الذكاء الاصطناعي ملف `tokens/tokens.css` وصور الشاشة التي تريد تعديلها وملف المكوّن من `code/`، واطلب منها الالتزام بها.

## What's inside

| Folder | What it is |
|---|---|
| `screens/` | 76 full-page screenshots: 9 screens × Arabic/English × 360 px/1280 px × light/dark (72), plus the «add your email» sheet (4). Names: `screen_locale_width_theme.jpg`. |
| `tokens/tokens.css` | Every design token as CSS custom properties. Light is `:root`; dark is `html[data-theme="dark"]`. |
| `tokens/tokens.json` | The same tokens as JSON: `light`, `dark` (fully resolved), `dark_overrides_only`. |
| `tokens/globals.css` | The real stylesheet (Tailwind v4 source) these tokens come from. |
| `fonts/` | Self-hosted fonts: **Poppins** (all Latin text and digits, 400–900), **Cairo** (Arabic), Tajawal (fallback only), CQ Currency Signs (SAR/AED signs). |
| `icons/` | 102 **Hicon** icons (24 grid; Outline by default, Bold when active). |
| `brand/` | Logos, payment marks, flags, auth/app panels. |
| `code/storefront/` | Storefront UI source from stage: `components/`, `app/` (pages + `globals.css`), `messages/ar.json` + `en.json` (all copy), `HANDBOOK.md` (the store's design rules), Tailwind/PostCSS config. `lib/` (data and payment logic) is not included. |

### Screens covered

| Screen | URL on stage | Notes |
|---|---|---|
| home | `/ar`, `/en` | Banner slider, category rows, partner coupons, reviews, payment marks, footer |
| category | `/ar/categories/games-top-up/pubg-mobile` | Sub-category tiles |
| product | `/ar/products/pubg-uc` | Pack-art hero, pack grid, player-ID field, tabs, recommendations, sticky buy bar |
| cart | `/ar/cart` | One item in the basket |
| checkout | `/ar/cart/checkout` | Balance/points toggles, saved card. Nothing was paid |
| signin | `/ar/account/sign-in` | Phone + WhatsApp code, passkey, Apple, Google |
| account | `/ar/account` | Phone: account menu. Desktop: personal information with the side menu |
| account-email-sheet | `/ar/account` (phone) | The «add your email» bottom sheet, which opens by itself for accounts with no email |
| orders | `/ar/account/orders` | Filter chips, order cards (phone) / table (desktop) |
| order | `/ar/order-status/CQ-100109` | Order in progress: timeline, invoice, points |

## Use it with an AI tool

1. Give the tool `tokens/tokens.css` (or `tokens.json`) and tell it to **use only these variables. No new hex colours, no new font sizes.**
2. Attach the screenshot of the screen you're changing, in **Arabic first** (`*_ar_360_light.jpg`), plus the dark one.
3. Attach the matching component from `code/storefront/components/…` so the output keeps the real structure.
4. Include the rules below in the prompt.

**Rules the store follows (from `code/storefront/HANDBOOK.md`):**
- Arabic is the main language and the layout is right-to-left. Use logical sides (start/end, `ms-`/`me-`/`ps-`/`pe-`), never left/right. Prices, phone numbers, IDs and order numbers are always shown left-to-right.
- Type scale: 10 · 12 · 14 · 15 · 16 · 18 · 20 · 24 px (`text-caption-xs` … `text-display`). No sizes in between. Inputs are at least 14 px (16 on iOS).
- Fonts: Poppins for Latin, Cairo for Arabic. No Google Fonts links.
- Icons: Hicon only (`icons/`). Never hand-draw an icon.
- Dark mode is a full theme. Every screen needs a light and a dark version. Cards use `--color-surface-raised` (#2b2b2b in dark) on `--color-surface` (#212121). The footer flips to white in dark mode, on purpose.
- Every screen gets designed at 360 px (phone first) and 1280 px.
- Wording: always «رسوم المعالجة» / "Processing fee", never «رسوم الدفع» / "payment fee".

## How the screenshots were taken

- On stage in a real browser, signed in as the stage **test** customer «Jafar test». Phone numbers and emails are replaced with `+971 50 000 0000` / `name@example.com`. The orders are stage test orders.
- Phone shots are full pages at 2× (720 px wide). **Desktop shots are the 1280 px layout saved at 800 px wide** (0.625×), so read exact spacing from `code/`, not from those pictures.
- The Crisp chat bubble and the yellow «هذا شريط اعلانات اختباري» / "this is a test Announcement Bar" are stage content. Banners, products and prices on production differ.
- Recommendation rows ("You may also like") are random, so they differ between shots.

## What this kit does **not** cover

- Motion: the three.js language portal, «تم الشحن» celebrations and other animations (ADR 0041). Screenshots are still frames.
- Screens not listed above: search, VIP, rewards, wallet top-up, saved accounts, settings/security, password reset, FAQ/CMS pages, payment-return, bank transfer, 404/error pages, guest checkout, empty and error states, the mobile menu drawer, header dropdowns, toasts.
- Tablet widths (768–1023), other than what the code shows.
- The customer app (iOS/Android), the Telegram Mini App and the staff dashboard.
- The Figma file (`tsjvcy7q3FDi2gy0xB9sFk`) and the Claude Design system «ChargerQuick.net», last synced around 8 Oct 2026. Both are older than this kit. Standalone Claude Design closes on 14 Dec 2026.
- `lib/` code: data loading, prices, payments. The full repo is on GitHub (team `ui-team`, read-only).

*Confidential — CHARGER QUICK FZCO. For the UI team's internal design work only.*
