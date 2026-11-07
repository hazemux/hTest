import { execFileSync } from "node:child_process";
import path from "node:path";

import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

import { cachingConfig } from "./lib/config/cache-components";
import { deploymentIdFor } from "./lib/config/deployment-id";
import { LOCALES } from "./lib/i18n/locales";
import { HTML_LIMITED_BOTS } from "./lib/seo/crawlers";
import { staticFileHeaders } from "./lib/http/static-cache";


/**
 * Where remote images are allowed to come from.
 *
 * Every picture on this site — product tiles, category art, banner plates — is
 * a URL the API hands us from the media library (CC1). `next/image` REFUSES a
 * remote host that is not listed here, and Next 16 removed `images.domains`, so
 * without this the storefront renders a broken tile for every image staff
 * upload. Nothing catches it today only because the seeded environments have no
 * images yet: `GET /categories` answers `"images": {"icon": null, …}` across the
 * board, so the failure is waiting on the first upload rather than absent.
 *
 * DERIVED FROM `API_BASE_URL` rather than hardcoded, because the host differs
 * per environment (localhost:8000 in development, `staging-api.` on staging,
 * the production API after cutover) and a hardcoded hostname would be a staging
 * build that silently drops every image in production. `MEDIA_BASE_URL` is the
 * escape hatch for the day media moves to a CDN on its own domain.
 */
function mediaPatterns() {
  const origins = [process.env.MEDIA_BASE_URL, process.env.API_BASE_URL].filter(
    (value): value is string => Boolean(value),
  );

  return origins.flatMap((origin) => {
    try {
      const url = new URL(origin);
      return [
        {
          protocol: url.protocol.replace(":", "") as "http" | "https",
          hostname: url.hostname,
          port: url.port,
        },
      ];
    } catch {
      // A malformed value must not take the whole build down over an image
      // host — the pages still render, the pictures do not.
      return [];
    }
  });
}

/**
 * The locale segment every page-path rule below starts with — `ar` or `en`,
 * not any first segment: a bare `/:locale/orders/:path*` also matched
 * `/api/orders/…` (locale = "api") and replaced the delivery-proof route's
 * own `no-referrer` with `same-origin` and a `noindex`.
 */
const LOCALE = `:locale(${LOCALES.join("|")})`;

/**
 * Pages whose URL names somebody's order, basket or account. HANDBOOK §2:
 * their address is never sent to another origin — an order id in a Referer
 * header sent to an image host, a payment page or a help link is exactly the
 * leak the guest-token rules exist to prevent. The payment return is included
 * because it carries `?order=` in its URL.
 *
 * `same-origin`, NOT `no-referrer` (2026-10-01, owner-approved). Under
 * `no-referrer` a browser sends `Origin: null` on a form post to our own
 * pages, and Next refuses a Server Action whose Origin does not match the
 * host: every form on these pages answered 500 with JavaScript off or before
 * hydration — signing in included. `same-origin` sends the real Origin to us
 * and still nothing, Referer or Origin, to any other origin (checked in
 * Chromium 153, WebKit 26.6 and Firefox 155).
 *
 * `/payment/complete` stays `no-referrer`: its URL carries Tap's charge id, it
 * has no form, and its route handler's own `no-referrer` does NOT survive a
 * config header — Next sends the config's value. Hence the rule after these.
 */
const PRIVATE_ROUTES = [
  `/${LOCALE}/order-status/:path*`,
  `/${LOCALE}/orders/:path*`,
  `/${LOCALE}/payment/:path*`,
  `/${LOCALE}/cart/:path*`,
  `/${LOCALE}/checkout/:path*`,
  `/${LOCALE}/account/:path*`,
  // The dashboard's home-layout preview (ADR 0026): an unpublished page, and
  // a token in the URL that a banner click must not carry off in a Referer.
  `/${LOCALE}/preview/:path*`,
  // A friend's invite link (ADR 0043 §9): one URL per customer, not a page.
  `/${LOCALE}/r/:path*`,
  // An unsubscribe link (v0.1.91): a signed token in the URL. Same-origin,
  // not no-referrer — its confirm button is a Server Action (HANDBOOK §2).
  `/${LOCALE}/unsubscribe`,
  // «نبهني عند التوفير» for a guest (owner, 2026-10-27): the confirmation
  // mail's token is in the confirm and cancel URLs, and none of these pages is
  // content. Same-origin, not no-referrer — their buttons are Server Actions.
  `/${LOCALE}/stock-alerts/:path*`,
];

