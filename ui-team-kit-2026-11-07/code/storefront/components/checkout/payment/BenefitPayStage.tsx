"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { checkBenefitPay, closeBenefitPay, openBenefitPay, type BenefitPaySession } from "@/lib/checkout/benefit-pay";
import type { Locale } from "@/lib/i18n/locales";
import { formatMoney, messagesFor } from "@/lib/i18n/messages";
import { reportPaymentSignal, reportPaymentSignalUnlessLeft, sdkErrorKind, sdkErrorReason } from "@/lib/monitoring/payment-signal";
import { loadScript } from "@/lib/wallets/load-script";

/**
 * BenefitPay for a placed BHD order — Tap's BenefitPay Web SDK, the VANILLA
 * build Tap's own integration guide names (build-1.0.10, "Benefit Pay
 * Integration using Vanilla JS", developers.tap.company/docs/benefitpay-web-sdk);
 * see the payment audit for why not the npm package in this React 19 app.
 * Only the callbacks that guide documents are used: onReady, onClick,
 * onSuccess, onCancel, onError.
 *
 * ONE BUTTON PER PAGE. The SDK's `render` is a singleton: while an instance
 * is mounted, a second call returns it and draws nothing. So the instance is
 * UNMOUNTED on cleanup — without that, the new code offered after a cancel
 * or an expiry came up blank.
 *
 * THE ENVIRONMENT IS REQUIRED. Build 1.0.10 accepts `live` or `development`
 * and THROWS on anything else — nothing at all included — before it draws
 * (read in the pinned build). Laravel picks it from the key; anything else
 * is refused here rather than handed to an SDK that would show a blank box.
 *
 * READY MEANS THE SDK SAID SO (`onReady`), not that our server answered —
 * with a watchdog, so a button that never draws is said, not waited on.
 *
 * THE BUTTON IS SIGNED BY LARAVEL. Its `hashString` is an HMAC Laravel makes
 * with the secret key over this attempt's amount, currency, reference and
 * webhook URL; this component only passes it on.
 *
 * PAID MEANS LARAVEL SAYS SO. The charge id the button reports
 * (`onSuccess`) is handed to Laravel, which checks it with Tap and binds
 * it only to this order's attempt; until then this polls — one request at a
 * time, backing off, paused while the tab is hidden.
 *
 * NEVER «FAILED» WHILE MONEY MAY HAVE MOVED. Once the customer has opened the
 * QR, a charge may exist on their phone: an SDK error then (its own network
 * call after they approved in the app reports through `onError`) or a QR past
 * its window is UNRESOLVED — "we are confirming, don't pay again" — never a
 * failure with an invitation to pay another way. Only Laravel's answer about
 * a charge it has bound can say failed.
 */
export const BENEFIT_PAY_SDK = "https://tap-sdks.b-cdn.net/benefit-pay/build-1.0.10/main.js";

/** The only environments Tap's BenefitPay build 1.0.10 accepts. */
const ENVIRONMENTS = new Set(["live", "development"]);

/** How long the drawn button may take to say it is ready. */
const READY_TIMEOUT_MS = 20_000;

/** Waits between checks: quick at first, then backing off. */
const POLL_STEPS_MS = [4_000, 4_000, 4_000, 6_000, 8_000, 12_000, 15_000];
const POLL_MAX_MS = 30_000;

/** After the code's window, how long to keep confirming before saying "unresolved". */
const GRACE_MS = 60_000;

interface TapBenefitPaySdk {
  render: (config: Record<string, unknown>, elementId: string) => { unmount?: () => void } | undefined;
}

declare global {
  interface Window {
    TapBenefitpaySDK?: TapBenefitPaySdk;
  }
}

type Stage =
  | "loading"
  | "ready"
  | "waiting"
  /** Nothing can have been charged: the code expired unscanned, or the button never worked. */
  | "expired"
  | "failed"
  | "busy"
  /** Card payments are paused by staff (v0.1.129): no QR opens; another way to pay. */
  | "paused"
  /** Money may have moved and we cannot yet say: confirm, don't pay again. */
  | "unresolved"
  /** A payment from the phone reached us while the customer was cancelling. */
  | "bound"
  | "paid";

