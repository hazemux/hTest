import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { SubmitButton } from "@/components/ui/SubmitButton";
import { isPublicId } from "@/lib/api/public-id";
import { addedReturnPath } from "@/lib/cart/added-return-path";
import { isLocale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { guestStockAlertsEnabled, isSlug } from "@/lib/stock-alerts/guest";
import { requestGuestStockAlertAction } from "@/lib/stock-alerts/guest-actions";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ product?: string; pack?: string; slug?: string; back?: string; state?: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  // Never indexed — also by `X-Robots-Tag` (next.config.ts, PRIVATE_ROUTES).
  return isLocale(locale) ? { title: messagesFor(locale).stockAlertGuest.title, robots: { index: false, follow: false } } : {};
}

/**
 * «نبهني عند التوفير» for a guest (owner, 2026-10-27): the product page's
 * button sends a visitor with no session here, when
 * `STOCK_ALERTS_GUEST_ENABLED` is on, instead of to sign-in.
 *
 * NO COMP for this screen: built to the design system, on the unsubscribe
 * page's pattern — its heading, lead, field and primary button.
 *
 * The address is confirmed from its own inbox before anything is sent to it
 * (anyone can type anyone's), so «sent» is the only answer: the API says the
 * same whatever it did. Sign-in stays one tap away, and waits on the account
 * exactly as before (`stock-alerts/resume`).
 */
export default async function GuestStockAlertPage(props: Props) {
  // Per request: the product and the outcome are in the query.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const { product, pack, slug, back: rawBack, state } = await props.searchParams;
  const productSlug = isSlug(slug) ? slug : null;
  const back = addedReturnPath(locale, rawBack) ?? (productSlug ? `/${locale}/products/${productSlug}` : `/${locale}`);
  if (!isPublicId(product) || !guestStockAlertsEnabled()) redirect(back);
  const packId = isPublicId(pack) ? pack : null;

  const m = messagesFor(locale);
  const g = m.stockAlertGuest;
  const resume = `/${locale}/stock-alerts/resume?${new URLSearchParams({ product, ...(packId ? { pack: packId } : {}), back })}`;
  const signIn = `/${locale}/account/sign-in?next=${encodeURIComponent(resume)}`;
  const problem = state === "email" ? g.emailInvalid : state === "slow" ? g.slow : state === "retry" ? g.retry : null;

  return (
    <main className="mx-auto w-full max-w-[640px] flex-1 px-6 pb-16 pt-6 lg:pt-[70px]">
      <h1 className="text-heading-m font-bold leading-[1.4] text-[var(--color-ink)] lg:text-display">{g.title}</h1>

      {state === "sent" ? (
        <>
          <p role="status" className="mt-2 text-body-m font-medium leading-[1.5] text-[var(--color-ink)] lg:text-body-l">
            {g.sent}
          </p>
          <p className="mt-2 text-body-s font-medium leading-[1.5] text-[var(--color-ink-muted)] lg:text-body-l">{g.sentHint}</p>
          <Link href={back} className={`mt-6 inline-block ${PRIMARY_LINK}`}>
            {g.backToProduct}
          </Link>
        </>
      ) : (
        <form action={requestGuestStockAlertAction} className="mt-2 flex flex-col gap-5">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="product" value={product} />
          {packId ? <input type="hidden" name="pack" value={packId} /> : null}
          {productSlug ? <input type="hidden" name="slug" value={productSlug} /> : null}
          <input type="hidden" name="back" value={back} />
          <p className="text-body-m font-medium leading-[1.5] text-[var(--color-ink-muted)] lg:text-body-l">{g.lead}</p>
          <label className="flex flex-col gap-1.5">
            <span className="text-caption font-bold text-[var(--color-ink)] lg:text-body-s">{g.email}</span>
            <input
              type="email"
              name="email"
              required
              maxLength={255}
              autoComplete="email"
              inputMode="email"
              dir="ltr"
              aria-invalid={state === "email" ? true : undefined}
              className="h-12 rounded-[12px] border border-[var(--color-line)] bg-[var(--color-surface)] px-3.5 text-body-m text-[var(--color-ink)] outline-none focus:border-[var(--color-brand-500)]"
            />
          </label>
          {problem ? (
            <p role="alert" className="rounded-[10px] bg-[var(--color-error-subtlest)] px-3 py-2.5 text-caption font-bold text-[var(--color-danger)] lg:text-body-s">
              {problem}
            </p>
          ) : null}
          <SubmitButton className={PRIMARY}>{g.submit}</SubmitButton>
          <Link href={signIn} className="text-center text-body-s font-bold text-[var(--color-brand-500)] lg:text-body-m">
            {g.signIn}
          </Link>
        </form>
      )}
    </main>
  );
}

const PRIMARY =
  "h-[52px] w-full rounded-[12px] bg-[var(--color-brand-500)] px-4 text-body-m font-bold text-[var(--color-on-cta)] transition hover:bg-[var(--color-primary-hover)] active:scale-[0.99]";
const PRIMARY_LINK =
  "rounded-[12px] bg-[var(--color-brand-500)] px-6 py-3 text-body-m font-bold text-[var(--color-on-cta)] transition hover:bg-[var(--color-primary-hover)] active:scale-[0.99]";