/**
 * WHERE A SCRIPT MAY COME FROM (2026-09-27). Every page, one list: this
 * origin, and the pinned payment SDKs' own hosts — Tap's CDN (card, Apple Pay,
 * BenefitPay) and the goSell library the BenefitPay build pulls, Google Pay's
 * `pay.js` and what it loads from gstatic, and Apple's Apple Pay JS that
 * Tap's Apple Pay build loads. Any other host's script is refused, so a
 * tampered SDK cannot quietly load a second one from elsewhere.
 *
 * SCRIPTS ONLY, deliberately. Frames (Tap's card iframe on sdk.tap.company,
 * the 3-D Secure page, Google's sheet) and connections are left open until a
 * run against the REAL SDKs — not the suite's stand-ins — shows every host
 * they use; a guessed list would break checkout in a way no test here sees.
 * `'unsafe-inline'`: Next's own hydration scripts are inline and this app
 * has no per-request nonce (it would make every static page dynamic).
 * `'unsafe-eval'` only in development, for React's dev tooling.
 *
 * `code.jquery.com/jquery-3.6.1.min.js` — that one file, not the host
 * (2026-10-04): the pinned BenefitPay build 1.0.10 loads
 * `jquery-3.6.1.min.js` from there BEFORE its goSell QR script, and waits for
 * it. Without it the button never drew — "BenefitPay not working" on staging,
 * every time, while the suite's stand-in SDK (no jQuery) passed.
 *
 * SUPPORT AND ANALYTICS (2026-10-28), exact hosts, never a wildcard:
 * - `client.crisp.chat` — Crisp's loader `l.js` and the client it loads
 *   (`SupportChat`, off without NEXT_PUBLIC_CRISP_WEBSITE_ID). Its other hosts
 *   are a socket (`wss://client.relay.crisp.chat`), images
 *   (`image.crisp.chat`) and uploads (`storage.crisp.chat`), which this
 *   policy does not govern — they are in the report-only list below.
 * - `www.clarity.ms` and `scripts.clarity.ms` — Microsoft Clarity, which runs
 *   from a Zaraz Custom HTML tool, never from this app
 *   (docs/runbooks/zaraz.md): the tag `www.clarity.ms/tag/<project>` loads
 *   `scripts.clarity.ms/<version>/clarity.js` (read 2026-10-28). Microsoft
 *   suggests `*.clarity.ms`; its lettered hosts (`s.`, `c.`) are uploads and an
 *   image, not scripts, so the wildcard stays out of script-src.
 * - `analytics.tiktok.com` — TikTok's base pixel (2026-11-01, owner: raise
 *   match quality), also from a Zaraz Custom HTML tool and only its page view:
 *   it sets TikTok's own `_ttp` cookie, which the server's events already
 *   forward (`_tt*` attribution), while every funnel step and the purchase stay
 *   server-side, so nothing is counted twice. `events.js` and the `main.*.js`
 *   it loads both come from that host.
 */
const SCRIPT_SOURCES = [
  "'self'",
  "'unsafe-inline'",
  ...(process.env.NODE_ENV === "development" ? ["'unsafe-eval'"] : []),
  "https://tap-sdks.b-cdn.net",
  // Tap's Apple Pay build 1.3.0 (Jaywan, 2026-11-02) is published only on
  // Tap's own CDN, not on tap-sdks.b-cdn.net (404 there): this one path, not
  // the host. It references the same hosts as build 1.2.0, read side by side.
  "https://cdn.tap.company/tap-sdks/apple-pay/",
  "https://goSellJSLib.b-cdn.net",
  "https://code.jquery.com/jquery-3.6.1.min.js",
  "https://pay.google.com",
  "https://www.gstatic.com",
  "https://applepay.cdn-apple.com",
  "https://client.crisp.chat",
  "https://www.clarity.ms",
  "https://scripts.clarity.ms",
  "https://analytics.tiktok.com",
  // Cloudflare Web Analytics (RUM, 2026-11-02): the zone injects its beacon,
  // which measures Core Web Vitals for real visitors (no cookies) and posts
  // them to this host's own `/cdn-cgi/rum`.
  "https://static.cloudflareinsights.com",
];
/**
 * WHERE A WORKER MAY COME FROM. Without its own directive `worker-src` falls
 * back to script-src, which refused Crisp's workers: Crisp fetches each from
 * its host and starts it from a local `blob:` URL. So: every host a script
 * may come from — what workers were allowed until now — plus `blob:`.
 */
