import Link from "next/link";

import { AlertBar, alertProps } from "@/components/ui/AlertBar";
import { signOut } from "@/lib/account/actions";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import Image from "next/image";
import { currencyForVisitor } from "@/lib/currency/visitor";
import { CURRENCY_ICON } from "@/lib/loyalty/currency-icon";
import { loyaltyProgram } from "@/lib/loyalty/program";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { AvatarRing } from "@/components/loyalty/vip/AvatarRing";
import { VipChip } from "@/components/loyalty/vip/VipChip";
import { readSessionToken } from "@/lib/account/session";
import { visitorAccount } from "@/lib/account/visitor-account";
import { TIER_ARTWORK } from "@/components/loyalty/art";
import { formatPts } from "@/lib/loyalty/format";
import { mapWallet } from "@/lib/loyalty/map";
import { pointsUnit } from "@/lib/i18n/points-plural";

/**
 * The account area's frame — `4317:16178` on desktop: the side menu (285) at
 * the START edge and the section's card (883) beside it, 32 apart, both white
 * with the comp's soft 12px shadow and radius 16. The active row is filled in
 * primary (radius 12, 8 in), the rest SemiBold 18 in ink after a 24px glyph.
 *
 * ON THE PHONE `/account` IS ITS OWN PAGE (`phoneHome`, «Profile Mobile»,
 * 2026-09-30): who the customer is, their points and a row per section, each
 * opening its own page. Every section page hides the side menu below `lg`.
 *
 * ROWS ONLY WHERE A SECTION EXISTS. «توثيق الحساب» (account verification) is
 * in the comp and has no backend, so it is not drawn — a menu row to nothing
 * is worse than a gap. «عضوية VIP» is drawn only while the programme's
 * `features.vip` is on (owner: never «قريباً»); a programme that cannot be
 * read hides it.
 */
export type AccountSection =
  | "personalInfo"
  | "orders"
  | "savedAccounts"
  | "favourites"
  | "points"
  | "vip"
  | "settings";

const SECTIONS: readonly { key: AccountSection; icon: string; path: string }[] = [
  { key: "personalInfo", icon: "profile", path: "/account/profile" },
  { key: "orders", icon: "orders", path: "/account/orders" },
  { key: "savedAccounts", icon: "saved-accounts", path: "/account/saved-accounts" },
  { key: "favourites", icon: "favourites", path: "/account/favourites" },
  { key: "points", icon: "points", path: "/account/points" },
  // «عضوية VIP» — only while `features.vip` is on (`vipEnabled()`).
  { key: "vip", icon: "loyalty", path: "/account/vip" },
  { key: "settings", icon: "settings", path: "/account/settings" },
];

/**
 * Whether «عضوية VIP» exists right now: the cached programme's `features.vip`
 * (`GET /loyalty/program`, tag `loyalty`). Off when the programme cannot be
 * read — a row is drawn only when its page answers.
 */
export async function vipEnabled(locale: Locale): Promise<boolean> {
  const program = await loyaltyProgram(locale, await currencyForVisitor());
  return program?.features.vip === true;
}

export async function AccountShell({
  locale,
  active,
  phoneHome,
  children,
}: {
  locale: Locale;
  /** The row drawn as selected in the desktop side menu. */
  active: AccountSection | null;
  /** `/account` only: what the phone shows instead — the content is then desktop-only. */
  phoneHome?: React.ReactNode;
  children: React.ReactNode;
}) {
  const m = messagesFor(locale);
  const [vipOn, profile] = await Promise.all([vipEnabled(locale), sideProfile(locale)]);
  const sections = vipOn ? SECTIONS : SECTIONS.filter((section) => section.key !== "vip");

  return (
    <main className="mx-auto w-full max-w-[1248px] flex-1 px-6 pb-12 pt-6 lg:pt-[70px]">
      <h1 className="sr-only">{m.account.title}</h1>
      {/* v0.1.123 — frozen for fraud (owner, 2026-10-12): said on every
          account page, without saying why. */}
      {profile?.frozen ? (
        <p role="status" className="mb-6 rounded-[12px] bg-[var(--color-warning-wash)] px-4 py-3 text-body-s font-bold text-[var(--color-warning-strong)] lg:text-body-l">
          {m.account.frozenNotice}
        </p>
      ) : null}
      <div className="grid items-start gap-6 lg:grid-cols-[285px_minmax(0,1fr)] lg:gap-8">
        {phoneHome ? <div className="lg:hidden">{phoneHome}</div> : null}
        <div className="hidden flex-col gap-6 lg:flex">
          <nav
            aria-label={m.account.title}
            className="flex flex-col gap-6 lg:rounded-[16px] lg:bg-[var(--color-surface-raised)] lg:p-6 lg:shadow-[0_0_12px_rgba(0,0,0,0.07)]"
          >
            {profile ? <ProfileCard locale={locale} profile={profile} /> : null}
            {sections.map((section) => {
              const current = section.key === active;
              return (
                <Link
                  key={section.key}
                  href={`/${locale}${section.path}`}
                  aria-current={current ? "page" : undefined}
                  // On the phone's menu page no row is selected (`6847:70956`);
                  // the selection is the desktop side menu's.
                  className={`flex items-center gap-3 text-body-l font-semibold leading-[1.4] transition lg:text-heading-m ${
                    current
                      ? "rounded-[12px] bg-[var(--color-brand-500)] p-2 text-[var(--color-on-primary)]"
                      : "text-[var(--color-ink)] hover:text-[var(--color-brand-500)]"
                  }`}
                >
                  {/* «النقاط» wears the loyalty currency's own mark, in its
                      colours (Figma "Currency Icon"); every other row is a
                      glyph in the text colour. */}
                  {section.key === "points" ? (
                    <Image src={CURRENCY_ICON} alt="" aria-hidden width={24} height={24} unoptimized className="size-6 shrink-0" />
                  ) : (
                    <Glyph src={`/brand/icon-menu-${section.icon}.svg`} />
                  )}
                  {section.key === "orders" ? m.account.ordersTitle : m.account[section.key]}
                </Link>
              );
            })}

            {/* A POST, not a link, and the only red row — as drawn. Signing
                out changes state, and a GET that changes state is something a
                prefetcher or an <img> elsewhere can fire for the customer. */}
            <form action={signOut}>
              <input type="hidden" name="locale" value={locale} />
              <SubmitButton
                className="flex items-center gap-3 text-body-l font-semibold leading-[1.4] text-[var(--color-danger)] lg:text-heading-m"
              >
                <Glyph src="/brand/icon-account-logout.svg" />
                {m.account.signOut}
              </SubmitButton>
            </form>
          </nav>
        </div>

        <div className={`${phoneHome ? "hidden lg:block" : ""} min-w-0`}>{children}</div>
      </div>
    </main>
  );
}

