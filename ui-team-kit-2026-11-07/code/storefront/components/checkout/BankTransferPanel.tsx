import type { ReactNode } from "react";

import { PayByEmail } from "@/components/checkout/PayByEmail";
import type { BankDetails } from "@/lib/checkout/payment";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * Where to send the money for a bank transfer — and that nothing is paid yet.
 *
 * ONE COMPONENT FOR EVERY PLACE THIS APPEARS: straight after checkout, and on
 * the order-status page for a customer who comes back later. The cart checkout
 * used to receive these details and navigate away without drawing them, and
 * order-status had no way to show them at all, so a basket paid by transfer
 * ended on a page that never said where to send the money.
 *
 * `children` is what the host screen adds under the details — the receipt
 * upload on order-status, a link to it straight after checkout.
 */
export function BankTransferPanel({
  locale,
  orderId,
  details,
  children,
}: {
  locale: Locale;
  orderId: string;
  details: BankDetails;
  children?: ReactNode;
}) {
  const m = messagesFor(locale);

  // Each field is listed only when the account has it rather than assuming
  // an IBAN (v0.1.19, ADR 0015 P3); since v0.1.148 an IBAN may sit beside a
  // domestic shape (GBP) and the Wise currencies bring their own codes.
  const rows = [
    [m.transfer.bank, details.bank_name],
    [m.transfer.accountName, details.account_name],
    [m.transfer.accountNumber, details.account_number],
    [m.transfer.sortCode, details.sort_code],
    [m.transfer.bsb, details.bsb],
    [m.transfer.routingNumber, details.routing_number],
    [m.transfer.institutionNumber, details.institution_number],
    [m.transfer.transitNumber, details.transit_number],
    [m.transfer.bankCode, details.bank_code],
    [m.transfer.branchCode, details.branch_code],
    [m.transfer.iban, details.iban],
    [m.transfer.swift, details.swift],
  ].filter((row): row is [string, string] => typeof row[1] === "string" && row[1] !== "");

  return (
    <section
      aria-labelledby={`transfer-${orderId}`}
      className="space-y-4 rounded-[16px] border-2 border-[var(--color-brand-500)] p-5"
    >
      <h2 id={`transfer-${orderId}`} className="text-heading-m font-bold text-[var(--color-ink)] lg:text-heading-l">
        {m.transfer.title}
      </h2>

      {/* THE MOST IMPORTANT SENTENCE ON THIS SCREEN. A receipt upload is a
          CLAIM, not a payment — finance confirms before anything captures,
          and the backend enforces that. Copy implying the order is paid
          would be a promise the system deliberately does not keep. */}
      <p className="rounded-[12px] bg-[var(--color-chip)] p-3 text-body-s font-medium lg:text-body-l text-[var(--color-ink)]">
        {m.transfer.notPaidYet}
      </p>

      <PayByEmail locale={locale} accountName={details.account_name} payid={details.payid} interacEmail={details.interac_email} />

      <dl className="space-y-2 text-body-s lg:text-body-l">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex justify-between gap-4 border-b border-[var(--color-line)] pb-2"
          >
            <dt className="text-[var(--color-ink-muted)]">{label}</dt>
            {/* An IBAN is always LTR, even on an Arabic page — otherwise its
                groups render reordered and a customer copies it wrong. */}
            <dd className="font-mono text-[var(--color-ink)]" dir="ltr">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <p className="text-body-s text-[var(--color-ink)] lg:text-body-l">
        {m.transfer.reference}{" "}
        <span dir="ltr" className="font-mono">
          {orderId}
        </span>
      </p>

      {children}
    </section>
  );
}