const WORKER_SOURCES = [...SCRIPT_SOURCES.filter((source) => !source.startsWith("'unsafe-")), "blob:"];
function contentSecurityPolicy(frameAncestors: string): string {
  return [
    `script-src ${SCRIPT_SOURCES.join(" ")}`,
    `worker-src ${WORKER_SOURCES.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    `frame-ancestors ${frameAncestors}`,
  ].join("; ");
}
const CONTENT_SECURITY_POLICY = contentSecurityPolicy("'none'");

/**
 * EVERY RESPONSE, PAGES AND ROUTE HANDLERS ALIKE (ZAP baseline, 2026-10-17).
 * `nosniff`: a browser takes the Content-Type we send and never guesses one —
 * an uploaded proof or a JSON body is never run as a script.
 * `Permissions-Policy`: switches off, for this page AND every frame in it,
 * the device features the store never uses. Deliberately NOT listed, so they
 * keep the browser's default: `payment` (Apple Pay, Google Pay and Tap's
 * frames), `publickey-credentials-*` (passkeys), `clipboard-write` (copy
 * buttons), `web-share` (the share button) and the motion sensors a bank's
 * 3-D Secure page may read for its risk check.
 */
const PERMISSIONS_POLICY = [
  "camera",
  "microphone",
  "geolocation",
  "display-capture",
  "usb",
  "serial",
  "hid",
  "bluetooth",
  "midi",
  "browsing-topics",
]
  .map((feature) => `${feature}=()`)
  .join(", ");
const BASELINE_SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
];

/**
 * FRAMES AND CONNECTIONS, REPORTED BEFORE THEY ARE ENFORCED (2026-10-03).
 * The enforced policy above stops at scripts because a guessed list of frame
 * and connection hosts would break checkout in ways no test sees (3-D Secure
 * runs on each BANK's own host). This report-only policy names the hosts the
 * pinned SDKs were read to use — Tap's card iframe (`sdk.tap.company`), its
 * wallet backends (`mw-sdk*.tap.company`), Google Pay — and sends every
 * other one to Sentry, without blocking anything. After a week of real card,
 * 3-D Secure, Apple Pay, Google Pay and BenefitPay traffic the list is
 * complete enough to enforce. Only `frame-src`, `connect-src` and (since
 * 2026-11-02) `form-action`: a `default-src` would also report every inline
 * style and image.
 */
// BenefitPay's goSell QR script talks to Benefit's own checkout host
// (`benefit-checkout.test-benefitpay.bh` / `benefit-checkout.benefitpay.bh`).
const BENEFIT_HOSTS = ["https://benefit-checkout.test-benefitpay.bh", "https://benefit-checkout.benefitpay.bh"];
// Crisp's window frames its helpdesk articles (`*.crisp.help`, the «مقالات»
// tab) and its wait game (`assets.crisp.chat`) — both on in the workspace.
const REPORT_ONLY_FRAMES = [
  "'self'",
  "https://sdk.tap.company",
  "https://*.tap.company",
  "https://pay.google.com",
  ...BENEFIT_HOSTS,
  "https://*.crisp.help",
  "https://assets.crisp.chat",
];
// NEVER the API's own origin: the browser talks only to our route handlers,
// which call the API server-side (HANDBOOK, "All API calls happen
// server-side"). A report naming the API host (Sentry STOREFRONT-H) is this
// policy doing its job — allowing it is an architecture change to raise first.
const REPORT_ONLY_CONNECT = [
  "'self'",
  "https://*.tap.company",
  ...BENEFIT_HOSTS,
  "https://pay.google.com",
  // Google Pay's pay.js also calls `google.com/pay` (Sentry STOREFRONT-7).
  // That URL answers 301 -> https://www.google.com/pay -> 302 ->
  // pay.google.com, and the policy is applied to every hop: the bare host
  // alone left the report firing, so the www hop is listed too. Exact hosts,
  // no wildcard.
  "https://google.com",
  "https://www.google.com",
  "https://www.gstatic.com",
  "https://applepay.cdn-apple.com",
  "https://*.sentry.io",
  // Crisp live chat (`SupportChat`): its settings, the message socket and
  // file uploads (Crisp's "domain names" list, 2026-10-28).
  "https://client.crisp.chat",
  "wss://client.relay.crisp.chat",
  "https://storage.crisp.chat",
  // Microsoft Clarity, from Zaraz: it uploads to a lettered host
  // (`s.clarity.ms/collect` today) that Microsoft load-balances.
  "https://*.clarity.ms",
  // TikTok's base pixel, from Zaraz: it posts its page view to the host it
  // loads from (`analytics.tiktok.com/api/v2/pixel`), then asks its IPv6 host
  // for the visitor's IPv6 address (`/ipv6/enrich_ipv6`, Sentry STOREFRONT-1V).
  "https://analytics.tiktok.com",
  "https://analytics-ipv6.tiktokw.us",
];

/**
 * WHERE A FORM MAY SEND THE PAGE, REPORTED BEFORE IT IS ENFORCED (2026-11-02).
 * `form-action` governs a real form submission and EVERY redirect of it
 * (Chromium checks each hop). Ours: the store's own forms (Server Actions,
 * `/api/preferences`, the transfer-receipt upload) post to this origin, and a
 * payment started by a Server Action submitted with JavaScript off or before
 * hydration answers a 303 straight to the payment page
 * (`leaveForPage` → `redirect(result.redirectUrl)`, lib/checkout/payment.ts):
 * - Tap's hosted and 3-D Secure pages — `checkout.tap.company`,
 *   `sandbox.payments.tap.company/…/tap_process.aspx` (the API's
 *   `redirect_url`, tests/Feature/Payments) — one wildcard, as connect-src;
 * - Binance Pay's `checkoutUrl` (`pay.binance.com`) and, on a phone, its
 *   `universalUrl` (`app.binance.com`) — BinancePayGateway::startCharge;
 * - WhatsApp: the contact page's «مشكلة في طلب؟» is a plain GET form to
 *   `wa.me` (ReportOrderForm), which answers 302 to `api.whatsapp.com/send`
 *   (Sentry STOREFRONT-2P, an iPhone from Google search).
 * With JavaScript on, the client router leaves by `location.assign`, which
 * this directive does not govern; nor does it govern Google and Apple
 * sign-in, which start from a link (`GET /auth/start/<provider>`), not a form. Nothing else is listed on a guess: a bank's
 * own 3-D Secure host reached by a redirect of Tap's is exactly what the
 * reports are for. Enforce after a week of real checkouts (ROADMAP).
 */
const REPORT_ONLY_FORM_ACTION = [
  "'self'",
  "https://*.tap.company",
  "https://pay.binance.com",
  "https://app.binance.com",
  "https://wa.me",
  "https://api.whatsapp.com",
];

/** Sentry's CSP report endpoint for this build's DSN, or null without one. */
function cspReportUri(dsn: string | undefined): string | null {
  if (!dsn) return null;
  try {
    const parsed = new URL(dsn);
    const project = parsed.pathname.replace(/^\//, "");
    if (!parsed.username || !/^\d+$/.test(project)) return null;
    return `${parsed.protocol}//${parsed.host}/api/${project}/security/?sentry_key=${parsed.username}`;
  } catch {
    return null;
  }
}

