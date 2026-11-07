import Image from "next/image";

import { CopyButton } from "@/components/checkout/CopyButton";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * The wallet the owner's QR picture encodes (decoded 2026-11-01: the QR holds
 * this ID and nothing else). The picture is shown only while the API names
 * this same wallet — a new wallet ID in the server's settings shows the ID
 * alone until a new picture ships, never a QR that pays someone else.
 */
export const SHAMCASH_QR_WALLET = "719a0995974696032f1f30b796b312de";

/**
 * Where a ShamCash payment goes (v0.1.152): the QR to scan, the wallet ID to
 * paste, and the holder's name to check. Takes the place of the bank account
 * card on the transfer page.
 *
 * No comp exists for it; built to the transfer page's own card and row
 * styles, as `PayByEmail` is.
 */
export function ShamCashWallet({
  locale,
  walletId,
  holder,
}: {
  locale: Locale;
  walletId?: string | null;
  holder?: string | null;
}) {
  if (!walletId) return null;

  const m = messagesFor(locale);
  const t = m.transfer.shamcash;

  return (
    <section className="space-y-4 rounded-[16px] border-2 border-[var(--color-brand-500)] bg-[var(--color-surface)] p-4 lg:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-heading-m lg:text-heading-l font-bold text-[var(--color-ink)]">{t.walletTitle}</h2>
        <Image src="/brand/method-shamcash.svg" width={32} height={32} alt="" aria-hidden unoptimized className="size-8 shrink-0" />
      </div>

      {walletId === SHAMCASH_QR_WALLET ? (
        <figure className="flex flex-col items-center gap-2">
          {/* The picture carries its own white quiet zone, which a QR needs to scan in either theme. */}
          <Image src="/brand/shamcash-qr.png" width={220} height={220} alt={t.qrAlt} unoptimized className="size-[200px] rounded-[12px] lg:size-[220px]" />
          <figcaption className="text-body-s lg:text-body-l text-[var(--color-ink-muted)]">{t.qrHelp}</figcaption>
        </figure>
      ) : null}

      <dl className="divide-y divide-[var(--color-divider)]">
        <div className="flex flex-wrap items-center justify-between gap-2 py-3">
          <dt className="text-body-s lg:text-body-l text-[var(--color-ink-muted)]">{t.walletId}</dt>
          <dd className="flex min-w-0 items-center gap-2">
            <span dir="ltr" className="break-all font-semibold text-[var(--color-ink)]">
              {walletId}
            </span>
            <CopyButton value={walletId} label={m.transfer.copy} copiedLabel={m.transfer.copied} accessibleName={`${m.transfer.copy} ${t.walletId}`} />
          </dd>
        </div>
        {holder ? (
          <div className="flex flex-wrap items-center justify-between gap-2 py-3">
            <dt className="text-body-s lg:text-body-l text-[var(--color-ink-muted)]">{t.holder}</dt>
            <dd className="font-semibold text-[var(--color-ink)]" dir="auto">
              {holder}
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
