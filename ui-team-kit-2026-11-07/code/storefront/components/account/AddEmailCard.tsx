import Link from "next/link";

import { headerViewer } from "@/lib/account/header-viewer";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * The payment-success page's own «أضف بريدك» card (owner, 2026-10-26): the
 * moment a phone-only customer learns their order's messages go by email. It
 * is a card, not the sheet — the sheet never opens over a payment page — and it
 * links to the profile's email form. Nothing for a guest or a proved email.
 */
export async function AddEmailCard({ locale }: { locale: Locale }) {
  const viewer = await headerViewer(locale);
  if (!viewer.needsEmail) return null;
  const m = messagesFor(locale).account;

  return (
    <div className="flex items-center gap-3 rounded-[16px] bg-[var(--color-brand-50)] p-3.5">
      <span aria-hidden className="block size-6 shrink-0 bg-[var(--color-brand-500)] [mask-image:url(/brand/icon-email.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
      <span className="flex flex-1 flex-col">
        <span className="text-body-s font-bold lg:text-body-l">{m.emailCardTitle}</span>
        <span className="text-caption text-[var(--color-ink-muted)] lg:text-body-s">{m.emailCardBody}</span>
      </span>
      <Link href={`/${locale}/account/profile#email`} className="shrink-0 rounded-[10px] bg-[var(--color-brand-500)] px-3 py-2 text-caption font-bold text-[var(--color-on-cta)]">
        {m.emailCardCta}
      </Link>
    </div>
  );
}