const CSP_REPORT_URI = cspReportUri(process.env.SENTRY_DSN);
const REPORT_ONLY_POLICY = CSP_REPORT_URI
  ? [
      `frame-src ${REPORT_ONLY_FRAMES.join(" ")}`,
      `connect-src ${REPORT_ONLY_CONNECT.join(" ")}`,
      `form-action ${REPORT_ONLY_FORM_ACTION.join(" ")}`,
      `report-uri ${CSP_REPORT_URI}`,
    ].join("; ")
  : null;

/**
 * THE ONLY PAGES OUR OWN PAGE MAY FRAME: where Tap sends the card's 3-D
 * Secure frame back (BankCheckSheet, lib/checkout/bank-check.ts). Framed,
 * they only move the whole page on. `'self'` and nobody else — and the WHOLE
 * policy repeated, because this entry REPLACES the one above for these paths
 * (the last matching header wins) rather than adding to it.
 */
const FRAMED_RETURN_ROUTES = [`/${LOCALE}/payment/complete`, `/${LOCALE}/payment/return`];

/**
 * The dashboard's APP home preview frames ONE page of its own (Plan 4b,
 * R15): the outer page (`/preview/home`) holds a same-origin iframe of
 * `/preview/home/frame` so the page lays out at a phone's width. Only that
 * inner page may be framed — `'self'` and nobody else; the outer page and
 * the rest of the store stay `'none'`. `X-Frame-Options: SAMEORIGIN` says the
 * same to a browser that reads only that header (it also yields the edge's
 * `DENY` default, which is written with `?`). Every preview path keeps its
 * private, noindex and Referrer rules (`PRIVATE_ROUTES`).
 */
