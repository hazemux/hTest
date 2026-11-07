import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { CopyButton } from "@/components/checkout/CopyButton";
import { PayByEmail } from "@/components/checkout/PayByEmail";
import { ShamCashWallet } from "@/components/checkout/ShamCashWallet";
import { TransferProofForm } from "@/components/checkout/TransferProofForm";
import { FIELD_CONTROL_CLASS } from "@/components/ui/field-control";
import { FileChooser } from "@/components/ui/FileChooser";
import { readSessionToken } from "@/lib/account/session";
import { ApiError, getOrderBankTransfer } from "@/lib/api/client";
import { isOrderId } from "@/lib/checkout/order-id";
import { readOrderToken } from "@/lib/checkout/order-token";
import { decodeDraft, proofDraftCookie, type ProofDraft, type ProofOutcome } from "@/lib/checkout/transfer-proof";
import { isLocale } from "@/lib/i18n/locales";
import { formatMoney, messagesFor } from "@/lib/i18n/messages";
import { formatStoreDateTime } from "@/lib/i18n/time";
import { storeSettings } from "@/lib/content/settings";

/**
 * «إتمام الدفع بالتحويل البنكي» — the guided bank-transfer page (v0.1.38).
 *
 * Where a customer lands after choosing bank transfer: the order number to
 * quote, the exact amount, the account they were SHOWN when they chose it
 * (a snapshot — it does not change if finance edits the account), the
 * deadline, numbered steps, and the proof upload. Bank details never appear
 * in the checkout form itself.
 *
 * TWO CREDENTIALS OPEN IT, NEITHER IS THE URL: this order's guest-token
 * cookie, or the owning customer's session — order numbers are sequential,
 * so the number in the address proves nothing. No credential, or the wrong
 * one, is answered as not found.
 *
 * The upload is a multipart form to the same route the order page uses —
 * sent in place by `TransferProofForm`, or posted plainly without JavaScript
 * and answered back here with `?proof=`. A failed send keeps what was typed
 * either way.
 *
 * ONE ORDER, ONE TRANSFER, HOWEVER MANY PROOFS. A proof sent is "submitted —
 * awaiting review": the page stops asking for the money (no steps, no
 * account, no form in the way), and replacing a wrong file is a choice the
 * customer opens, not the next step. A rejected proof asks for a new one for
 * THIS order, with the details sent last time already filled in.
 */