export function BenefitPayStage({
  locale,
  orderId,
  onCancel,
}: {
  locale: Locale;
  orderId: string;
  /**
   * The customer chose another way to pay and the QR was closed. The order
   * stays placed; `holdSeconds` is how long before another method may start.
   */
  onCancel: (holdSeconds: number) => void;
}) {
  const m = messagesFor(locale);
  const elementId = `benefit-pay-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [stage, setStage] = useState<Stage>("loading");
  const [session, setSession] = useState<BenefitPaySession | null>(null);
  const [round, setRound] = useState(0);
  const [cancelProblem, setCancelProblem] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const chargeId = useRef<string | undefined>(undefined);
  /** A charge from the customer's phone has reported itself (its id). */
  const [reported, setReported] = useState(false);
  /** The customer opened the QR — from then on a charge may exist on their phone. */
  const opened = useRef(false);
  const stageRef = useRef<Stage>("loading");
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  const finish = useCallback(() => {
    setStage("paid");
    const tap = chargeId.current ? `&tap_id=${encodeURIComponent(chargeId.current)}` : "";
    window.location.assign(`/${locale}/payment/complete?order=${encodeURIComponent(orderId)}${tap}`);
  }, [locale, orderId]);

  // Open (or re-open) the attempt and get the signed configuration.
  useEffect(() => {
    let cancelled = false;
    openBenefitPay(orderId, locale).then((result) => {
      if (cancelled) return;
      if (result.ok && !ENVIRONMENTS.has(String(result.session.environment ?? ""))) {
        // An SDK handed anything else throws before drawing: say so now.
        reportPaymentSignal("benefitpay_bad_environment", { sdk: "benefit_pay" });
        setStage("failed");
      } else if (result.ok) {
        setSession(result.session);
      } else {
        // Laravel refused to open the QR: counted, so a BenefitPay that
        // never starts is visible in Sentry rather than only on the screen.
        if (!result.busy && !result.paused) reportPaymentSignal("benefitpay_start_refused", { sdk: "benefit_pay" });
        setStage(result.paused ? "paused" : result.busy ? "busy" : "failed");
      }
    }).catch(() => {
      // No answer at all: no QR was opened, so nothing can have been
      // charged — a plain failure with a new code offered, never "loading" forever.
      if (!cancelled) setStage("failed");
    });
    return () => {
      cancelled = true;
    };
  }, [orderId, locale, round]);

  /** The QR closed without paying — Laravel is asked, and its answer decides what the customer sees. */
  const cancel = useCallback(async () => {
    setCancelling(true);
    const closed = await closeBenefitPay(orderId, locale);
    setCancelling(false);

    if (closed?.bound) {
      // A payment from the phone already reached us: never invite a second.
      setStage("bound");
      return;
    }
    if (!closed) {
      // We cannot tell whether the code was closed: say so, and stay.
      setCancelProblem(true);
      return;
    }
    onCancel(closed.holdSeconds);
  }, [orderId, locale, onCancel]);
  // The SDK's own cancel reaches the latest `cancel` without redrawing the
  // button (a redraw would throw away an open QR).
  const cancelRef = useRef(cancel);
  useEffect(() => {
    cancelRef.current = cancel;
  }, [cancel]);

  // Draw Tap's button once we have it.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    let ready = false;
    let mounted: { unmount?: () => void } | undefined;
    const element = document.getElementById(elementId);
    // Checked when the session arrived; only a valid one is ever set.
    const environment = String(session.environment ?? "");

    const watchdog = window.setTimeout(() => {
      if (cancelled || ready || opened.current) return;
      reportPaymentSignal("sdk_ready_timeout", { sdk: "benefit_pay" });
      setStage("failed");
    }, READY_TIMEOUT_MS);

    loadScript(BENEFIT_PAY_SDK, () => window.TapBenefitpaySDK)
      .then((sdk) => {
        if (cancelled || !element) return;
        element.replaceChildren();
        const [first, last] = [session.customer?.first_name, session.customer?.last_name] as [string?, string?];
        const phone = session.customer?.phone as { country_code?: string; number?: string } | undefined;

        mounted = sdk.render(
          {
            environment,
            operator: { publicKey: session.public_key, hashString: session.hash_string },
            merchant: { id: session.merchant_id },
            transaction: { amount: session.amount, currency: session.currency },
            reference: { transaction: session.transaction_reference, order: session.order_reference },
            customer: {
              names: [{ lang: locale, first: first ?? "", last: last ?? "" }],
              contact: {
                ...(session.customer?.email ? { email: session.customer.email } : {}),
                ...(phone?.number ? { phone: { countryCode: phone.country_code ?? "", number: phone.number } } : {}),
              },
            },
            interface: { locale, edges: "curved" },
            post: { url: session.post_url },
            onReady: () => {
              if (cancelled) return;
              ready = true;
              setStage((now) => (now === "loading" ? "ready" : now));
            },
            onClick: () => {
              if (!cancelled) opened.current = true;
            },
            onSuccess: async (data: unknown) => {
              if (cancelled) return;
              const id = data as { id?: unknown; charge?: { id?: unknown } } | null;
              const found = typeof id?.id === "string" ? id.id : typeof id?.charge?.id === "string" ? id.charge.id : undefined;
              if (found?.startsWith("chg_")) {
                chargeId.current = found;
                setReported(true);
              }
              opened.current = true;
              setStage("waiting");
            },
            onCancel: () => {
              if (!cancelled) void cancelRef.current();
            },
            onError: (error: unknown) => {
              if (cancelled) return;
              reportPaymentSignalUnlessLeft(
                "wallet_error",
                {
                  sdk: "benefit_pay",
                  kind: sdkErrorKind(error),
                  reason: sdkErrorReason(error),
                  stage: opened.current ? "after_open" : "before_open",
                },
                () => !cancelled,
              );
              // Before the QR was opened no charge exists: a plain failure,
              // and a new code is safe. After, an error is NOT an outcome —
              // keep confirming with Laravel.
              if (opened.current) setStage((now) => (now === "paid" ? now : "waiting"));
              else setStage("failed");
            },
          },
          elementId,
        );
      })
      .catch(() => {
        if (cancelled) return;
        reportPaymentSignal("sdk_load_failed", { sdk: "benefit_pay" });
        setStage("failed");
      });

    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
      // Unmount FIRST: the SDK keeps its one instance until told, and the
      // next render (a new code) would otherwise draw nothing.
      mounted?.unmount?.();
      element?.replaceChildren();
    };
  }, [session, elementId, locale]);

  // Ask Laravel until it says paid — ONE request at a time, backing off,
  // paused while the page is hidden, and never past the point of knowing.
  const polling = stage === "ready" || stage === "waiting" || stage === "bound";
  useEffect(() => {
    if (!session || !polling) return;
    let stopped = false;
    let timer: number | undefined;
    let step = 0;
    const expiresAt = session.expires_at ? Date.parse(session.expires_at) : Number.NaN;
    const deadline = Number.isFinite(expiresAt) ? expiresAt + GRACE_MS : Number.POSITIVE_INFINITY;

    const schedule = () => {
      if (stopped) return;
      const wait = POLL_STEPS_MS[step] ?? POLL_MAX_MS;
      step += 1;
      timer = window.setTimeout(check, wait);
    };

    const check = async () => {
      if (stopped) return;
      // A hidden tab waits for the customer to come back (visibilitychange).
      if (document.visibilityState === "hidden") return;

      // A check that never came back (a dropped connection, Safari's «Load
      // failed») is NOT an answer: ask again on the next step. Thrown, it
      // stopped the polling for good — a paid customer left waiting forever.
      let outcome: Awaited<ReturnType<typeof checkBenefitPay>>["outcome"];
      try {
        ({ outcome } = await checkBenefitPay(orderId, locale, chargeId.current));
      } catch {
        if (!stopped) schedule();
        return;
      }
      if (stopped) return;

      if (outcome === "captured") {
        stopped = true;
        finish();
        return;
      }
      // Laravel says the charge it BOUND failed: a definite answer.
      if ((outcome === "failed" || outcome === "retry") && chargeId.current) {
        stopped = true;
        setStage("failed");
        return;
      }
      if (Date.now() > deadline) {
        stopped = true;
        // Never opened: nothing can have been charged. Opened: we cannot
        // know yet — the order page carries on from here.
        setStage(opened.current || chargeId.current || stageRef.current === "bound" ? "unresolved" : "expired");
        reportPaymentSignal("benefitpay_deadline", { sdk: "benefit_pay", outcome: opened.current ? "unresolved" : "expired" });
        return;
      }
      schedule();
    };

    const onVisible = () => {
      if (document.visibilityState !== "visible" || stopped) return;
      window.clearTimeout(timer);
      void check();
    };

    document.addEventListener("visibilitychange", onVisible);
    schedule();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [session, polling, orderId, locale, finish]);

  const orderHref = `/${locale}/order-status/${encodeURIComponent(orderId)}`;
  // A new code is offered only when nothing can have been charged.
  const canRestart = stage === "expired" || stage === "busy" || stage === "failed";
  // "Pay another way" while no payment from the phone has REPORTED itself. An
  // SDK error after the QR opened leaves no charge id: leaving is still
  // offered, and Laravel decides — a charge that already reached it keeps the
  // customer here (`bound`), and a closed QR holds other methods briefly.
  const canLeave =
    stage === "loading" ||
    stage === "ready" ||
    stage === "expired" ||
    stage === "busy" ||
    stage === "failed" ||
    stage === "paused" ||
    (stage === "waiting" && !reported);

  return (
    <section aria-labelledby={`${elementId}-title`} className="space-y-4 rounded-[16px] border border-[var(--color-input-border)] bg-[var(--color-surface)] p-4 lg:p-5">
      <div className="space-y-1">
        <h3 id={`${elementId}-title`} className="text-body-l font-bold text-[var(--color-ink)] lg:text-heading-m">
          {m.payment.benefitPayTitle}
        </h3>
        {session ? (
          <p className="text-body-s text-[var(--color-ink-muted)] lg:text-body-l">
            {m.payment.benefitPayLead}{" "}
            <span dir="ltr" className="font-semibold text-[var(--color-ink)]">
              {formatMoney(locale, session.amount, session.currency)}
            </span>
          </p>
        ) : null}
      </div>

      <div
        id={elementId}
        aria-busy={stage === "loading"}
        className="min-h-[56px]"
        hidden={stage === "expired" || stage === "failed" || stage === "busy" || stage === "paused" || stage === "unresolved" || stage === "bound"}
      />

      <p role="status" aria-live="polite" className="text-body-s font-medium lg:text-body-l text-[var(--color-ink-muted)]">
        {stage === "loading"
          ? m.payment.benefitPayLoading
          : stage === "waiting"
            ? m.payment.benefitPayWaiting
            : stage === "paid"
              ? m.payment.success
              : null}
      </p>

      {stage === "unresolved" || stage === "bound" ? (
        <div role="alert" className="space-y-3 rounded-[12px] bg-[var(--color-warning-wash)] px-4 py-3">
          <p className="text-body-s font-semibold text-[var(--color-ink)] lg:text-body-l">
            {stage === "bound" ? m.payment.benefitPayPaidElsewhere : m.payment.benefitPayUnresolved}
          </p>
          <a href={orderHref} className="inline-block text-body-s font-semibold lg:text-body-l text-[var(--color-brand-500)] underline underline-offset-4">
            {m.nav.orderStatus}
          </a>
        </div>
      ) : null}

      {stage === "expired" || stage === "failed" || stage === "busy" || stage === "paused" ? (
        <div role="alert" className="space-y-3 rounded-[12px] border border-[var(--color-danger)] px-4 py-3">
          <p className="text-body-s font-semibold text-[var(--color-danger)] lg:text-body-l">
            {stage === "expired"
              ? m.payment.benefitPayExpired
              : stage === "busy"
                ? m.payment.benefitPayBusy
                : stage === "paused"
                  ? m.payment.cardPaymentsPaused
                  : m.payment.benefitPayFailed}
          </p>
          {canRestart ? (
            <button
              type="button"
              onClick={() => {
                chargeId.current = undefined;
                setReported(false);
                opened.current = false;
                setSession(null);
                setStage("loading");
                setRound((n) => n + 1);
              }}
              className="rounded-[12px] border border-[var(--color-brand-500)] px-4 py-2 text-body-s font-semibold text-[var(--color-brand-500)]"
            >
              {m.payment.benefitPayRestart}
            </button>
          ) : null}
        </div>
      ) : null}

      {cancelProblem ? (
        <p role="alert" className="text-body-s font-semibold lg:text-body-l text-[var(--color-danger)]">
          {m.payment.benefitPayCancelUnknown}
        </p>
      ) : null}

      {canLeave ? (
        <button
          type="button"
          disabled={cancelling}
          onClick={() => void cancel()}
          className="text-body-s font-semibold text-[var(--color-brand-500)] underline underline-offset-4 lg:text-body-l disabled:opacity-60"
        >
          {m.payment.benefitPayCancel}
        </button>
      ) : null}
    </section>
  );
}
