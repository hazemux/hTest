import Image from "next/image";
import Link from "next/link";

import { CHARACTER_TILE } from "@/components/account/ProfileCard";
import { signOut } from "@/lib/account/actions";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { CURRENCY_ICON } from "@/lib/loyalty/currency-icon";
import { formatAmount, formatPts, pointsUnit } from "@/lib/loyalty/format";
import type { LoyaltyWallet } from "@/lib/loyalty/types";
import { SubmitButton } from "@/components/ui/SubmitButton";

/**
 * «حسابي» on the phone — «Profile Mobile» (Claude Design, 2026-09-30).
 *
 *   - WHO: the customer's character (or their initial), name and phone; the
 *     whole row opens «المعلومات الشخصية»;
 *   - the rewards card, compact: available Charger Points, what is pending,
 *     the Charger Balance (the server's figure), and the way to the wallet;
 *   - one card of rows, a chevron each — VIP only while it is on (never «قريباً»);
 *   - sign-out, in red, a POST.
 *
 * Desktop keeps the side menu and the profile form (`AccountShell`).
 */
export function AccountHome({
  locale,
  customer,
  wallet,
  vip,
}: {
  locale: Locale;
  customer: { name?: string | null; phone?: string | null; avatar?: { url: string } | null };
  wallet: LoyaltyWallet | null;
  /** The programme's `features.vip` — the VIP row exists only while it is on. */
  vip: boolean;
}) {
  const m = messagesFor(locale);
  const name = customer.name?.trim() || null;
  const rows: { key: string; label: string; href: string; icon?: string; coin?: boolean }[] = [
    { key: "orders", label: m.account.ordersTitle, href: `/${locale}/account/orders`, icon: "orders" },
    { key: "savedAccounts", label: m.account.savedAccounts, href: `/${locale}/account/saved-accounts`, icon: "saved-accounts" },
    { key: "favourites", label: m.account.favourites, href: `/${locale}/account/favourites`, icon: "favourites" },
    { key: "points", label: m.account.points, href: `/${locale}/account/points`, coin: true },
    ...(vip ? [{ key: "vip", label: m.account.vip, href: `/${locale}/account/vip`, icon: "loyalty" }] : []),
    { key: "settings", label: m.account.settings, href: `/${locale}/account/settings`, icon: "settings" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-heading-m font-bold leading-[1.4] text-[var(--color-ink)]">{m.account.title}</h2>

      <Link href={`/${locale}/account/profile`} className="flex items-center gap-3.5 text-[var(--color-ink)]">
        {customer.avatar ? (
          <Image
            src={customer.avatar.url}
            alt=""
            width={120}
            height={120}
            unoptimized
            // The art is its own rounded tile: drawn as it comes, the ring 2px off its edge.
            className={`size-[60px] shrink-0 ${CHARACTER_TILE} outline outline-2 outline-offset-2 outline-[var(--color-brand-500)]`}
          />
        ) : (
          <span
            aria-hidden
            className="grid size-[60px] shrink-0 place-items-center rounded-[16px] bg-[var(--color-primary-wash-lighter)] text-display font-bold text-[var(--color-brand-500)] shadow-[0_0_0_2px_var(--color-brand-500)]"
          >
            {name ? name.charAt(0) : <Glyph src="/brand/icon-menu-profile.svg" className="size-7" />}
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-body-l font-bold leading-[1.4]">{name ?? m.account.personalInfo}</span>
          {customer.phone ? (
            <bdi dir="ltr" className="self-start text-caption font-medium text-[var(--color-ink-subtle)]">
              {customer.phone}
            </bdi>
          ) : null}
        </span>
        <span className="text-caption font-bold text-[var(--color-brand-500)]">{m.account.editProfile}</span>
      </Link>

      <section aria-labelledby="points-title" className="flex flex-col gap-3 rounded-[16px] bg-[var(--color-primary-wash-lighter)] p-4">
        <h3 id="points-title" className="text-body-s font-bold text-[var(--color-ink-muted)]">
          {m.account.pointsCardTitle}
        </h3>
        {wallet ? (
          <>
            <p className="flex items-center gap-2.5">
              <Image src={CURRENCY_ICON} alt="" aria-hidden width={32} height={32} unoptimized className="size-8" />
              <span dir="ltr" className="text-[30px] font-extrabold leading-none tabular-nums text-[var(--color-brand-500)]">
                {formatPts(locale, wallet.points.available)}
              </span>
              <span className="text-body-s font-semibold text-[var(--color-ink-muted)]">{pointsUnit(locale, wallet.points.available)}</span>
            </p>
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-[var(--color-ink-muted)]">
              <span>
                {m.loyalty.home.pending}{" "}
                <b dir="ltr" className="text-[var(--color-ink)]">
                  {formatPts(locale, wallet.points.pending)}
                </b>
              </span>
              <span>
                {m.loyalty.balanceTitle}{" "}
                <b dir="ltr" className="text-[var(--color-ink)]">
                  {formatAmount(locale, wallet.balance.available)}
                </b>
              </span>
            </p>
            <Link
              href={`/${locale}/account/points`}
              className="flex h-11 items-center justify-center gap-2 rounded-[10px] text-body-s font-bold text-[var(--color-brand-500)] shadow-[inset_0_0_0_1px_var(--color-brand-500)] hover:bg-[var(--color-primary-wash-lighter)]"
            >
              <Glyph src="/brand/icon-wallet.svg" className="size-[18px]" />
              {m.loyalty.wallet.title}
            </Link>
          </>
        ) : (
          <p className="text-body-s text-[var(--color-ink-muted)]">{m.account.sectionUnavailable}</p>
        )}
      </section>

      <nav aria-label={m.account.title} className="flex flex-col rounded-[16px] bg-[var(--color-chip)] px-3.5 py-1">
        {rows.map((row, index) => (
          <Link
            key={row.key}
            href={row.href}
            className={`flex min-h-[52px] items-center gap-3 text-[var(--color-ink)] ${index > 0 ? "border-t border-[var(--color-line)]" : ""}`}
          >
            {row.coin ? (
              <Image src={CURRENCY_ICON} alt="" aria-hidden width={22} height={22} unoptimized className="size-[22px] shrink-0" />
            ) : (
              <Glyph src={`/brand/icon-menu-${row.icon}.svg`} className="size-[22px]" />
            )}
            <span className="flex-1 text-body-s font-bold">{row.label}</span>
            <span
              aria-hidden
              className="block size-4 shrink-0 bg-[var(--color-ink-subtle)] [mask-image:url(/brand/icon-chevron-start.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:5px_10px] ltr:-scale-x-100"
            />
          </Link>
        ))}
      </nav>

      {/* A POST, not a link: signing out changes state. */}
      <form action={signOut}>
        <input type="hidden" name="locale" value={locale} />
        <SubmitButton className="flex min-h-12 items-center gap-3 px-3.5 text-body-s font-bold text-[var(--color-danger)]">
          <Glyph src="/brand/icon-account-logout.svg" className="size-[22px]" />
          {m.account.signOut}
        </SubmitButton>
      </form>
    </div>
  );
}

/** A glyph from the pack, painted in the text colour around it. */
function Glyph({ src, className }: { src: string; className: string }) {
  return (
    <span
      aria-hidden
      className={`block shrink-0 bg-current [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] ${className}`}
      style={{ maskImage: `url(${src})`, WebkitMaskImage: `url(${src})` }}
    />
  );
}