const FRAMED_PREVIEW_ROUTES = [`/${LOCALE}/preview/home/frame`];

/**
 * The build's release name for Sentry: `chargerquick@<commit>`, the same
 * name the API reports under, so both sides of one deploy group together
 * and the uploaded source maps match the code that runs. SENTRY_RELEASE wins;
 * otherwise the checked-out commit, which on the staging box IS the build.
 * Undefined outside a git checkout rather than a guess.
 */
function sentryRelease(): string | undefined {
  if (process.env.SENTRY_RELEASE) return process.env.SENTRY_RELEASE;
  try {
    const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: __dirname, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    return /^[0-9a-f]{40}$/.test(sha) ? `chargerquick@${sha.slice(0, 12)}` : undefined;
  } catch {
    return undefined;
  }
}

const SENTRY_RELEASE = sentryRelease();

/** ADR 0046's switch, as config — its `experimental` is merged below, never replaced. */
const CACHING = cachingConfig(process.env);

/**
 * RSC ANSWERS ARE NEVER KEPT BY THE BROWSER (deploy skew, stage 2026-10-16).
 * Next marks a prerendered route's RSC/prefetch answer
 * `s-maxage=300, stale-while-revalidate=86100`, and Safari served one from its
 * own cache after a deploy (Resource Timing transferSize 0): a payload from
 * the PREVIOUS release, whose client references loaded that release's chunk
 * (kept beside the new one for open tabs) — registering the old Server Action
 * id for `quoteExpressBuy`, which the new server answered 409, so express
 * Apple Pay disappeared; and `(0, _.D) is not a function` at checkout
 * (Sentry CHARGERQUICK-STOREFRONT-N, -P). The RSC URL (`?_rsc=`) does not
 * change between releases, and Next decodes a payload — loading its chunks —
 * BEFORE it checks the payload's build, so the only cure is that no cache
 * hands an old one back. The router keeps its own in-memory copy for the
 * page's life; nothing is lost but a stale HTTP-cache hit. Every RSC request
 * carries `RSC: 1`; HTML and static files do not, and are untouched.
 */
const RSC_CACHE_CONTROL = "private, no-store";

