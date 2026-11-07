import { NextResponse, type NextRequest } from "next/server";

import { ApiError, getOrderPayment, verifyOrderPayment } from "@/lib/api/client";
import { emptyCartAfterOrder } from "@/lib/cart/actions";
import { cartOrder, forgetCartOrder } from "@/lib/cart/pending-order";
import { isOrderId } from "@/lib/checkout/order-id";
import { orderCredentials } from "@/lib/checkout/payment";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/locales";

/**
 * Where Tap sends the customer after 3-D Secure — `/{locale}/payment/complete`.
 *
 * A ROUTE HANDLER, NOT A PAGE, because it has one job a page cannot do: empty
 * the basket (a cookie) once the payment is VERIFIED. What it does:
 *
 * 1. hands Laravel Tap's `tap_id`. Laravel asks Tap itself, over its own
 *    authenticated call, and records a capture — the id is a lookup key and
 *    must be a charge Laravel started for THIS order, or it is refused;
 * 2. empties the basket only if THAT order is now captured AND it is the order
 *    this basket turned into (`cq_cart_order`) — a failed one-time code comes
 *    back to a full basket, and resuming an older order never wipes a new one;
 * 3. sends the customer on to `/{locale}/payment/return`, which says what
 *    happened. The `tap_id` does not travel on: nothing after this reads it.
 *
 * The language is the path's own — the one the customer paid in — so an
 * Arabic checkout comes back Arabic whatever the phone's language is.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await context.params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;

  // INSIDE THE BANK-CHECK SHEET'S FRAME: do nothing here — our cookies may
  // not have come with a framed request — and move the WHOLE page to this
  // same address, `tap_id` and all, where they do (lib/checkout/bank-check.ts).
  if (request.headers.get("sec-fetch-dest") === "iframe") return breakoutPage();
  const order = request.nextUrl.searchParams.get("order") ?? undefined;
  const tapId = request.nextUrl.searchParams.get("tap_id");

  // A RELATIVE Location, never one built from `request.url`: behind the
  // proxy that is the internal listener's address (`localhost:3000`), and a
  // redirect there loses the customer's cookies — found by the browser suite,
  // where it landed on `localhost` without the order's guest token.
  let next = `/${locale}/payment/return`;

  if (isOrderId(order)) {
    next += `?order=${encodeURIComponent(order)}`;
    const credentials = await orderCredentials(order);

    if (credentials) {
      try {
        const standing =
          tapId && /^chg_[A-Za-z0-9_]{3,80}$/.test(tapId)
            ? await verifyOrderPayment(order, tapId, { locale, ...credentials })
            : await getOrderPayment(order, { locale, ...credentials });

        if (standing.payment_state === "captured" && (await cartOrder()) === order) {
          await emptyCartAfterOrder(locale);
          await forgetCartOrder();
        }
      } catch (error) {
        // Tap or the API unreachable, or an id that is not this order's: the
        // return page asks again and says "we are confirming" — never
        // "paid", never "failed", on a guess.
        if (!(error instanceof ApiError)) throw error;
      }
    }
  }

  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: next,
      // The URL carried Tap's charge id; nothing about it goes further.
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * A page that only moves its top window to its own address. Nothing in it
 * comes from the request — the script reads `location` itself — so there is
 * nothing to escape. `frame-ancestors 'self'` (next.config.ts) is what lets
 * our sheet frame it and nobody else.
 */
function breakoutPage(): NextResponse {
  return new NextResponse(
    '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex">' +
      "<script>try{window.top.location.replace(window.location.href)}catch(e){}</script>",
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Referrer-Policy": "no-referrer",
        "Cache-Control": "no-store",
      },
    },
  );
}
