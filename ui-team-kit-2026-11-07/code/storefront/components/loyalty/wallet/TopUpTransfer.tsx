import { CopyButton } from "@/components/checkout/CopyButton";
import { PayByEmail } from "@/components/checkout/PayByEmail";
import { TransferProofForm } from "@/components/checkout/TransferProofForm";
import { FileChooser } from "@/components/ui/FileChooser";
import { SubmitButton } from "@/components/ui/SubmitButton";
import type { ProofOutcome } from "@/lib/checkout/transfer-proof";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { fill, formatAmount, formatDay, formatPts, formatWorth } from "@/lib/loyalty/format";
import type { TopUpView } from "@/lib/loyalty/types";

import { Coin } from "../parts";

/**
 * STEP TWO of a top-up: the account to transfer to and the reference to
 * write, then the receipt (Claude Design `WalletHub` top-up).
 *
 * The account is the TOP-UP's own snapshot (`bank_account`, taken when it was
 * created) — never the design's sample IBAN, and never today's account if
 * staff edited it since. Every value a customer types into their bank's app is
 * `dir="ltr"` with a copy button (HANDBOOK §4: an RTL-rendered IBAN reorders
 * its groups). The button says «حوّلت … — أرسل الإيصال», never «ادفع»: nothing
 * is paid here, and nothing is credited until staff match the transfer.
 *
 * The receipt goes through the SAME flow as an order's bank transfer:
 * `TransferProofForm` posts in place to our route handler
 * (`app/api/wallet/topups/[id]/receipt`), which uploads the file
 * (`POST /uploads`) and attaches it (`POST /wallet/topups/{id}/receipt`);
 * without JavaScript it is a plain multipart post answered by a redirect.
 */