const nextConfig: NextConfig = {
  // ADR 0046 — see lib/config/cache-components.ts.
  ...CACHING,
  // VERSION SKEW (lib/config/deployment-id.ts): the release folder's commit
  // on the cPanel box, undefined elsewhere.
  deploymentId: deploymentIdFor(__dirname, process.env),
  // THE SERVER'S MEMORY FOR PAGES AND DATA: 1 GB, not Next's 50 MB default.
  // One number sizes both in-memory caches: the rendered pages (memory only,
  // `isrFlushToDisk` below) and `use cache` data — catalogue, categories,
  // settings, prices. At 50 MB a few hundred product pages in a few
  // currencies pushed each other out, so a request the edge does not answer
  // (a signed-in visitor, a first currency) re-rendered and re-asked the API.
  // A ceiling, not a reservation (LRU); production's heap is 8 GB
  // (chargerquick-prod-storefront.service), stage's Node default about 4 GB.
  cacheMaxMemorySize: 1024 * 1024 * 1024,
  experimental: {
    // Merged, never replaced: OFF, this carries `useCache: true`.
    ...CACHING.experimental,
    // NO ROUTE CACHE ON DISK. With Cache Components on, Next writes a
    // prerendered entry to `.next` for every unique URL it renders on
    // demand — a scanner's 20 junk URLs made 60 files — and nothing removes
    // them until the next deploy, so bots could fill the cPanel account's
    // quota and inodes. Kept in memory instead (bounded by Next's
    // `cacheMaxMemorySize`); a restart re-renders, as after a deploy.
    isrFlushToDisk: false,
  },
  // EVERY CRAWLER GETS ITS <title>, CANONICAL, HREFLANG AND SHARE TAGS IN
  // <head>. Next streams metadata to bots that run JavaScript — Googlebot
  // among them — so when `generateMetadata` resolves after the shell has
  // flushed, the title lands in the body. Found 2026-10-07: once the layout
  // stopped waiting on serial reads, a cold product page sent Googlebot no
  // title in <head>, and the release guard (`scripts/check-seo.mjs`) failed.
  // Next's own list plus Googlebot plus the link-preview fetchers it lacks
  // (Telegram, Snapchat, Pinterest…; lib/seo/crawlers.ts); browsers still stream.
  htmlLimitedBots: HTML_LIMITED_BOTS,
  // Sentry's switches, fixed into the build for the server and the browser
  // alike (lib/monitoring/env.ts). The DSN is public by design; the upload
  // token below is not and is never given a NEXT_PUBLIC_ name.
  env: {
    NEXT_PUBLIC_SENTRY_DSN: process.env.SENTRY_DSN ?? "",
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT ?? "",
    NEXT_PUBLIC_SENTRY_ENABLE_DEV: process.env.SENTRY_ENABLE_DEV ?? "",
    NEXT_PUBLIC_SENTRY_DEBUG: process.env.SENTRY_DEBUG ?? "",
    NEXT_PUBLIC_SENTRY_RELEASE: SENTRY_RELEASE ?? "",
  },

  // The trailing slash is normalised in proxy.ts instead — AFTER the old-URL
  // redirects staff manage in the admin panel, so `/product/x/` makes one
  // hop, not two (Next's own slash redirect would run first).
  skipTrailingSlashRedirect: true,
  // No `X-Powered-By: Next.js` (ZAP baseline, 2026-10-17): it tells a scanner
  // which framework, and so which advisories, to try first.
  poweredByHeader: false,
  // The customer app's association files. A folder named `.well-known` cannot
  // be an App Router segment, so the handlers live under `app/well-known/` and
  // these map the public paths onto them. `proxy.ts` skips dotted paths, so no
  // language redirect runs first; Cloudflare already bypasses `/.well-known/*`
  // from auth and cache (docs/runbooks/cpanel-server.md).
  async rewrites() {
    return [
      { source: "/.well-known/apple-app-site-association", destination: "/well-known/apple-app-site-association" },
      { source: "/.well-known/assetlinks.json", destination: "/well-known/assetlinks.json" },
    ];
  },
  async headers() {
    return [
      ...staticFileHeaders(),
      { source: "/:path*", headers: [{ key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY }] },
      { source: "/:path*", headers: BASELINE_SECURITY_HEADERS },
      ...(REPORT_ONLY_POLICY ? [{ source: "/:path*", headers: [{ key: "Content-Security-Policy-Report-Only", value: REPORT_ONLY_POLICY }] }] : []),
      { source: "/:path*", has: [{ type: "header", key: "rsc" }], headers: [{ key: "Cache-Control", value: RSC_CACHE_CONTROL }] },
      // EVERY STORE PAGE: `same-origin` (owner decision 2026-10-11). The shell
      // is shared (ADR 0046), so with JavaScript off a switcher on a product
      // or category page posts no return path, and `/api/preferences` sends
      // the visitor back to the page in its Referer — which a browser sends
      // our own origin only under a policy that allows it. Nothing, Referer
      // or Origin, still goes to any other origin. The edge's own default
      // (`?Referrer-Policy no-referrer` in infra/Caddyfile.staging) yields
      // to this. Pages only (/ar, /en and below): an API route's own header
      // (a delivery proof's `no-referrer`) is never replaced by it. BEFORE
      // the private and no-referrer rules below — the later rule wins.
      { source: `/${LOCALE}/:path*`, headers: [{ key: "Referrer-Policy", value: "same-origin" }] },
      // The ONE exception, after it (owner decision 2026-10-11): the
      // partner-code «زيارة المتجر» redirect lets the merchant see that the
      // visitor came from us — our origin only, never the page — so the
      // partner can attribute the visit. A redirect's own Referrer-Policy
      // governs the request it redirects to.
      {
        source: `/${LOCALE}/partner-coupons/:id/visit`,
        headers: [{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }],
      },
      ...FRAMED_RETURN_ROUTES.map((source) => ({
        source,
        headers: [{ key: "Content-Security-Policy", value: contentSecurityPolicy("'self'") }],
      })),
      ...FRAMED_PREVIEW_ROUTES.map((source) => ({
        source,
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy("'self'") },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      })),
      // Private pages are NEVER indexed — and they are noindexed by header
      // rather than blocked in robots.txt, because a crawler that may not
      // fetch a page cannot read its noindex (docs/seo/indexing-policy.md).
      ...PRIVATE_ROUTES.map((source) => ({
        source,
        headers: [
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      })),
      // Last, so it overrides the rule above (the later of two matching
      // rules wins): Tap's charge id goes nowhere, not even to us.
      { source: `/${LOCALE}/payment/complete`, headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      // The same for a recovery link's GET (ADR 0039 §5): its URL holds the
      // link's token and it has no form. Only this exact path — the confirm
      // page after it has a form, so it keeps `same-origin` (HANDBOOK §2).
      { source: `/${LOCALE}/cart/recover`, headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      // Internal search: an endless set of URLs made of whatever was typed.
      // Not indexed; the product links on it may still be followed.
      { source: `/${LOCALE}/search`, headers: [{ key: "X-Robots-Tag", value: "noindex, follow" }] },
    ];
  },
  turbopack: {
    // The repo root has its own package-lock.json (Vite/Tailwind for
    // Filament), and this machine can have unrelated lockfiles elsewhere on
    // disk — both make Turbopack's root inference unreliable. Pin it to
    // this project explicitly rather than let it guess.
    root: path.join(__dirname),
  },
  images: {
    remotePatterns: mediaPatterns(),
    // WHERE PICTURES ARE RESIZED (owner, 2026-10-28): by Cloudflare at the
    // edge when the build says `CQ_IMAGE_RESIZING=cloudflare` (the zone's
    // Images › Transformations must be on), otherwise by Next's own
    // optimizer as before — local, CI and e2e never set it. See
    // `lib/images/cloudflare-loader.ts` for why our server could not.
    ...(process.env.CQ_IMAGE_RESIZING === "cloudflare" ? { loader: "custom" as const, loaderFile: "./lib/images/cloudflare-loader.ts" } : {}),
    // Next 16 refuses to optimize an upstream that resolves to a private IP —
    // SSRF protection, and correct everywhere except development, where the
    // API IS localhost and every category card 400s without this. Derived
    // from the configured API origin rather than NODE_ENV so a production
    // build pointed at a real API can never carry the exemption: the flag is
    // on exactly when the thing it exempts is the API we were told to trust.
    dangerouslyAllowLocalIP: ["localhost", "127.0.0.1", "[::1]"].includes(
      (() => {
        try {
          return new URL(process.env.API_BASE_URL ?? "").hostname;
        } catch {
          return "";
        }
      })(),
    ),
  },
};

/**
 * SOURCE MAPS, only when the build holds an upload token (SENTRY_AUTH_TOKEN,
 * with SENTRY_ORG and SENTRY_PROJECT — deployment secrets on the build box,
 * never in the repository or a NEXT_PUBLIC_ name). The maps are generated,
 * uploaded under this build's release, and DELETED from `.next` before the
 * server starts, so no `.map` is ever served. Without the token the build is
 * exactly what it was: no wrapper, no maps.
 *
 * An upload failure (Sentry unreachable, token expired) is printed as a
 * warning and does NOT fail the build: a deploy must not wait on the
 * monitoring vendor. The stack traces of that build are then minified.
 */
const uploadSourceMaps = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT,
);

export default uploadSourceMaps
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      ...(SENTRY_RELEASE ? { release: { name: SENTRY_RELEASE } } : {}),
      sourcemaps: { deleteSourcemapsAfterUpload: true },
      widenClientFileUpload: true,
      telemetry: false,
      silent: false,
      // The hook only instruments navigations for tracing, which is off.
      suppressOnRouterTransitionStartWarning: true,
      errorHandler: (error) => {
        console.warn(`[sentry] source map upload failed; the build continues: ${error.message}`);
      },
    })
  : nextConfig;
