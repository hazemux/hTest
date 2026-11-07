import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SubmitButton } from "@/components/ui/SubmitButton";
import { readSessionToken } from "@/lib/account/session";
import { ApiError, previewRecoveryLink } from "@/lib/api/client";
import { restoreRecoveredCart } from "@/lib/cart/actions";
import { readCart } from "@/lib/cart/cart";
import { isRecoveryToken, RECOVER_COOKIE } from "@/lib/cart/recover-link";
import { readCartRef } from "@/lib/cart/recovery-ref";
import { recordFunnel } from "@/lib/cart/recovery-sync";
import { isLocale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  // Never indexed — also by `X-Robots-Tag` on every `/cart/*` (next.config.ts).
  return isLocale(locale) ? { title: messagesFor(locale).cart.recoverTitle, robots: { index: false, follow: false } } : {};
}

/**
 * Where a recovery link lands (ADR 0039 §5) — after its GET moved the token
 * into `cq_recover`, so this URL carries nothing.
 *
 * NO COMP for this screen: built to the cart's own design system (its
 * heading, card and buttons). It shows what the link holds — names in the
 * page's language and quantities, never a price (the basket prices it again)
 * and never a field value — and asks ONE question: restore it, or, when this
 * browser already has a basket, add to it or replace it. Plain form posts:
 * the restore works before hydration and with JavaScript off.
 *
 * READING IS FREE; RESTORING IS A POST. The preview places, sends and
 * consumes nothing, so a refresh or a scanner that got this far changes
 * nothing either.
 */
export default async function RecoverConfirmPage(props: Props) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();
  const m = messagesFor(locale);

  const token = (await cookies()).get(RECOVER_COOKIE)?.value;
  let contents = null;
  if (isRecoveryToken(token)) {
    // The browser's own reference proves it is the cart's owner, so the
    // player fields come back too; anyone else gets products and packs.
    const ref = await readCartRef();
    try {
      contents = await previewRecoveryLink(
        { token, cart: ref ? { id: ref.id, token: ref.token } : null },
        { locale, bearerToken: await readSessionToken() },
      );
    } catch (error) {
      // 404 unknown, 410 expired or revoked, or the API off: the same
      // friendly answer. Anything else is a real error.
      if (!(error instanceof ApiError)) throw error;
    }
  }

  if (!contents || contents.lines.length === 0) {
    return (
      <main className="mx-auto w-full max-w-[640px] flex-1 px-6 pb-16 pt-6 lg:pt-[70px]">
        <h1 className="text-heading-m font-bold leading-[1.4] text-[var(--color-ink)] lg:text-display">{m.cart.recoverExpiredTitle}</h1>
        <p className="mt-2 text-body-l font-medium leading-[1.5] text-[var(--color-ink-muted)]">{m.cart.recoverExpiredLead}</p>
        <Link
          href={`/${locale}`}
          className="mt-6 inline-block rounded-[12px] bg-[var(--color-brand-500)] px-6 py-3 text-body-m font-bold text-[var(--color-on-cta)] transition hover:bg-[var(--color-primary-hover)] active:scale-[0.99]"
        >
          {m.cart.recoverToStore}
        </Link>
      </main>
    );
  }

  // Only once the link was found — an unknown or expired one is not an «opened» recovery.
  await recordFunnel([{ step: "recovery_link_opened" }], { locale });

  const hasBasket = (await readCart()).length > 0;

  return (
    <main className="mx-auto w-full max-w-[640px] flex-1 px-6 pb-16 pt-6 lg:pt-[70px]">
      <h1 className="text-heading-m font-bold leading-[1.4] text-[var(--color-ink)] lg:text-display">{m.cart.recoverTitle}</h1>
      <p className="mt-2 text-body-m font-medium leading-[1.5] text-[var(--color-ink-muted)] lg:text-body-l">{m.cart.recoverLead}</p>

      <ul className="mt-6 flex flex-col gap-3">
        {contents.lines.map((line, index) => (
          <li
            key={`${line.slug}-${line.pack_public_id ?? ""}-${index}`}
            className="flex items-center justify-between gap-3 rounded-[12px] bg-[var(--color-surface)] p-4 shadow-[inset_0_0_0_1px_var(--color-line)]"
          >
            <span className="min-w-0 text-body-m font-bold leading-[1.5] text-[var(--color-ink)] lg:text-body-l">
              {line.name?.[locale] || line.name?.en || line.slug}
            </span>
            <span
              dir="ltr"
              className="shrink-0 rounded-full bg-[var(--color-chip)] px-2 text-caption font-bold leading-[22px] tabular-nums text-[var(--color-ink-muted)] lg:text-body-s"
            >
              ×{line.quantity}
            </span>
          </li>
        ))}
      </ul>

      {contents.fields_restored ? null : (
        <p className="mt-3 text-body-s font-medium leading-[1.5] text-[var(--color-ink-muted)]">{m.cart.recoverDetailsAgain}</p>
      )}

      <form action={restoreRecoveredCart} className="mt-8 flex flex-col gap-3">
        <input type="hidden" name="locale" value={locale} />
        {hasBasket ? (
          <>
            <p className="text-body-m font-semibold leading-[1.5] text-[var(--color-ink)]">{m.cart.recoverHasBasket}</p>
            <SubmitButton name="mode" value="merge" className={PRIMARY}>
              {m.cart.recoverMerge}
            </SubmitButton>
            <SubmitButton name="mode" value="replace" className={SECONDARY}>
              {m.cart.recoverReplace}
            </SubmitButton>
          </>
        ) : (
          <SubmitButton name="mode" value="replace" className={PRIMARY}>
            {m.cart.recoverRestore}
          </SubmitButton>
        )}
      </form>
    </main>
  );
}

const PRIMARY =
  "h-[52px] w-full rounded-[12px] bg-[var(--color-brand-500)] px-4 text-body-m font-bold text-[var(--color-on-cta)] transition hover:bg-[var(--color-primary-hover)] active:scale-[0.99]";
const SECONDARY =
  "h-[52px] w-full rounded-[12px] border border-[var(--color-brand-500)] px-4 text-body-m font-bold text-[var(--color-brand-500)] transition active:scale-[0.99]";
