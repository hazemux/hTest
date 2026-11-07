"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import type { Money } from "@/lib/checkout/price-delta";
import { SheetRefusal } from "@/lib/checkout/sheet-refusal";
import type { Locale } from "@/lib/i18n/locales";
import { reportPaymentSignal, walletFailure, type WalletFailure } from "@/lib/monitoring/payment-signal";
import { appleCustomer, type CheckoutContact, type TapApplePayCustomer } from "@/lib/wallets/apple-customer";
import { loadScript } from "@/lib/wallets/load-script";

/**
 * Apple Pay, through Tap's Apple Pay Web SDK (vanilla build 1.2.0 — the
 * version Tap documents).
 *
 * SHOWN ONLY WHERE IT CAN WORK: Safari (or an Apple device) whose
 * `ApplePaySession.canMakePayments()` says yes. Anywhere else this renders
 * nothing at all — never a disabled button a customer cannot use.
 *
 * WHAT CROSSES BACK is the `tok_…` Tap mints from Apple's payment token, and
 * nothing else from the callback: it also describes the card.
 *
 * The amount is the SERVER's quote, handed through for Apple's sheet; the
 * charge itself is made by Laravel from the order, never from this figure.
 * The sheet has to open straight from the customer's tap, so no order is
 * placed before it — the caller places the order after the token arrives and
 * refuses to charge if the order's total differs from what the sheet showed.
 *
 * EVERY OPTION TAP DOCUMENTS, weighed (developers.tap.company/docs/
 * apple-pay-web-sdk, read 2026-09-29):
 *   - `customer` — REQUIRED by the SDK; sent from the account or the guest's
 *     contact fields (`lib/wallets/apple-customer.ts`), never invented. Tap's
 *     backend REFUSES the setup without a first name and an email or phone
 *     (1129/1130/1139, 2026-10-14), so the button is drawn only for a
 *     customer who has them (`appleCustomerGap`); both are sent when known.
 *   - `debug` — on while the SDK runs in `development` (staging), off in
 *     production.
 *   - `onReady` — the space is held (a placeholder) until Apple's button can
 *     be pressed.
 *   - `onMerchantValidation` — Apple checking this merchant and domain. An
 *     `error` there is not the customer's doing (domain file, merchant id,
 *     environment); it is reported as a wallet failure and named in the
 *     console so it can be diagnosed on a device.
 *   - `abortApplePaySession` — a sheet still open when this button goes away
 *     (the customer picked another method) is closed, not left orphaned.
 *   - Not used: `shippingContactFields` and the `onShipping…`/`onCoupon…`/
 *     `onPaymentMethodSelected` total updates — digital goods have no
 *     shipping, and the total is the server's, never recomputed in the sheet.
 *   - `acceptance` — always sent (1.3.0 reads it with no default and threw
 *     without it); `supportedBrands` inside it ONLY when the server names brands.
 *     Builds 1.2.0 and 1.3.0 check a list against the merchant's Tap profile and throw
 *     on any brand the profile lacks (`mada` on an AED order failed every
 *     press); with none, it offers exactly the profile's brands.
 *
 * WHAT THE SHEET SAYS IS WHAT HAPPENED. The SDK completes Apple's sheet only
 * when `onSuccess` settles — so `onToken` returns the payment's promise, and
 * the sheet shows success or failure from OUR answer, not before the charge
 * exists (capped at `SHEET_WAIT_MS`, inside Apple's own limit).
 *
 * ONE DRAWING AT A TIME. While Apple's sheet is open, a new amount or customer
 * does not redraw the button (the redraw would orphan the sheet: the SDK's
 * abort is a window message that its unmount silences before it arrives).
 * Callbacks from a drawing already replaced answer nothing — a token from the
 * old one is refused, and its sheet shows a failure.
 */
/**
 * BUILD 1.3.0 (2026-11-02), Tap's first with Jaywan, the UAE's national card
 * scheme (developers.tap.company/docs/jaywan): Jaywan cards in the wallet are
 * offered when the merchant's Tap profile has them, because no brand list is
 * sent (above). Published on Tap's own CDN only (next.config.ts, script-src).
 */
export const APPLE_PAY_SDK = "https://cdn.tap.company/tap-sdks/apple-pay/build-1.3.0/main.js";
const APPLE_PAY_CSS = "https://cdn.tap.company/tap-sdks/apple-pay/build-1.3.0/main.css";

