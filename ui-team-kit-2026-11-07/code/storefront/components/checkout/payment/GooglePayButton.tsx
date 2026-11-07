"use client";

import { useEffect, useRef, useState } from "react";

import type { Locale } from "@/lib/i18n/locales";
import { reportPaymentSignalUnlessLeft, walletFailure, type WalletFailure } from "@/lib/monitoring/payment-signal";
import { loadScript } from "@/lib/wallets/load-script";

import type { WalletLineItem } from "./ApplePayButton";

/**
 * Google Pay — a separate express button, because Tap's embedded card form
 * does not offer it. Google's own `pay.js`, tokenizing for Tap:
 * `tokenizationSpecification: {type: PAYMENT_GATEWAY, parameters: {gateway:
 * "tappayments", gatewayMerchantId}}` (Tap's Google Pay docs).
 *
 * WHAT CROSSES BACK is Google's `tokenizationData.token` — an ENCRYPTED
 * string only Tap can open. It goes to Laravel untouched, and Laravel alone
 * exchanges it for a Tap token with the secret key.
 *
 * Shown only when Google says this browser can pay (`isReadyToPay`). The
 * sheet opens synchronously inside the button's click, as Google requires.
 */
export const GOOGLE_PAY_JS = "https://pay.google.com/gp/p/js/pay.js";

export interface GooglePayConfig {
  environment: "TEST" | "PRODUCTION";
  gateway: string;
  gateway_merchant_id: string;
  merchant_name: string;
  google_merchant_id?: string | null;
  allowed_networks?: string[];
  /** Sent by the API, never read: the button always asks for PAN_ONLY (see `GOOGLE_PAY_AUTH_METHODS`). */
  allowed_auth_methods?: string[];
}

interface PaymentsClient {
  isReadyToPay: (request: Record<string, unknown>) => Promise<{ result: boolean; paymentMethodPresent?: boolean }>;
  loadPaymentData: (request: Record<string, unknown>) => Promise<{
    paymentMethodData?: { tokenizationData?: { token?: string } };
  }>;
  createButton: (options: Record<string, unknown>) => HTMLElement;
}

interface GoogleNamespace {
  payments: { api: { PaymentsClient: new (options: { environment: string }) => PaymentsClient } };
}

declare global {
  interface Window {
    google?: GoogleNamespace;
  }
}

/**
 * PAN_ONLY, always (owner, 2026-10-16): a CRYPTOGRAM_3DS device token is
 * captured by Tap with no bank challenge, so it is not asked for; a PAN_ONLY
 * card can be challenged by its issuer at charge time. Fixed here as well as
 * in the API's wallet config (`allowed_auth_methods`, which is not read), so a
 * changed answer from the server cannot loosen it. NOT a 3-D Secure guarantee:
 * a card not enrolled is still captured at once, and the server cannot see a
 * token's method (`WalletRegistry::GOOGLE_PAY_AUTH_METHODS`).
 */
const GOOGLE_PAY_AUTH_METHODS = ["PAN_ONLY"];

/**
 * Asked with `existingPaymentMethodRequired`: ready only when the customer
 * already has a card Google can return as PAN_ONLY — not merely a browser
 * that supports Google Pay, whose sheet would then offer no usable card (a
 * dead end in «شراء سريع»'s place). Google answers `paymentMethodPresent`
 * only in PRODUCTION; absent (TEST) counts as present.
 */
function readyRequest(config: GooglePayConfig) {
  return { apiVersion: 2, apiVersionMinor: 0, allowedPaymentMethods: [baseCard(config)], existingPaymentMethodRequired: true };
}

function canPayWith(answer: { result: boolean; paymentMethodPresent?: boolean }): boolean {
  return answer.result === true && answer.paymentMethodPresent !== false;
}

function baseCard(config: GooglePayConfig) {
  return {
    type: "CARD",
    parameters: {
      allowedAuthMethods: GOOGLE_PAY_AUTH_METHODS,
      allowedCardNetworks: config.allowed_networks ?? ["VISA", "MASTERCARD"],
    },
  };
}

/**
 * Whether Google says this browser can pay — asked WITHOUT drawing a button,
 * so the checkout can list Google Pay as a method first and draw Google's
 * own button only once the customer picks it (a button drawn hidden is one
 * that may never size itself).
 */
export async function googlePayReady(config: GooglePayConfig): Promise<boolean> {
  try {
    await loadScript(GOOGLE_PAY_JS, () => window.google?.payments?.api);
    const client = new window.google!.payments.api.PaymentsClient({ environment: config.environment });
    return canPayWith(await client.isReadyToPay(readyRequest(config)));
  } catch {
    return false;
  }
}

/**
 * THE BUTTON'S SLOT — it takes the container's whole width, as Apple Pay's
 * does (owner, 2026-10-21: «not responsive on all screens»). `fill` makes
 * Google's button follow this box, but Google's own stylesheet gives the
 * worded button a minimum width (about 200px in Arabic) that a narrow slot
 * cannot give it, and a slot that is itself a shrink-to-fit flex or grid item
 * would collapse to that content. So: `min-w-0` lets the slot shrink with its
 * parent, `overflow-hidden` + the radius keep anything wider inside it, and
 * Google's wrapper and button are pinned to 100% × 100% with the minimum
 * removed. Height is fixed to Apple Pay's 48px line.
 */
export const GOOGLE_PAY_HOST =
  "h-12 min-h-12 w-full min-w-0 max-w-full overflow-hidden rounded-[12px] " +
  "[&_.gpay-button-fill]:size-full! [&_.gpay-button-fill]:min-w-0! " +
  "[&_.gpay-button]:size-full! [&_.gpay-button]:min-h-0! [&_.gpay-button]:min-w-0! [&_.gpay-button]:max-w-full!";

