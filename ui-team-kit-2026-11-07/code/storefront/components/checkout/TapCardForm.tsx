"use client";

import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from "react";

import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { reportPaymentSignal, sdkErrorKind } from "@/lib/monitoring/payment-signal";
import { loadScript } from "@/lib/wallets/load-script";

/**
 * Tap's embedded card fields — Web Card SDK V2 — on our own checkout.
 *
 * THE PCI BOUNDARY IS THIS COMPONENT'S WHOLE REASON TO BE SHAPED THIS WAY.
 * The card number, expiry and CVV are typed into iframes Tap serves; this
 * component never sees them, never holds them in state, never logs them. What
 * crosses back is ONE string, the single-use `tok_…` from `onSuccess`, and
 * nothing else from that payload is read — it also carries the card's brand,
 * last four and expiry, none of which our servers may be handed.
 *
 * THE SCRIPT IS TAP'S OWN, PINNED. The URL is the one Tap's documentation
 * gives for V2 (`card/1.0.2`) — there is no npm package, and none is invented.
 * No `integrity` attribute, deliberately: the CDN sends no CORS headers, so a
 * browser cannot check a hash on it and would refuse to run the script at all.
 * The pin and `scripts/check-tap-sdk.mjs` (a recorded SHA-384, compared with
 * what the CDN serves) are the substitute — see the security note in the
 * payment audit.
 *
 * ONE TOKEN PER PRESS. `tokenize()` hands back the promise already in flight
 * when called twice, so a double-click cannot mint two tokens; the caller's
 * own pending state and the API's per-order lock hold the lines after it.
 *
 * NO OPERATION ID. SDK 1.0.2 answers a `tokenize()` with a window message that
 * names no request (and its listener checks no origin), so a token arriving
 * after a timeout would otherwise resolve the NEXT press — possibly for a card
 * the customer has since retyped. A timed-out tokenization therefore REDRAWS
 * the form: the old iframe and its listener go, and nothing late can land.
 */

const SDK_URL = "https://tap-sdks.b-cdn.net/card/1.0.2/index.js";

/** How long a tokenization may take before the customer is told to try again. */
const TOKENIZE_TIMEOUT_MS = 45_000;

/** How long the drawn form may take to say it is ready before it is called unavailable. */
const READY_TIMEOUT_MS = 20_000;

/** The id SDK 1.0.2 gives its one card iframe — `tokenize()` silently does nothing without it. */
const CARD_IFRAME_ID = "tap-card-iframe";

interface CardSdk {
  renderTapCard: (elementId: string, config: Record<string, unknown>) => { unmount: () => void };
  tokenize: () => void;
  resetCardInputs?: () => void;
}

declare global {
  interface Window {
    CardSDK?: CardSdk;
  }
}

/** The SDK script, injected once per page and shared by every form that needs it. */
function loadSdk(): Promise<CardSdk> {
  return loadScript(SDK_URL, () => window.CardSDK);
}

export interface TapCardHandle {
  /** A fresh single-use `tok_…` for what is in the fields now. */
  tokenize(): Promise<string>;
  /** Empty the fields — after a decline the customer may want another card. */
  reset(): void;
}

export interface TapCardConfig {
  public_key: string;
  merchant_id?: string | null;
  /** v0.1.38 — Tap has granted saved cards; «حفظ البطاقة» may be offered. */
  save_card?: boolean;
  /**
   * v0.1.131 — the networks the form accepts, in Tap's spellings, from the
   * server (config/tap.php, "CARD NETWORKS"): Visa and Mastercard until Tap
   * activates American Express, never mada by default (owner, 2026-10-14).
   */
  supported_brands?: string[];
}

/** An API that predates v0.1.131 names no networks: Visa and Mastercard — never mada. */
export const DEFAULT_CARD_BRANDS: readonly string[] = ["VISA", "MASTERCARD"];

function cardBrands(brands: readonly string[] | undefined): string[] {
  const named = (brands ?? []).filter((brand) => typeof brand === "string" && brand !== "");
  return named.length > 0 ? named : [...DEFAULT_CARD_BRANDS];
}

