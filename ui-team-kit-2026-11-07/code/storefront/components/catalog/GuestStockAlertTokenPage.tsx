import Link from "next/link";

import { SubmitButton } from "@/components/ui/SubmitButton";
import { isPublicId } from "@/lib/api/public-id";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { isSlug } from "@/lib/stock-alerts/guest";
import { cancelGuestStockAlertAction, confirmGuestStockAlertAction } from "@/lib/stock-alerts/guest-actions";

/**
 * Where the confirmation mail's two links land (owner, 2026-10-27; contract
 * v0.1.143): «تأكيد التنبيه» and «إلغاء التنبيه».
 *
 * NO COMP: built to the design system, on the unsubscribe page's pattern.
 *
 * ONE BUTTON, NOT AN ACTION ON ARRIVAL. Mail scanners and link previews open
 * links; a page that confirmed on opening would sign up addresses nobody
 * confirmed, and one that cancelled would undo real alerts. The page says
 * what will happen; the post does it.
 *
 * The URL carries the token, so the route is a PRIVATE_ROUTE: noindex by
 * header, `same-origin` referrers — not `no-referrer`, because the button is
 * a Server Action and under `no-referrer` the browser posts `Origin: null`
 * (HANDBOOK §2).
 */
export function GuestStockAlertTokenPage({
  locale,
  kind,
  token,
  state,
  slug,
  pack,
}: {
  locale: Locale;
  kind: "confirm" | "cancel";
  token: string;
  state: string | undefined;
  slug: string | undefined;
  pack: string | undefined;
}) {
  const g = messagesFor(locale).stockAlertGuest;
  const view = state === "done" || state === "sent" ? state : state === "invalid" || token === "" ? "invalid" : "ask";
  const productHref = isSlug(slug) ? `/${locale}/products/${slug}${isPublicId(pack) ? `?pack=${pack}` : ""}` : null;

  return (
    <main className="mx-auto w-full max-w-[640px] flex-1 px-6 pb-16 pt-6 lg:pt-[70px]">
      <h1 className="text-heading-m font-bold leading-[1.4] text-[var(--color-ink)] lg:text-display">
        {kind === "confirm" ? g.confirmTitle : g.cancelTitle}
      </h1>

      {view === "ask" ? (
        <form action={kind === "confirm" ? confirmGuestStockAlertAction : cancelGuestStockAlertAction} className="mt-2 flex flex-col gap-6">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="token" value={token} />
          <p className="text-body-m font-medium leading-[1.5] text-[var(--color-ink-muted)] lg:text-body-l">
            {kind === "confirm" ? g.confirmAsk : g.cancelAsk}
          </p>
          {state === "retry" ? (
            <p role="alert" className="rounded-[10px] bg-[var(--color-error-subtlest)] px-3 py-2.5 text-caption font-bold text-[var(--color-danger)] lg:text-body-s">
              {g.actionRetry}
            </p>
          ) : null}
          <SubmitButton className={PRIMARY}>{kind === "confirm" ? g.confirm : g.cancel}</SubmitButton>
        </form>
      ) : (
        <>
          <p
            role={view === "invalid" ? "alert" : "status"}
            className="mt-2 text-body-m font-medium leading-[1.5] text-[var(--color-ink)] lg:text-body-l"
          >
            {view === "invalid" ? g.invalid : view === "sent" ? g.alreadySent : kind === "confirm" ? g.confirmed : g.cancelled}
          </p>
          <Link href={productHref ?? `/${locale}`} className={`mt-6 inline-block ${PRIMARY_LINK}`}>
            {productHref ? g.backToProduct : g.toStore}
          </Link>
        </>
      )}
    </main>
  );
}

const PRIMARY =
  "h-[52px] w-full rounded-[12px] bg-[var(--color-brand-500)] px-4 text-body-m font-bold text-[var(--color-on-cta)] transition hover:bg-[var(--color-primary-hover)] active:scale-[0.99]";
const PRIMARY_LINK =
  "rounded-[12px] bg-[var(--color-brand-500)] px-6 py-3 text-body-m font-bold text-[var(--color-on-cta)] transition hover:bg-[var(--color-primary-hover)] active:scale-[0.99]";