/**
 * How long Apple's sheet waits for our answer before showing success anyway
 * (Apple allows ~30 s). A payment that STARTED moves the page on — the action
 * redirects and never answers — so leaving the page also releases the sheet.
 */
const SHEET_WAIT_MS = 15_000;

export interface ApplePayConfig {
  public_key: string;
  merchant_id: string;
  domain: string;
  environment?: string;
  supported_brands?: string[];
}

interface TapApplePaySdk {
  /** A singleton: while one is mounted, `render` returns it and draws nothing. */
  render: (config: Record<string, unknown>, elementId: string) => { unmount?: () => void } | undefined;
  /** Closes an Apple Pay sheet that is still open. */
  abortApplePaySession?: () => void;
}

declare global {
  interface Window {
    TapApplepaySDK?: TapApplePaySdk;
    ApplePaySession?: { canMakePayments?: () => boolean };
  }
}

/** Whether this browser can pay with Apple Pay at all. */
export function applePaySupported(): boolean {
  try {
    return typeof window !== "undefined" && window.ApplePaySession?.canMakePayments?.() === true;
  } catch {
    return false;
  }
}

function noSubscription(): () => void {
  return () => undefined;
}

function loadStyles(): void {
  if (document.querySelector(`link[href="${APPLE_PAY_CSS}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = APPLE_PAY_CSS;
  link.referrerPolicy = "no-referrer";
  document.head.appendChild(link);
}

/** One line of a wallet's sheet: a label and the server's figure for it. */
export interface WalletLineItem {
  label: string;
  amount: string;
}

export function ApplePayButton({
  locale,
  config,
  amount,
  currency,
  disabled,
  onToken,
  onCancel,
  onError,
  onAvailable,
  contact,
  items,
}: {
  locale: Locale;
  /**
   * The wallet's public configuration. Typed as possibly missing on purpose:
   * a caller's offer is data from the API (and, on the product page, from a
   * server render that may be an older release), and a missing one made the
   * dependency list below throw on every render (Sentry
   * CHARGERQUICK-STOREFRONT-G). Without it nothing is drawn.
   */
  config: ApplePayConfig | null | undefined;
  amount: string;
  currency: string;
  /**
   * The lines Apple's sheet lists above the total — the server's own figures
   * (the goods, then «رسوم المعالجة»), never added up here. Absent or empty:
   * the total alone, as before. Part of the DRAWING, so a new set waits for
   * Tap's onReady like any other redraw.
   */
  items?: readonly WalletLineItem[];
  /** Who is paying — the account's details, or what a guest typed. */
  contact?: CheckoutContact | null;
  disabled?: boolean;
  /**
   * The approved token, with the figure the sheet SHOWED — which the server
   * then checks against the order (`expected_total`). Return the payment's
   * promise: its settling is what Apple's sheet reports.
   */
  onToken: (token: string, shown: Money) => Promise<unknown> | void;
  /**
   * The sheet closed without paying. `afterToken`: this sheet already handed
   * a token over (Apple's sheet stays open on a refused payment, and closing
   * it then is a cancel) — the payment's own answer stands.
   */
  onCancel: (sheet: { afterToken: boolean }) => void;
  /**
   * The wallet gave up, with why as short words. REPORTED BY THE CALLER
   * (`wallet_error` at checkout, `express_pay_failed` on the product page):
   * a caller removes this button in answer, so a report held here for the
   * page-leave grace died with it — none ever reached Sentry.
   */
  onError: (failure: WalletFailure) => void;
  /** Told whether this browser can pay with Apple Pay — the checkout lists the wallet only then. */
  onAvailable?: (available: boolean) => void;
}) {
  const elementId = `apple-pay-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  // Read on the client only — the server renders nothing, and so does a
  // browser without Apple Pay, so hydration never disagrees.
  const canPay = useSyncExternalStore(noSubscription, applePaySupported, () => false);
  const [failed, setFailed] = useState(false);
  const configured = Boolean(config?.public_key && config.merchant_id && config.domain);
  const supported = canPay && !failed && configured;

  // The customer as Tap wants it — settled for a moment before it redraws the
  // button, so a guest still typing their email does not redraw it per key.
  const customerKey = JSON.stringify(appleCustomer(contact, locale));
  const [settledCustomer, setSettledCustomer] = useState(customerKey);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettledCustomer(customerKey), 600);
    return () => window.clearTimeout(timer);
  }, [customerKey]);

  // What the button is DRAWN with — the latest props, except while Apple's
  // sheet is open: then the drawing holds still until the sheet closes.
  // NUL separates the parts: JSON never contains a raw one.
  const wanted = [amount, currency, locale, settledCustomer, JSON.stringify(items ?? [])].join("\u0000");
  const wantedRef = useRef(wanted);
  const sheetOpen = useRef(false);
  const [drawing, setDrawing] = useState(wanted);
  useEffect(() => {
    wantedRef.current = wanted;
    if (!sheetOpen.current) setDrawing(wanted);
  }, [wanted]);
  const sheetClosed = useRef(() => {
    sheetOpen.current = false;
    setDrawing(wantedRef.current);
  }).current;
  const [drawnAmount = "", drawnCurrency = "", , drawnCustomer = "null", drawnItems = "[]"] = drawing.split("\u0000");
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const ready = readyFor === drawing;
  const disabledRef = useRef(disabled);
  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);
  const announce = useRef(onAvailable);
  useEffect(() => {
    announce.current = onAvailable;
  }, [onAvailable]);
  useEffect(() => {
    announce.current?.(supported);
  }, [supported]);
  const handlers = useRef({ onToken, onCancel, onError });
  useEffect(() => {
    handlers.current = { onToken, onCancel, onError };
  }, [onToken, onCancel, onError]);

  // NO FIRST NAME OR NO WAY TO REACH THEM, NO DRAWING. Tap refuses the
  // button's setup without a first name and an email or phone (1129/1130/
  // 1139, `appleCustomerGap`). Callers draw this button only for such a
  // customer; this guard is the last line — it never calls Tap, and says
  // nothing (no error, no "unavailable"), so the caller's own choice stands.
  const drawnAs = JSON.parse(drawnCustomer) as TapApplePayCustomer | null;
  // (A Tap customer id stands in for both — `appleCustomerGap`.)
  const named = Boolean(drawnAs?.id || (drawnAs?.name?.[0]?.first && (drawnAs.contact?.email || drawnAs.contact?.phone)));

  useEffect(() => {
    if (!supported || !named || !config) return;
    let cancelled = false;
    let mounted: { unmount?: () => void } | undefined;
    const element = document.getElementById(elementId);

    let loaded: TapApplePaySdk | undefined;
    const environment = config.environment ?? "production";
    const customer = JSON.parse(drawnCustomer) as ReturnType<typeof appleCustomer>;
    const brands = config.supported_brands ?? [];
    const shown: Money = { amount: drawnAmount, currency: drawnCurrency };
    const lines = JSON.parse(drawnItems) as WalletLineItem[];
    // Sheets waiting on our answer, released the moment this page moves on
    // (a started payment navigates instead of answering).
    /** The customer pressed this drawing's button — an error after it is the sheet's, before it the setup's. */
    let pressed = false;
    /** This sheet handed a token to `onToken` — a payment may have started. Reset by the next press. */
    let tokenHanded = false;
    const waiting = new Set<() => void>();
    const release = () => waiting.forEach((done) => done());
    window.addEventListener("pagehide", release);

    loadStyles();
    loadScript(APPLE_PAY_SDK, () => window.TapApplepaySDK)
      .then((sdk) => {
        if (cancelled || !element) return;
        loaded = sdk;
        element.replaceChildren();
        mounted = sdk.render(
          {
            debug: environment === "development",
            publicKey: config.public_key,
            environment,
            scope: "TapToken",
            merchant: { domain: config.domain, id: config.merchant_id },
            // ALWAYS a block, empty unless the server names brands: build 1.3.0
            // reads `acceptance.supportedBrands` (and three siblings) with no
            // default, so an absent block threw inside the SDK and the button
            // never drew (production, 2026-11-02, v62). Empty = the profile's brands.
            acceptance: brands.length > 0 ? { supportedBrands: brands } : {},
            features: { supportsCouponCode: false },
            transaction: {
              amount: shown.amount,
              currency: shown.currency,
              // Tap's build 1.2.0 hands `items` to Apple as `lineItems`.
              ...(lines.length > 0 ? { items: lines.map((line) => ({ type: "final", label: line.label, amount: line.amount })) } : {}),
            },
            ...(customer ? { customer } : {}),
            interface: {
              locale,
              theme: document.documentElement.dataset.theme === "dark" ? "light" : "dark",
              type: "buy",
              edges: "curved",
            },
            onClick: () => {
              if (cancelled) return;
              sheetOpen.current = true;
              pressed = true;
              tokenHanded = false;
            },
            onSuccess: async (data: unknown) => {
              // A drawing already replaced, or a button that is locked: no
              // token is used, and the throw makes Apple's sheet say so.
              if (cancelled || disabledRef.current) {
                sheetClosed();
                throw new SheetRefusal("inactive");
              }
              const id = (data as { id?: unknown } | null)?.id;
              if (typeof id !== "string" || !/^tok_[A-Za-z0-9_]+$/.test(id)) {
                sheetClosed();
                handlers.current.onError(walletFailure(undefined, "token", tokenHanded));
                throw new Error("token");
              }
              tokenHanded = true;
              try {
                const outcome = handlers.current.onToken(id, shown);
                if (outcome) {
                  let done!: () => void;
                  const left = new Promise<void>((resolve) => {
                    done = resolve;
                    waiting.add(resolve);
                    window.setTimeout(resolve, SHEET_WAIT_MS);
                  });
                  try {
                    await Promise.race([outcome, left]);
                  } finally {
                    waiting.delete(done);
                  }
                }
              } finally {
                sheetClosed();
              }
            },
            onReady: () => {
              if (!cancelled) setReadyFor(drawing);
            },
            onMerchantValidation: (status: unknown) => {
              if (status === "error" && !cancelled) {
                // Not the customer's doing: the merchant or domain was refused.
                console.warn("Apple Pay merchant validation failed", { environment, domain: config.domain });
                sheetClosed();
                handlers.current.onError(walletFailure(undefined, "merchant", tokenHanded));
              }
            },
            onCancel: () => {
              if (cancelled) return;
              sheetClosed();
              handlers.current.onCancel({ afterToken: tokenHanded });
            },
            onError: (error: unknown) => {
              if (cancelled) return;
              sheetClosed();
              // WHY, as short words only (Sentry CHARGERQUICK-STOREFRONT-4
              // said nothing but "wallet_error"): failed while the button was
              // being set up, or after the press; the SDK's reason, code and
              // error class. The caller reports it (see `onError`).
              handlers.current.onError(walletFailure(error, pressed ? "after_press" : "setup", tokenHanded));
            },
          },
          elementId,
        );
      })
      .catch(() => {
        if (cancelled) return;
        reportPaymentSignal("sdk_load_failed", { sdk: "apple_pay" });
        setFailed(true);
      });

    return () => {
      cancelled = true;
      // The page moved on — a started payment's navigation: the sheet that
      // waited for it completes now instead of spinning to the cap.
      release();
      window.removeEventListener("pagehide", release);
      // A sheet still open closes with its button.
      try {
        loaded?.abortApplePaySession?.();
      } catch {
        // No session was open.
      }
      // Unmount first — Tap's SDK keeps its one instance until told, and a
      // later render (a new amount, a remount) would otherwise draw nothing.
      mounted?.unmount?.();
      if (element) element.replaceChildren();
    };
    // `supported_brands` by content, not identity: a fresh array from the
    // server on every render must not redraw the button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, named, elementId, config?.public_key, config?.merchant_id, config?.domain, config?.environment, (config?.supported_brands ?? []).join(","), locale, drawing]);

  if (!supported || !named) return null;

  return (
    <div className="relative min-h-[48px] w-full">
      {/* Held until Apple's button can be pressed (`onReady`). */}
      {ready ? null : <div aria-hidden className="pointer-events-none absolute inset-0 motion-safe:animate-pulse rounded-[12px] bg-[var(--color-chip)]" />}
      {/* `inert` while locked: no pointer AND no keyboard can reach Apple's
          button (pointer-events alone left Enter on a focused button).
          HIDDEN UNTIL `onReady`: Apple's element draws at once, but Tap's
          press handler does nothing until its checkout profile arrives (~4 s
          on stage, again after every redraw) — a black button that ignored
          the first taps (owner on an iPhone, 2026-10-16). Tap calls
          `onReady` once that profile request settles, failed or not, so the
          button never stays hidden. Transparent and `inert`, not
          `invisible`: Apple's shadow wrapper sets its own `visibility:
          visible`, which would show through a hidden parent. */}
      <div
        id={elementId}
        data-wallet="apple_pay"
        aria-disabled={disabled}
        aria-busy={!ready}
        inert={disabled || !ready || undefined}
        className={`relative min-h-[48px] w-full ${!ready ? "opacity-0" : disabled ? "pointer-events-none opacity-50" : ""}`}
      />
    </div>
  );
}