type Props = {
  params: Promise<{ locale: string; orderId: string }>;
  searchParams: Promise<{ proof?: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  return isLocale(locale) ? { title: messagesFor(locale).transfer.pageTitle, robots: { index: false } } : {};
}

export default async function BankTransferPage(props: Props) {
  // Per request, always: this page is somebody's order.
  await connection();
  const { locale, orderId } = await props.params;
  if (!isLocale(locale) || !isOrderId(orderId)) notFound();

  const m = messagesFor(locale);
  const { proof } = await props.searchParams;
  const guestToken = await readOrderToken(orderId);
  const bearerToken = guestToken ? undefined : await readSessionToken();
  if (!guestToken && !bearerToken) notFound();

  let transfer;
  try {
    transfer = await getOrderBankTransfer(orderId, { locale, guestToken, bearerToken });
  } catch (error) {
    // 404 with a credential: a transfer with no guided record — chosen while
    // the guided flow was switched off, or before it existed. Its order page
    // shows the bank details and takes the proof, as it always did.
    if (error instanceof ApiError && error.status === 404) redirect(`/${locale}/order-status/${orderId}`);
    if (error instanceof ApiError && error.status === 401) notFound();
    throw error;
  }

  const settings = await storeSettings(locale).catch(() => null);
  const general = (settings as { data?: { general?: { support_whatsapp?: string; support_email?: string } } } | null)?.data?.general;
  const supportHref = general?.support_whatsapp
    ? `https://wa.me/${general.support_whatsapp.replace(/\D/g, "")}`
    : general?.support_email
      ? `mailto:${general.support_email}`
      : `/${locale}/faq`;

  const amount = formatMoney(locale, transfer.amount.amount, transfer.amount.currency);
  const account = transfer.account;
  // v0.1.152 — a ShamCash payment: the wallet in place of the bank account,
  // and its own title, steps and proof labels. Anything else is a bank transfer.
  const shamCash = transfer.method === "shamcash";
  const warning = (shamCash ? m.transfer.shamcash.referenceWarning : m.transfer.referenceWarning).replace("{ORDER_NUMBER}", orderId);
  const words = shamCash
    ? {
        pageTitle: m.transfer.shamcash.pageTitle,
        pageLead: m.transfer.shamcash.pageLead,
        steps: [
          m.transfer.shamcash.step1,
          m.transfer.shamcash.step2.replace("{name}", account.beneficiary ?? ""),
          m.transfer.shamcash.step3,
          m.transfer.shamcash.step4,
        ],
        uploadTitle: m.transfer.shamcash.uploadTitle,
        referenceLabel: m.transfer.shamcash.referenceLabel,
      }
    : {
        pageTitle: m.transfer.pageTitle,
        pageLead: m.transfer.pageLead,
        steps: [m.transfer.step1, m.transfer.step2, m.transfer.step3, m.transfer.step4],
        uploadTitle: m.transfer.uploadTitle,
        referenceLabel: m.transfer.referenceLabel,
      };
  const status = transfer.status;

  // Still to pay: the money has not been claimed, or the claim was refused.
  const toPay = status === "awaiting_transfer" || status === "rejected";
  const awaitingReview = status === "proof_submitted" || status === "under_review";
  const maxBytes = transfer.max_upload_bytes ?? 10 * 1024 * 1024;
  // Rounded DOWN: "up to 2 MB" must not be said of a 2.5 MB limit's 3 MB file.
  const maxMb = Math.max(1, Math.floor(maxBytes / (1024 * 1024)));
  const outcomeKey = proof && proof in m.transfer.outcome ? (proof as ProofOutcome) : null;
  const outcome = outcomeKey ? m.transfer.outcome[outcomeKey] : null;

  // What the form starts with: what was typed before a failed plain post,
  // else — for a refused proof — the details sent with it, so a new file is
  // all the customer has to choose.
  const latest = transfer.proofs[0];
  const sentBefore: ProofDraft =
    status === "rejected" && latest
      ? {
          transfer_date: latest.transfer_date ?? undefined,
          sending_bank: latest.sending_bank ?? undefined,
          reference: latest.reference ?? undefined,
          note: latest.note ?? undefined,
        }
      : {};
  const typed = decodeDraft((await cookies()).get(proofDraftCookie(orderId))?.value);
  const draft: ProofDraft = Object.keys(typed).length > 0 ? typed : sentBefore;

  const rows: { key: string; label: string; value?: string; ltr?: boolean; copy?: boolean }[] = [
    { key: "beneficiary", label: m.transfer.beneficiary, value: account.beneficiary, copy: true },
    { key: "bank", label: m.transfer.bank, value: account.bank_name },
    { key: "account", label: m.transfer.accountNumber, value: account.account_number, ltr: true, copy: true },
    { key: "sort", label: m.transfer.sortCode, value: account.sort_code, ltr: true, copy: true },
    { key: "bsb", label: m.transfer.bsb, value: account.bsb, ltr: true, copy: true },
    { key: "routing", label: m.transfer.routingNumber, value: account.routing_number, ltr: true, copy: true },
    { key: "institution", label: m.transfer.institutionNumber, value: account.institution_number, ltr: true, copy: true },
    { key: "transit", label: m.transfer.transitNumber, value: account.transit_number, ltr: true, copy: true },
    { key: "bankCode", label: m.transfer.bankCode, value: account.bank_code, ltr: true, copy: true },
    { key: "branchCode", label: m.transfer.branchCode, value: account.branch_code, ltr: true, copy: true },
    // After the domestic codes: a GBP account has both, and the IBAN is for
    // paying from abroad.
    { key: "iban", label: m.transfer.iban, value: account.iban, ltr: true, copy: true },
    { key: "swift", label: m.transfer.swift, value: account.swift, ltr: true, copy: true },
  ];

  const proofForm = (submit: string, className: string, heading?: React.ReactNode) => (
    <TransferProofForm
      action={`/api/orders/${orderId}/transfer-receipt`}
      sentHref={`/${locale}/orders/${orderId}/bank-transfer?proof=sent`}
      maxBytes={maxBytes}
      messages={m.transfer.outcome}
      initialOutcome={outcomeKey && outcomeKey !== "sent" ? outcomeKey : null}
      sendingLabel={m.transfer.uploading}
      submit={submit}
      heading={heading}
      className={className}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="back" value="transfer" />

      <div className="space-y-2">
        <label htmlFor={`proof-${orderId}`} className="block text-body-s lg:text-body-l font-semibold text-[var(--color-ink)]">
          {m.transfer.fileLabel.replace("{size}", `${maxMb} MB`)}
        </label>
        <FileChooser id={`proof-${orderId}`} name="receipt" required accept="image/jpeg,image/png,image/webp" chooseLabel={m.upload.choose} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={m.transfer.transferDate}>
          <input
            type="date"
            name="transfer_date"
            defaultValue={draft.transfer_date}
            max={latestToday()}
            dir="ltr"
            className={FIELD_CONTROL_CLASS}
          />
        </Field>
        {/* No sending bank for a wallet: the money leaves the customer's ShamCash. */}
        {shamCash ? null : (
          <Field label={m.transfer.sendingBank}>
            <input type="text" name="sending_bank" defaultValue={draft.sending_bank} maxLength={120} className={FIELD_CONTROL_CLASS} />
          </Field>
        )}
        <Field label={words.referenceLabel}>
          <input type="text" name="reference" defaultValue={draft.reference} maxLength={120} dir="ltr" className={FIELD_CONTROL_CLASS} />
        </Field>
        <Field label={m.transfer.comments}>
          <input type="text" name="note" defaultValue={draft.note} maxLength={500} className={FIELD_CONTROL_CLASS} />
        </Field>
      </div>
    </TransferProofForm>
  );

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-8 lg:py-12">
      <div className="mx-auto flex max-w-[760px] flex-col gap-6">
        <header className="space-y-2">
          <h1 className="text-display font-bold leading-[1.3] text-[var(--color-ink)] lg:text-[28px]">
            {toPay ? words.pageTitle : m.transfer.pageTitleSubmitted}
          </h1>
          {toPay ? <p className="text-body-m lg:text-body-l text-[var(--color-ink-muted)]">{words.pageLead}</p> : null}
        </header>

        {/* Status */}
        <section aria-live="polite" className={`space-y-1 rounded-[16px] border-2 px-4 py-4 ${TONE[status] ?? TONE.awaiting_transfer}`}>
          <p className="text-body-l lg:text-heading-m font-bold">{m.transfer.status[status as keyof typeof m.transfer.status] ?? status}</p>
          <p className="text-body-s lg:text-body-l">{m.transfer.statusHelp[status as keyof typeof m.transfer.statusHelp]}</p>
          {transfer.rejection_reason ? (
            <p className="text-body-s lg:text-body-l font-semibold" dir="auto">
              {m.transfer.rejectionReason.replace("{reason}", transfer.rejection_reason)}
            </p>
          ) : null}
          {proof === "sent" && awaitingReview ? (
            <p role="status" className="text-body-s lg:text-body-l font-semibold text-[var(--color-success)]">
              {m.transfer.outcome.sent}
            </p>
          ) : null}
        </section>

        {/* Order number, amount, deadline */}
        <section className="grid gap-3 rounded-[16px] border border-[var(--color-input-border)] bg-[var(--color-surface)] p-4 sm:grid-cols-3 lg:p-5">
          <Fact label={m.transfer.orderNumber}>
            <span dir="ltr" className="font-bold text-[var(--color-ink)]">
              {orderId}
            </span>
            <CopyButton value={orderId} label={m.transfer.copy} copiedLabel={m.transfer.copied} accessibleName={m.transfer.copyOrderNumber} />
          </Fact>
          <Fact label={m.transfer.amountDue}>
            <span dir="ltr" className="text-heading-m lg:text-heading-l font-bold text-[var(--color-brand-500)]">
              {amount}
            </span>
          </Fact>
          <Fact label={m.transfer.deadline}>
            <span className="font-semibold text-[var(--color-ink)]">{formatStoreDateTime(locale, transfer.expires_at)}</span>
          </Fact>
        </section>

        {toPay ? (
          <>
            {/* THE ORDER NUMBER WARNING — prominent, with its own copy button. */}
            <section role="note" className="flex flex-col gap-3 rounded-[16px] border-2 border-[var(--color-warning)] bg-[var(--color-warning-wash)] px-4 py-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <svg aria-hidden viewBox="0 0 24 24" className="mt-0.5 size-6 shrink-0 fill-none stroke-[var(--color-warning)]" strokeWidth={2}>
                  <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                </svg>
                <p className="min-w-0 flex-1 text-body-m lg:text-body-l font-semibold leading-[1.6] text-[var(--color-ink)]">{warning}</p>
              </div>
              <CopyButton value={orderId} label={m.transfer.copyOrderNumber} copiedLabel={m.transfer.copied} />
            </section>

            {/* Steps */}
            <section className="space-y-3">
              <h2 className="text-heading-m lg:text-heading-l font-bold text-[var(--color-ink)]">{m.transfer.stepsTitle}</h2>
              <ol className="space-y-2">
                {words.steps.map((step, index) => (
                  <li key={step} className="flex items-start gap-3">
                    <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--color-brand-500)] text-body-s font-bold text-[var(--color-on-primary)]">
                      {index + 1}
                    </span>
                    <span className="pt-0.5 text-body-m lg:text-body-l text-[var(--color-ink)]">{step}</span>
                  </li>
                ))}
              </ol>
            </section>

            {shamCash ? (
              <ShamCashWallet locale={locale} walletId={account.wallet_id} holder={account.beneficiary} />
            ) : (
              <>
                {/* PayID / Interac first, when the account has one (AUD, CAD). */}
                <PayByEmail locale={locale} accountName={account.beneficiary} payid={account.payid} interacEmail={account.interac_email} />

                {/* The account */}
                <section className="space-y-3 rounded-[16px] border border-[var(--color-input-border)] bg-[var(--color-surface)] p-4 lg:p-5">
                  <h2 className="text-heading-m lg:text-heading-l font-bold text-[var(--color-ink)]">
                    {account.payid || account.interac_email ? m.transfer.payByEmail.orBank : m.transfer.title}
                  </h2>
                  <dl className="divide-y divide-[var(--color-divider)]">
                    {rows
                      .filter((row) => row.value)
                      .map((row) => (
                        <div key={row.key} className="flex flex-wrap items-center justify-between gap-2 py-3">
                          <dt className="text-body-s lg:text-body-l text-[var(--color-ink-muted)]">{row.label}</dt>
                          <dd className="flex min-w-0 items-center gap-2">
                            <span dir={row.ltr ? "ltr" : undefined} className="break-all font-semibold text-[var(--color-ink)]">
                              {row.value}
                            </span>
                            {row.copy ? (
                              <CopyButton
                                value={row.value!.replace(/\s+/g, row.key === "beneficiary" ? " " : "")}
                                label={m.transfer.copy}
                                copiedLabel={m.transfer.copied}
                                accessibleName={`${m.transfer.copy} ${row.label}`}
                              />
                            ) : null}
                          </dd>
                        </div>
                      ))}
                  </dl>
                  {account.instructions ? (
                    <div className="rounded-[12px] bg-[var(--color-chip)] px-4 py-3">
                      <p className="text-body-s lg:text-body-l font-semibold text-[var(--color-ink-muted)]">{m.transfer.instructions}</p>
                      <p className="whitespace-pre-line text-body-s lg:text-body-l text-[var(--color-ink)]" dir="auto">
                        {account.instructions}
                      </p>
                    </div>
                  ) : null}
                </section>
              </>
            )}
          </>
        ) : null}

        {/* Upload */}
        {transfer.can_upload ? (
          status === "proof_submitted" ? (
            // Sent and awaiting review: nothing more is asked. Replacing a
            // wrong file is there for whoever looks for it — open already
            // when a replacement just failed, so its message is seen.
            <details
              open={Boolean(outcomeKey && outcomeKey !== "sent") || undefined}
              className="rounded-[16px] border border-[var(--color-input-border)] bg-[var(--color-surface)] p-4 lg:p-5"
            >
              <summary className="cursor-pointer text-body-m lg:text-body-l font-semibold text-[var(--color-brand-500)]">{m.transfer.replaceToggle}</summary>
              {proofForm(m.transfer.replaceProof, "mt-4 space-y-4")}
            </details>
          ) : (
            proofForm(
              status === "rejected" ? m.transfer.sendNewProof : m.transfer.submitProof,
              "space-y-4 rounded-[16px] border border-[var(--color-input-border)] bg-[var(--color-surface)] p-4 lg:p-5",
              <h2 className="text-heading-m lg:text-heading-l font-bold text-[var(--color-ink)]">{words.uploadTitle}</h2>,
            )
          )
        ) : outcome && outcomeKey !== "sent" ? (
          <p role="alert" className="text-body-s lg:text-body-l font-semibold text-[var(--color-danger)]">
            {outcome}
          </p>
        ) : null}

        {/* Proofs sent so far */}
        {transfer.proofs.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-heading-m lg:text-heading-l font-bold text-[var(--color-ink)]">{m.transfer.proofsTitle}</h2>
            <ul className="divide-y divide-[var(--color-divider)] rounded-[16px] border border-[var(--color-input-border)]">
              {transfer.proofs.map((item, index) => (
                <li key={item.public_id ?? `proof-${index}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span className="text-body-s lg:text-body-l text-[var(--color-ink)]">{formatStoreDateTime(locale, item.submitted_at ?? "")}</span>
                  <span className="text-body-s lg:text-body-l font-semibold text-[var(--color-ink-muted)]">
                    {m.transfer.proofStatus[item.status as keyof typeof m.transfer.proofStatus] ?? item.status}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-divider)] pt-4">
          <Link href={`/${locale}/order-status/${orderId}`} className="font-semibold text-[var(--color-brand-500)] underline underline-offset-4">
            {m.transfer.backToOrder}
          </Link>
          <p className="text-body-s lg:text-body-l text-[var(--color-ink-muted)]">
            {m.transfer.help}{" "}
            <a href={supportHref} className="font-semibold text-[var(--color-brand-500)] underline underline-offset-4" rel="noopener noreferrer">
              {m.transfer.helpLink}
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}

/**
 * Today somewhere on Earth: the date at UTC+14, the API's own bound for a
 * transfer date. The server's UTC "today" refused a Gulf customer's transfer
 * made after their midnight as one from tomorrow.
 */
function latestToday(): string {
  return new Date(new Date().getTime() + 14 * 3_600_000).toISOString().slice(0, 10);
}

const TONE: Record<string, string> = {
  awaiting_transfer: "border-[var(--color-brand-500)] bg-[var(--color-chip)] text-[var(--color-ink)]",
  proof_submitted: "border-[var(--color-brand-500)] bg-[var(--color-chip)] text-[var(--color-ink)]",
  under_review: "border-[var(--color-brand-500)] bg-[var(--color-chip)] text-[var(--color-ink)]",
  approved: "border-[var(--color-success)] text-[var(--color-success)]",
  rejected: "border-[var(--color-danger)] text-[var(--color-danger)]",
  expired: "border-[var(--color-line)] text-[var(--color-ink-muted)]",
  cancelled: "border-[var(--color-line)] text-[var(--color-ink-muted)]",
};

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-body-s lg:text-body-l text-[var(--color-ink-muted)]">{label}</p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-body-s lg:text-body-l font-semibold text-[var(--color-ink)]">{label}</span>
      {children}
    </label>
  );
}

