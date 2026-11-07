import { Suspense } from "react";

import { BrowserPaymentMethods } from "@/components/home/BrowserPaymentMethods";
import { PaymentMethods, type PaymentMethodTile } from "@/components/home/PaymentMethods";
import { OPTIONAL_DEADLINE_MS } from "@/lib/api/deadlines";
import { sharedPaymentMethods } from "@/lib/checkout/shared-methods";
import { paymentCountry } from "@/lib/currency/payment-country";
import { currencyForVisitor } from "@/lib/currency/visitor";
import { edgeRenderCurrency } from "@/lib/edge/render";
import type { Locale } from "@/lib/i18n/locales";

/**
 * «طرق الدفع» on the home page — the VISITOR's methods (their currency and
 * country), so it streams in its own boundary; the rest of the home page is
 * shared by every visitor (ADR 0046 §2).
 *
 * The fallback holds the strip's room and says nothing: no heading, no mark a
 * visitor might read as offered to them. Heights are a two-row phone strip
 * and a one-row desktop one, without the section's top margin. Measured: 136 px
 * reserved against 135.7 px resolved at 360, CLS 0.0016 (as `PANEL_ROOM`'s
 * comment states its own).
 */
export function PaymentMethodsSlot({ locale }: { locale: Locale }) {
  return (
    <Suspense
      fallback={<div aria-hidden data-cq-fallback="payment-methods" className="mx-auto mt-6 min-h-[136px] w-full max-w-[1248px] lg:mt-12 lg:min-h-[186px]" />}
    >
      <VisitorPaymentMethods locale={locale} />
    </Suspense>
  );
}

async function VisitorPaymentMethods({ locale }: { locale: Locale }) {
  // THE EDGE'S SHARED COPY (ADR 0052, S12) is one page for every visitor of a
  // currency, but a domestic rail (KNET, BenefitPay) is offered by COUNTRY:
  // drawn here for the currency's default country, a Kuwaiti dinar copy would
  // show KNET to a visitor outside Kuwait. So the copy carries no strip, and
  // the browser asks for the visitor's own (`/api/payment-methods`).
  const shared = await edgeRenderCurrency();
  if (shared) return <BrowserPaymentMethods locale={locale} currency={shared} />;

  const currency = await currencyForVisitor();
  // The strip must never advertise a rail this store cannot take
  // (HANDBOOK §1), so it is the server's list or nothing. Scoped by currency
  // AND country, exactly as checkout asks: a domestic rail (KNET, mada,
  // BenefitPay) is offered by country, and a visitor must not be shown one
  // their checkout will never list. A trust strip is not worth the home page,
  // so a failure or a slow answer is simply no strip. The list itself is a
  // shared read (`sharedPaymentMethods`): the currency and country read here
  // are its explicit arguments, so they are its cache key.
  const methods = await paymentCountry()
    .then((country) => sharedPaymentMethods({ currency, country }, { locale, deadlineMs: OPTIONAL_DEADLINE_MS }))
    .then((list) =>
      list.map<PaymentMethodTile>((method) => ({
        code: method.code,
        name: method.name[locale] ?? method.name.en ?? method.code,
        type: method.type,
      })),
    )
    .catch(() => [] as PaymentMethodTile[]);

  return <PaymentMethods locale={locale} currency={currency} methods={methods} />;
}
