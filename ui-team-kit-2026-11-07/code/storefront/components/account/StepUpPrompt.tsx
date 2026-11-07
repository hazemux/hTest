import Link from "next/link";

import { AccountCard } from "@/components/account/AccountShell";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * What a section guarded by two-step verification shows until this session
 * has confirmed with a code (API v0.1.60) — a sentence and the way through,
 * never an error. `next` brings the customer straight back.
 */
export function StepUpPrompt({ locale, title, next }: { locale: Locale; title: string; next: string }) {
  const m = messagesFor(locale);

  return (
    <AccountCard title={title}>
      <p className="text-body-s font-medium text-[var(--color-ink-muted)] lg:text-body-l">{m.account.stepUpNeeded}</p>
      <Link
        href={`/${locale}/account/verify?next=${encodeURIComponent(next)}`}
        className="mt-6 inline-flex h-[52px] items-center justify-center rounded-[12px] bg-[var(--color-brand-500)] px-8 text-body-l font-semibold text-[var(--color-on-primary)] transition hover:bg-[var(--color-primary-hover)]"
      >
        {m.account.stepUpAction}
      </Link>
    </AccountCard>
  );
}