export function TopUpTransfer({
  locale,
  topUp,
  outcome,
  maxBytes,
  today,
  cancelAction,
  pendingHoldHours,
}: {
  locale: Locale;
  topUp: TopUpView;
  /** What a plain post came back with (`?proof=`), if anything. */
  outcome: ProofOutcome | null;
  maxBytes: number;
  /** The latest day a transfer may be dated (the API refuses after tomorrow). */
  today: string;
  cancelAction: (form: FormData) => Promise<void>;
  /** How long a bonus stays pending — the programme's setting, never a hardcoded 24. */
  pendingHoldHours: number;
}) {
  const m = messagesFor(locale);
  const t = m.loyalty.wallet.topup;
  const bank = topUp.bank;
  const rows: { key: string; label: string; value: string | null; copy: string | null }[] = [
    { key: "bank", label: t.bank, value: bank.bankName, copy: null },
    { key: "name", label: t.accountName, value: bank.accountName, copy: t.copyName },
    { key: "account", label: m.transfer.accountNumber, value: bank.accountNumber, copy: t.copyAccount },
    { key: "sort", label: m.transfer.sortCode, value: bank.sortCode, copy: null },
    { key: "bsb", label: m.transfer.bsb, value: bank.bsb, copy: null },
    { key: "routing", label: m.transfer.routingNumber, value: bank.routingNumber, copy: null },
    { key: "institution", label: m.transfer.institutionNumber, value: bank.institutionNumber, copy: null },
    { key: "transit", label: m.transfer.transitNumber, value: bank.transitNumber, copy: null },
    { key: "bankCode", label: m.transfer.bankCode, value: bank.bankCode, copy: null },
    { key: "branchCode", label: m.transfer.branchCode, value: bank.branchCode, copy: null },
    { key: "iban", label: t.iban, value: bank.iban, copy: t.copyIban },
    { key: "swift", label: m.transfer.swift, value: bank.swift, copy: null },
    { key: "reference", label: t.reference, value: topUp.reference, copy: t.copyReference },
  ];
  const fieldClass =
    "h-12 w-full rounded-[12px] bg-[var(--color-surface-raised)] px-3.5 text-body-s text-[var(--color-ink)] shadow-[inset_0_0_0_1px_var(--color-line)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-brand-500)]";

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section className="flex flex-col gap-4 rounded-[16px] border border-[var(--color-brand-500)] bg-[var(--color-brand-50)] p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-body-l font-bold">{t.transferTitle}</h2>
          <p className="text-caption font-medium leading-[1.6] text-[var(--color-ink-muted)]">
            {fill(t.transferLead, { amount: formatAmount(locale, topUp.amount), date: formatDay(locale, topUp.expiresAt) })}
          </p>
        </div>

        <PayByEmail locale={locale} accountName={bank.accountName} payid={bank.payid} interacEmail={bank.interacEmail} reference="topUp" />

        <dl className="flex flex-col rounded-[12px] bg-[var(--color-surface-raised)] px-3.5 py-1">
          {rows
            .filter((row): row is { key: string; label: string; value: string; copy: string | null } => Boolean(row.value))
            .map((row, index) => (
              <div key={row.key} data-row={row.key} className={`flex items-center gap-2 py-2.5 ${index ? "border-t border-[var(--color-line)]" : ""}`}>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <dt className="text-caption font-semibold text-[var(--color-ink-muted)]">{row.label}</dt>
                  <dd dir="ltr" className="break-all text-start text-body-s font-extrabold">
                    {row.value}
                  </dd>
                </div>
                {row.copy ? <CopyButton value={row.value} label={m.loyalty.share.copy} copiedLabel={m.loyalty.share.copied} accessibleName={row.copy} /> : null}
              </div>
            ))}
        </dl>
        <p className="text-caption font-medium leading-[1.6] text-[var(--color-ink-muted)]">{t.bankNote}</p>

        {topUp.acceptsReceipt ? (
          <TransferProofForm
            action={`/api/wallet/topups/${encodeURIComponent(topUp.publicId)}/receipt`}
            sentHref={`/${locale}/account/points/top-up?id=${encodeURIComponent(topUp.publicId)}&proof=sent`}
            maxBytes={maxBytes}
            messages={m.transfer.outcome}
            initialOutcome={outcome && outcome !== "sent" ? outcome : null}
            sendingLabel={t.sending}
            submit={fill(t.submit, { amount: formatAmount(locale, topUp.amount) })}
            className="flex flex-col gap-3"
            buttonClassName="flex h-[52px] w-full items-center justify-center rounded-[12px] bg-[var(--color-brand-500)] px-4 text-body-l font-bold text-[var(--color-on-primary)] disabled:opacity-60"
          >
            <input type="hidden" name="locale" value={locale} />
            <div className="flex flex-col gap-2">
              <label htmlFor={`receipt-${topUp.publicId}`} className="text-body-s font-bold">
                {t.receipt}
              </label>
              <FileChooser id={`receipt-${topUp.publicId}`} name="receipt" required accept="image/jpeg,image/png,image/webp,application/pdf" chooseLabel={t.chooseReceipt} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-body-s font-bold">
                {m.transfer.transferDate}
                <input type="date" name="transfer_date" required max={today} dir="ltr" className={fieldClass} />
              </label>
              <label className="flex flex-col gap-1.5 text-body-s font-bold">
                {m.transfer.sendingBank}
                <input type="text" name="sending_bank" required maxLength={120} className={fieldClass} />
              </label>
            </div>
          </TransferProofForm>
        ) : null}
      </section>

      <section className="flex flex-col gap-3 rounded-[16px] bg-[var(--color-surface-raised)] p-5 shadow-[0_0_12px_rgba(0,0,0,0.07)]">
        <h3 className="text-heading-m font-bold">{t.summary}</h3>
        <dl className="flex flex-col gap-2 text-body-s">
          <div className="flex justify-between gap-2 font-semibold text-[var(--color-ink-muted)]">
            <dt>{t.amount}</dt>
            <dd dir="ltr">{formatAmount(locale, topUp.amount)}</dd>
          </div>
          <div className="flex justify-between gap-2 font-extrabold text-[var(--color-ink)]">
            <dt>{t.added}</dt>
            <dd dir="ltr">{formatAmount(locale, topUp.amount)}</dd>
          </div>
        </dl>
        {topUp.bonusPts > 0 ? (
          <p className="flex items-center gap-2.5 rounded-[12px] bg-[var(--color-success-wash)] p-3">
            <Coin size={28} />
            <span className="text-caption font-bold leading-[1.5] text-[var(--color-ink)]">
              {fill(topUp.bonusIsEstimate ? t.bonusEstimate : t.bonusLine, {
                pts: formatPts(locale, topUp.bonusPts),
                worth: formatWorth(locale, topUp.bonusValue),
                hours: pendingHoldHours,
              })}
            </span>
          </p>
        ) : null}
        <p className="text-caption font-medium leading-[1.6] text-[var(--color-ink-muted)]">{t.notCash}</p>
        {topUp.cancellable ? (
          <form action={cancelAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="id" value={topUp.publicId} />
            <SubmitButton className="h-11 w-full rounded-[12px] text-body-s font-bold text-[var(--color-danger)] shadow-[inset_0_0_0_1px_var(--color-line)]">{t.cancel}</SubmitButton>
          </form>
        ) : null}
      </section>
    </div>
  );
}