type SideProfile = {
  name: string | null;
  avatar: string | null;
  tier: { code: string; name: string } | null;
  vip: boolean;
  points: number | null;
  frozen: boolean;
};

/**
 * Who is signed in, for the card at the top of the side menu («VIP
 * Experience» — the AccountShell delta): the SAME `visitorAccount` call the
 * layout made, with the same arguments, so Next's per-render fetch dedupe
 * answers it without a request (HANDBOOK §8). Null when the profile could not
 * be read — the card is then simply not drawn.
 */
async function sideProfile(locale: Locale): Promise<SideProfile | null> {
  const [token, currency] = await Promise.all([readSessionToken(), currencyForVisitor()]);
  if (!token) return null;
  const { customer, wallet } = await visitorAccount(locale, token, currency);
  if (!customer) return null;
  const mapped = wallet ? mapWallet(wallet, locale, customer.name) : null;
  return {
    name: customer.name?.trim() || null,
    avatar: customer.avatar?.url ?? null,
    tier: mapped?.tier ? { code: mapped.tier.code, name: mapped.tier.name } : null,
    vip: mapped?.vip != null,
    points: mapped ? mapped.points.available : null,
    frozen: customer.account_frozen === true,
  };
}

/**
 * The side menu's profile card: the character in its tier frame (+ VIP halo
 * and badge), the name with the VIP chip, and the level · points line.
 * Opens «المعلومات الشخصية».
 */
function ProfileCard({ locale, profile }: { locale: Locale; profile: SideProfile }) {
  const m = messagesFor(locale);
  const medal = profile.tier ? TIER_ARTWORK[profile.tier.code] : null;
  const points = profile.points === null ? null : formatPts(locale, profile.points);
  return (
    <Link
      href={`/${locale}/account/profile`}
      data-account-profile=""
      className="flex items-center gap-2.5 rounded-[14px] bg-[var(--color-chip)] p-2.5 text-[var(--color-ink)]"
    >
      <AvatarRing size={56} tier={profile.tier?.code} vip={profile.vip} src={profile.avatar} />
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="flex min-w-0 items-center gap-1.5">
          <b className="truncate text-body-m leading-[1.4]">{profile.name ?? m.nav.menu.mine}</b>
          {profile.vip ? <VipChip /> : null}
        </span>
        {profile.tier || points ? (
          <span className="flex flex-wrap items-center gap-x-1 text-caption font-bold text-[var(--color-ink-subtle)]">
            {profile.tier ? (
              <span className="flex items-center gap-1 whitespace-nowrap">
                {medal ? <Image src={medal} alt="" aria-hidden width={14} height={14} unoptimized className="size-3.5 object-contain" /> : null}
                {profile.tier.name}
                {points ? " ·" : null}
              </span>
            ) : null}
            {points ? (
              <span className="flex items-center gap-1 whitespace-nowrap">
                <Image src={CURRENCY_ICON} alt="" aria-hidden width={14} height={14} unoptimized className="size-3.5" />
                <bdi dir="ltr">{points}</bdi> {pointsUnit(locale, points)}
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
      <span aria-hidden className="block size-3.5 shrink-0 bg-[var(--color-ink-subtle)] [mask-image:url(/brand/icon-chevron-start.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:5px_10px] ltr:-scale-x-100" />
    </Link>
  );
}

/** A section's card: white, radius 16, 24 in, the comp's soft shadow. */
export function AccountCard({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[16px] bg-[var(--color-surface-raised)] p-4 shadow-[0_0_12px_rgba(0,0,0,0.07)] lg:p-6">
      <div className="mb-4 flex items-center justify-between gap-3 lg:mb-6">
        <h2 className="text-heading-m font-bold leading-[1.4] text-[var(--color-ink)] lg:text-heading-l">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** A `?saved=1` / `?error=1` line after a write. */
export function SaveNotice({ state, locale }: { state: "saved" | "error" | null; locale: Locale }) {
  if (!state) return null;

  if (state === "saved") return <AlertBar {...alertProps("details.saved", locale)} animate className="mb-4" />;

  return (
    <p role="status" className="mb-4 rounded-[12px] bg-[var(--color-error-wash)] px-4 py-3 text-[14px] font-semibold text-[var(--color-error)]">
      {messagesFor(locale).account.saveFailed}
    </p>
  );
}

/** A 24px menu glyph painted in the row's colour (white on the active row). */
function Glyph({ src }: { src: string }) {
  return (
    <span
      aria-hidden
      className="block size-6 shrink-0 bg-current [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]"
      style={{ maskImage: `url(${src})`, WebkitMaskImage: `url(${src})` }}
    />
  );
}
