import Image from "next/image";
import Link from "next/link";

import type { Locale } from "@/lib/i18n/locales";
import { formatPoints, messagesFor } from "@/lib/i18n/messages";
import { agreePointsUnits } from "@/lib/i18n/points-plural";
import { CURRENCY_ICON } from "@/lib/loyalty/currency-icon";
import { claimGuestOrder } from "@/lib/orders/claim";
import { SubmitButton } from "@/components/ui/SubmitButton";

/**
 * «احفظ طلبك في حسابك» — the guest's invitation to keep this order on an
 * account («Payment Result Mobile», 2026-09-30, adapted to the owner's
 * «invite, don't create»: nothing is made for them).
 *
 * Drawn only where the server offered it (`order.claim`, v0.1.63): a guest
 * looking at their own order that belongs to no account yet.
 *
 *   - SIGNED OUT: sign up — or sign in — and come straight back here; the
 *     WhatsApp code is what proves the phone the order was placed with.
 *   - SIGNED IN (the session and this order's guest cookie in one browser):
 *     one button keeps it (`claimGuestOrder`).
 *
 * The points line is the server's estimate for a NEW account, «≈», and only
 * once the order is paid — hidden when it would print as 0.
 */
export function ClaimInvite({
  locale,
  orderId,
  pointsEstimate,
  signedIn,
  outcome,
}: {
  locale: Locale;
  orderId: string;
  /** Display points a new account would earn (ADR 0043 §1), or null. */
  pointsEstimate: number | null;
  signedIn: boolean;
  /** `?claim=` after a keep that did not go through. */
  outcome?: string;
}) {
  const m = messagesFor(locale);
  const back = `/${locale}/order-status/${encodeURIComponent(orderId)}`;
  const points = pointsEstimate && pointsEstimate > 0 ? formatPoints(locale, String(pointsEstimate)) : null;
  const problem = outcome === "phone" ? m.claim.phoneMismatch : outcome === "failed" ? m.claim.failed : null;
  const button =
    "flex h-[46px] w-full items-center justify-center rounded-[12px] px-4 text-body-s font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]";

  return (
    <section
      aria-labelledby={`claim-${orderId}`}
      className="flex flex-col gap-3 rounded-[18px] bg-[var(--color-primary-wash-lighter)] p-4 shadow-[inset_0_0_0_1.5px_var(--color-primary-wash-light)]"
    >
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-[var(--color-brand-500)]">
          <span className="block size-[22px] bg-[var(--color-on-cta)] [mask-image:url(/brand/icon-menu-profile.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <h2 id={`claim-${orderId}`} className="text-body-m font-bold leading-[1.45] text-[var(--color-ink)] lg:text-heading-m">
            {m.claim.title}
          </h2>
          <span className="text-caption leading-[1.5] text-[var(--color-ink-muted)] lg:text-body-s">{m.claim.lead}</span>
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {[m.claim.perkTrack, m.claim.perkPoints, m.claim.perkFaster].map((perk) => (
          <li key={perk} className="flex items-center gap-2 text-body-s font-semibold text-[var(--color-ink)] lg:text-body-l">
            <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--color-success)]">
              <span className="block size-[11px] bg-[var(--background)] [mask-image:url(/brand/icon-check-white.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
            </span>
            {perk}
          </li>
        ))}
      </ul>

      {points ? (
        <p className="flex items-center gap-2 rounded-[12px] bg-[var(--background)] px-3 py-2.5 text-body-s text-[var(--color-ink)] lg:text-body-l">
          <Image src={CURRENCY_ICON} alt="" aria-hidden width={22} height={22} unoptimized className="size-[22px] shrink-0" />
          <span>{agreePointsUnits(m.claim.points.replace("{points}", `≈ ${points}`))}</span>
        </p>
      ) : null}

      {problem ? (
        <p role="alert" className="rounded-[12px] bg-[var(--color-error-subtlest)] px-3 py-2.5 text-body-s font-bold text-[var(--color-danger)] lg:text-body-l">
          {problem}
        </p>
      ) : null}

      {signedIn ? (
        <form action={claimGuestOrder}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="order" value={orderId} />
          <SubmitButton className={`${button} bg-[var(--color-brand-500)] text-[var(--color-on-cta)] hover:bg-[var(--color-primary-hover)]`}>
            {m.claim.keep}
          </SubmitButton>
        </form>
      ) : (
        <div className="flex flex-col gap-2">
          <Link
            href={`/${locale}/account/sign-up?next=${encodeURIComponent(back)}`}
            className={`${button} bg-[var(--color-brand-500)] text-[var(--color-on-cta)] hover:bg-[var(--color-primary-hover)]`}
          >
            {m.claim.signUp}
          </Link>
          <Link
            href={`/${locale}/account/sign-in?next=${encodeURIComponent(back)}`}
            className={`${button} text-[var(--color-ink)] shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-[var(--color-bg-subtle)]`}
          >
            {m.claim.signIn}
          </Link>
          <p className="text-center text-caption leading-[1.6] text-[var(--color-ink-subtle)]">{m.claim.note}</p>
        </div>
      )}
    </section>
  );
}