export function TapCardForm({
  handle,
  locale,
  sdk,
  amount,
  currency,
  onValidChange,
  onFallback,
}: {
  handle: Ref<TapCardHandle>;
  locale: Locale;
  sdk: TapCardConfig;
  /**
   * The SERVER's figure for what will be charged — Tap's SDK requires a
   * transaction amount in its configuration. Passed through, never computed:
   * the charge itself is created by Laravel from the order, and ignores this.
   */
  amount: string;
  currency: string;
  onValidChange: (valid: boolean) => void;
  /**
   * Offered when the card form cannot be drawn: pay the SAME order on Tap's
   * hosted page instead. Not an independent route — if Tap itself is down,
   * that page is too.
   */
  onFallback?: () => void;
}) {
  const m = messagesFor(locale);
  const elementId = `tap-card-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  /** Why the customer is looking at an empty form, when it is not their card's fault. */
  const [notice, setNotice] = useState<"reloaded" | "network" | null>(null);
  const [cardError, setCardError] = useState(false);

  const pending = useRef<{
    promise: Promise<string>;
    resolve: (token: string) => void;
    reject: (error: Error) => void;
  } | null>(null);
  const validRef = useRef(onValidChange);
  useEffect(() => {
    validRef.current = onValidChange;
  }, [onValidChange]);

  // Read when the form is DRAWN, never a reason to redraw it: SDK 1.0.2 does
  // not use the amount at all (its iframe options carry only the currency),
  // and redrawing erased the card the customer had typed whenever the total
  // moved — a method switch, a coupon.
  const amountRef = useRef(amount);
  useEffect(() => {
    amountRef.current = amount;
  }, [amount]);

  // The networks by CONTENT, not identity: a fresh array in every response
  // must not redraw the form and erase the card being typed.
  const brandList = (sdk.supported_brands ?? []).join(",");

  useEffect(() => {
    let unmount: (() => void) | null = null;
    let cancelled = false;
    let ready = false;
    validRef.current(false);

    // Drawn but never ready (a blocked frame, an SDK that stalled): said, with
    // a way to try again, instead of «loading» forever.
    const watchdog = window.setTimeout(() => {
      if (cancelled || ready) return;
      setState("failed");
      reportPaymentSignal("sdk_ready_timeout", { sdk: "card" });
    }, READY_TIMEOUT_MS);

    loadSdk()
      .then((cardSdk) => {
        if (cancelled) return;
        const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";

        const rendered = cardSdk.renderTapCard(elementId, {
          publicKey: sdk.public_key,
          ...(sdk.merchant_id ? { merchant: { id: sdk.merchant_id } } : {}),
          // Tap's SDK wants a number here; this is the server's figure, read
          // for the SDK's own display and never used to charge anything.
          transaction: { amount: Number(amountRef.current), currency },
          // The server's networks — Tap's guide: list only those enabled on
          // the account, or a card is typed and then refused.
          acceptance: { supportedBrands: cardBrands(brandList.split(",")), supportedCards: "ALL" },
          fields: { cardHolder: true },
          // No SDK "save card" tick box: our own consent box under the form
          // (PaymentSection) is the one that counts, and Laravel honours it
          // only for a signed-in customer while Tap's grant is on.
          addons: { displayPaymentBrands: true, loader: true, saveCard: false },
          interface: {
            locale,
            theme,
            edges: "curved",
            // ALWAYS left to right. A card number, its expiry and its CVV
            // are Latin digits read left to right on an Arabic page too; laid
            // out right to left the digits read reversed and the expiry is
            // typed backwards (the owner, 2026-09-30). Labels stay Arabic.
            direction: "ltr",
          },
          onReady: () => {
            if (cancelled) return;
            ready = true;
            setState("ready");
          },
          // TAP CALLS BOTH, EVERY TIME, WITH A BOOLEAN (read from SDK
          // 1.0.2's own `isAllInputsValid`): a complete card fires
          // `onValidInput(true)` AND THEN `onInvalidInput(false)`. Ignoring
          // the argument let the second call undo the first, so the real
          // form never unlocked Pay (the owner, 2026-09-30) — only the test
          // double, which calls one of them, ever did.
          onValidInput: (valid: unknown) => {
            if (cancelled) return;
            const complete = valid !== false;
            if (complete) setCardError(false);
            validRef.current(complete);
          },
          onInvalidInput: (invalid: unknown) => {
            if (cancelled) return;
            if (invalid !== false) validRef.current(false);
          },
          onSuccess: (data: unknown) => {
            // A form already taken down (a redraw) answers nothing: its
            // token is for a card that may no longer be the one on screen.
            if (cancelled) return;
            // THE TOKEN ID, AND NOTHING ELSE, leaves this callback.
            const id = (data as { id?: unknown } | null)?.id;
            const current = pending.current;
            pending.current = null;
            if (typeof id === "string" && /^tok_[A-Za-z0-9_]+$/.test(id)) current?.resolve(id);
            else current?.reject(new Error("tokenize"));
          },
          onError: (error: unknown) => {
            if (cancelled) return;
            const current = pending.current;
            pending.current = null;
            // The CATEGORY only — an SDK error can echo card facts.
            const kind = sdkErrorKind(error);
            reportPaymentSignal("card_sdk_error", { sdk: "card", kind });
            if (kind === "network" || kind === "timeout") setNotice("network");
            else setCardError(true);
            current?.reject(new Error(kind));
          },
        });

        unmount = rendered.unmount;
      })
      .catch(() => {
        if (cancelled) return;
        setState("failed");
        reportPaymentSignal("sdk_load_failed", { sdk: "card" });
      });

    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
      pending.current?.reject(new Error("unmounted"));
      pending.current = null;
      unmount?.();
    };
    // `currency` and the keys redraw the form; `attempt` is the "load again"
    // button and the redraw after a timed-out tokenization. NOT the amount —
    // see `amountRef`.
  }, [elementId, sdk.public_key, sdk.merchant_id, brandList, currency, locale, attempt]);

  useImperativeHandle(
    handle,
    () => ({
      tokenize() {
        if (pending.current) return pending.current.promise;
        const cardSdk = window.CardSDK;
        // No SDK, or no card iframe: `tokenize()` would post to nothing and
        // the customer would wait the whole timeout for an answer that
        // cannot come.
        if (!cardSdk || !document.getElementById(CARD_IFRAME_ID)) return Promise.reject(new Error("not ready"));

        let resolve!: (token: string) => void;
        let reject!: (error: Error) => void;
        const promise = new Promise<string>((ok, fail) => {
          resolve = ok;
          reject = fail;
        });
        const timer = window.setTimeout(() => {
          if (pending.current?.promise !== promise) return;
          pending.current = null;
          reject(new Error("timeout"));
          // A late answer from THIS tokenization must not reach the next
          // press: redraw, which drops the iframe and the SDK's listener.
          reportPaymentSignal("tokenize_timeout", { sdk: "card" });
          setNotice("reloaded");
          setState("loading");
          setAttempt((n) => n + 1);
        }, TOKENIZE_TIMEOUT_MS);
        promise.then(
          () => window.clearTimeout(timer),
          () => window.clearTimeout(timer),
        );

        pending.current = { promise, resolve, reject };
        setNotice(null);
        try {
          cardSdk.tokenize();
        } catch (error) {
          pending.current = null;
          reject(error instanceof Error ? error : new Error("tokenize"));
        }
        return promise;
      },
      reset() {
        window.CardSDK?.resetCardInputs?.();
        validRef.current(false);
      },
    }),
    [],
  );

  return (
    <section aria-labelledby={`${elementId}-title`} className="space-y-3">
      {/* The card block's header («Checkout Mobile», 2026-09-30): the lock in
          the success green at the start, the title over the reassurance line
          — the same at every width. */}
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className="mt-0.5 block size-4 shrink-0 bg-[var(--color-success)] [mask-image:url(/brand/icon-lock.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:13px_14.33px]"
        />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3
            id={`${elementId}-title`}
            className="text-caption font-extrabold leading-[16.5px] text-[var(--color-ink)] lg:text-body-s lg:font-bold lg:leading-[1.4]"
          >
            {m.payment.cardTitle}
          </h3>
          <span className="text-caption font-bold leading-[15px] text-[var(--color-success)] lg:text-body-s lg:leading-[1.4]">
            {m.payment.secureShort}
          </span>
        </div>
      </div>

      {/* Tap draws its iframes into this element. Its height is reserved so
          the invoice beside it does not jump when the fields arrive. On the
          phone it is the comp's white field block (r12, a hairline shadow),
          outlined red while the card is refused.

          NO INNER PADDING: Tap lays the card number, expiry and CVV out on ONE
          row inside its iframe (measured on staging, 95px tall at every width
          from 200 to 600) and the SDK has no layout option — so every pixel
          of width given to the iframe is legibility for those three fields.
          The comp's two-row arrangement (`7416:42439`) would need our own card
          inputs, which PCI rules out (HANDBOOK §3). */}
      <div className="relative">
        <div
          id={elementId}
          aria-busy={state === "loading"}
          className={`min-h-[95px] overflow-hidden rounded-[12px] border bg-[var(--color-surface)] max-lg:shadow-[0_1px_2px_rgba(0,0,0,0.05)] ${
            cardError ? "border-[var(--color-error)] lg:border-[var(--color-input-border)]" : "border-[var(--color-input-border)] max-lg:border-transparent"
          }`}
        />

        {/* THE FIELDS' SHAPE while the SDK loads: a number row, then expiry and
            CVC side by side. It is a SIBLING laid over Tap's element, never a
            child — the SDK owns what is inside that one — and it is only a
            picture: it takes no pointer, no focus and no part in the accessible
            tree (the «loading» line below is what is announced). It is gone the
            moment the SDK says it is ready. */}
        {state === "loading" ? (
          <div aria-hidden data-card-skeleton className="pointer-events-none absolute inset-0 flex flex-col gap-2.5 rounded-[12px] bg-[var(--color-surface)] p-3">
            <span className="cq-skeleton block flex-1 rounded-[8px]" />
            <span className="flex flex-1 gap-2.5">
              <span className="cq-skeleton block flex-1 rounded-[8px]" />
              <span className="cq-skeleton block flex-1 rounded-[8px]" />
            </span>
          </div>
        ) : null}
      </div>

      {state === "loading" ? (
        <p role="status" className="text-body-s text-[var(--color-ink-muted)] lg:text-body-l">
          {m.payment.cardLoading}
        </p>
      ) : null}

      {state === "failed" ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-body-s text-[var(--color-danger)] lg:text-body-l">
          <span>{m.payment.cardUnavailable}</span>
          <button
            type="button"
            onClick={() => {
              setState("loading");
              setAttempt((n) => n + 1);
            }}
            className="rounded-lg border border-current px-3 py-1 font-semibold"
          >
            {m.payment.retry}
          </button>
          {onFallback ? (
            <button type="button" onClick={onFallback} className="rounded-lg border border-current px-3 py-1 font-semibold">
              {m.payment.hostedFallback}
            </button>
          ) : null}
        </div>
      ) : null}

      {notice && state !== "failed" ? (
        <p role="status" className="text-caption font-semibold leading-[13.5px] text-[var(--color-ink-muted)] lg:text-body-s">
          {notice === "reloaded" ? m.payment.cardReloaded : m.payment.cardNetworkError}
        </p>
      ) : null}

      {cardError ? (
        <p role="alert" className="text-caption font-semibold leading-[13.5px] text-[var(--color-danger)] lg:text-body-s lg:font-medium lg:leading-normal">
          {m.payment.cardInvalid}
        </p>
      ) : null}
    </section>
  );
}