export function GooglePayButton({
  locale,
  config,
  amount,
  currency,
  disabled,
  onToken,
  onCancel,
  onError,
  onAvailable,
  compact = false,
  items,
}: {
  locale: Locale;
  config: GooglePayConfig;
  amount: string;
  currency: string;
  disabled?: boolean;
  /**
   * Google's logo-only button ("plain") instead of "Pay with G Pay". Its
   * worded button keeps a minimum width — about 200px in Arabic — that a
   * phone's buy bar beside «أضف للسلة» cannot give it, so it spilled off the
   * screen; the logo-only one fits.
   */
  compact?: boolean;
  /**
   * The lines Google's sheet lists above the total (`displayItems`) — the
   * server's own figures (the goods, then «رسوم المعالجة»), never added up
   * here. Absent or empty: the total alone, as before.
   */
  items?: readonly WalletLineItem[];
  /**
   * Google's token, with the figure its sheet showed. May return the
   * payment's promise (it rejects when the payment did not start); the sheet
   * is closed by then, so the button ignores how it settles.
   */
  onToken: (token: string, shown: { amount: string; currency: string }) => Promise<unknown> | void;
  /** Google's sheet closes before the token is handed over, so a cancel here is never after one. */
  onCancel: (sheet: { afterToken: boolean }) => void;
  /** The sheet failed, with why as short words (Google's `statusCode` only, never its message) — the caller reports it. */
  onError: (failure: WalletFailure) => void;
  /** Told once Google has said this browser can pay — the checkout lists the wallet only then. */
  onAvailable?: (available: boolean) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const announce = useRef(onAvailable);
  useEffect(() => {
    announce.current = onAvailable;
  }, [onAvailable]);
  useEffect(() => {
    announce.current?.(ready);
  }, [ready]);
  const latest = useRef({ amount, currency, disabled, items, onToken, onCancel, onError });
  useEffect(() => {
    latest.current = { amount, currency, disabled, items, onToken, onCancel, onError };
  }, [amount, currency, disabled, items, onToken, onCancel, onError]);

  useEffect(() => {
    let cancelled = false;
    const element = host.current;

    loadScript(GOOGLE_PAY_JS, () => window.google?.payments?.api)
      .then(async () => {
        const client = new window.google!.payments.api.PaymentsClient({ environment: config.environment });
        const answer = await client.isReadyToPay(readyRequest(config));
        if (cancelled || !canPayWith(answer) || !element) return;

        const button = client.createButton({
          buttonType: compact ? "plain" : "pay",
          buttonColor: document.documentElement.dataset.theme === "dark" ? "white" : "black",
          buttonLocale: locale,
          buttonSizeMode: "fill",
          buttonRadius: 12,
          onClick: () => {
            const now = latest.current;
            if (now.disabled) return;

            // Synchronous from the click, as Google requires.
            client
              .loadPaymentData({
                apiVersion: 2,
                apiVersionMinor: 0,
                allowedPaymentMethods: [
                  {
                    ...baseCard(config),
                    tokenizationSpecification: {
                      type: "PAYMENT_GATEWAY",
                      parameters: { gateway: config.gateway, gatewayMerchantId: config.gateway_merchant_id },
                    },
                  },
                ],
                merchantInfo: {
                  merchantName: config.merchant_name,
                  ...(config.google_merchant_id ? { merchantId: config.google_merchant_id } : {}),
                },
                transactionInfo: {
                  totalPriceStatus: "FINAL",
                  totalPrice: now.amount,
                  currencyCode: now.currency,
                  ...(now.items && now.items.length > 0
                    ? { displayItems: now.items.map((line) => ({ label: line.label, type: "LINE_ITEM", price: line.amount })) }
                    : {}),
                },
              })
              .then((data) => {
                const token = data.paymentMethodData?.tokenizationData?.token;
                if (typeof token === "string" && token !== "") {
                  // Google's sheet is already closed, so a payment that was
                  // refused or declined has nobody to tell here: the checkout
                  // has shown why (its failure panel, message or new total),
                  // and `onError` would wrongly drop the wallet. The rejection
                  // is only absorbed — left alone it reaches Sentry as an
                  // unhandled `Error: payment`.
                  // Called inside the chain, so even a synchronous throw is
                  // absorbed here — never mistaken for the sheet failing.
                  void Promise.resolve()
                    .then(() => latest.current.onToken(token, { amount: now.amount, currency: now.currency }))
                    .catch(() => undefined);
                } else latest.current.onError(walletFailure(undefined, "token", false));
              })
              .catch((error: { statusCode?: unknown } | undefined) => {
                if (error?.statusCode === "CANCELED") latest.current.onCancel({ afterToken: false });
                else latest.current.onError(walletFailure({ code: error?.statusCode }, "after_press", false));
              });
          },
        });

        element.replaceChildren(button);
        setReady(true);
      })
      // Google's script would not load, or `isReadyToPay` threw: no button
      // is drawn, and the count says so (held for the page-leave grace).
      .catch(() => reportPaymentSignalUnlessLeft("sdk_load_failed", { sdk: "google_pay" }, () => !cancelled));

    return () => {
      cancelled = true;
      element?.replaceChildren();
    };
  }, [config, locale, compact]);

  return (
    <div
      ref={host}
      data-wallet="google_pay"
      aria-disabled={disabled}
      hidden={!ready}
      className={`${GOOGLE_PAY_HOST} ${disabled ? "pointer-events-none opacity-50" : ""}`}
    />
  );
}
