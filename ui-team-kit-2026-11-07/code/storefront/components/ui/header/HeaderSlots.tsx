import Link from "next/link";
import { Suspense } from "react";

import { RewardsChip } from "@/components/loyalty/RewardsChip";
import { AccountMenu } from "@/components/ui/AccountMenu";
import { PhoneNavControl } from "@/components/ui/PhoneNavControl";
import { GUEST_VIEWER, headerViewer, type HeaderViewer } from "@/lib/account/header-viewer";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { rewardsLinks } from "@/lib/loyalty/links";

/**
 * THE HEADER'S PERSONAL PARTS (ADR 0046 §2) — each its own Suspense boundary,
 * so the header around them is the shared shell and only these wait for the
 * visitor. All three read the ONE `headerViewer(locale)` (React `cache`: one
 * read per request, however many slots ask).
 *
 * NO FALLBACK SAYS ANYTHING ABOUT THE VISITOR. The phone's drawer button is
 * the same 24px icon for everyone, so its fallback is the guest's. The
 * desktop account trigger and the rewards chip read differently for a guest
 * and a member — a member must never be shown «القائمة و تسجيل الدخول» while
 * their own header streams in — so their fallbacks are text-free boxes the
 * size of a MEMBER's control (measured on the production build, 360 and
 * 1280 px, both languages), and only the box is in the shared shell.
 *
 * Nothing personal renders in a fallback: `GUEST_VIEWER` is a constant.
 */

/** The phone's menu / back control — personal (the drawer greets the customer). */
export function PhoneAccountSlot({ locale }: { locale: Locale }) {
  return (
    <Suspense fallback={<PhoneAccount locale={locale} viewer={GUEST_VIEWER(locale)} />}>
      <PhoneAccountForVisitor locale={locale} />
    </Suspense>
  );
}

export async function PhoneAccountForVisitor({ locale }: { locale: Locale }) {
  return <PhoneAccount locale={locale} viewer={await headerViewer(locale)} />;
}

export function PhoneAccount({ locale, viewer }: { locale: Locale; viewer: HeaderViewer }) {
  return (
    <PhoneNavControl
      locale={locale}
      signedIn={viewer.signedIn}
      customerName={viewer.customerName}
      customerAvatar={viewer.customerAvatar}
      pointsBalance={viewer.pointsBalance}
      avatarFrame={viewer.avatarFrame}
      vipEnabled={viewer.vipEnabled}
    />
  );
}

/**
 * The desktop account menu (`6627:13305`). It is passed display facts only —
 * the name, the frame, the level and the formatted points — never the
 * session; its tile counts are its own client fetch once opened.
 */
export function AccountMenuSlot({ locale }: { locale: Locale }) {
  return (
    <Suspense fallback={<AccountMenuFallback locale={locale} />}>
      <AccountMenuForVisitor locale={locale} />
    </Suspense>
  );
}

export async function AccountMenuForVisitor({ locale }: { locale: Locale }) {
  return <AccountMenuFor locale={locale} viewer={await headerViewer(locale)} />;
}

export function AccountMenuFor({ locale, viewer }: { locale: Locale; viewer: HeaderViewer }) {
  return (
    <AccountMenu
      locale={locale}
      signedIn={viewer.signedIn}
      customerName={viewer.customerName ?? undefined}
      customerAvatar={viewer.customerAvatar}
      avatarFrame={viewer.avatarFrame}
      tierName={viewer.tierName}
      points={viewer.menuPoints}
    />
  );
}

/**
 * A member trigger's measured box — «اهلا احمد» with its 40px avatar:
 * 152.3×40 in Arabic, 160×40 in English (production build, 1280 px). Empty
 * of text, so it is true for a guest and a member alike. With JavaScript off
 * the stream never swaps it, so it carries the one link that is right for
 * both: «حسابي» — the account pages send a guest on to sign-in.
 */
const ACCOUNT_MENU_BOX: Record<Locale, string> = { ar: "h-10 w-[152.3px]", en: "h-10 w-[160px]" };

export function AccountMenuFallback({ locale }: { locale: Locale }) {
  return (
    <div data-cq-fallback="account-menu" className={`${ACCOUNT_MENU_BOX[locale]} flex shrink-0 items-center`}>
      <noscript>
        <Link href={`/${locale}/account`} className="text-heading-m font-normal text-[var(--color-ink)]">
          {messagesFor(locale).account.title}
        </Link>
      </noscript>
    </div>
  );
}

type ChipVariant = "compact" | "desktop";

/**
 * The rewards chip (ADR 0043): `compact` in the phone row (its panel the
 * bottom sheet), `desktop` in row one (the dropdown). The desktop one's
 * `hidden lg:block` wrapper is drawn by the fallback and the chip alike, and
 * not at all when there is no chip — an empty wrapper would add a gap to
 * the row.
 */
export function RewardsChipSlot({ locale, variant }: { locale: Locale; variant: ChipVariant }) {
  return (
    <Suspense fallback={<RewardsChipFallback variant={variant} />}>
      <RewardsChipForVisitor locale={locale} variant={variant} />
    </Suspense>
  );
}

export async function RewardsChipForVisitor({ locale, variant }: { locale: Locale; variant: ChipVariant }) {
  return <RewardsChipFor locale={locale} variant={variant} viewer={await headerViewer(locale)} />;
}

export function RewardsChipFor({ locale, variant, viewer }: { locale: Locale; variant: ChipVariant; viewer: HeaderViewer }) {
  // A member whose wallet could not be read gets NO chip — not the guest pitch.
  if (!viewer.rewards) return null;
  const chip = <RewardsChip locale={locale} currency={viewer.currency} now={viewer.now} viewer={viewer.rewards} variant={variant} links={rewardsLinks(locale)} />;
  return variant === "desktop" ? <div className="hidden shrink-0 lg:block">{chip}</div> : chip;
}

/**
 * A member chip's measured box, so nothing beside it moves when the
 * visitor's chip lands: 97.5×36 compact and 155.5×50.5 desktop, the same in
 * Arabic and English (production build, 360 and 1280 px, a seven-digit
 * balance — «1,800,000»). A guest's chip is narrower (65.7 / 74.7 compact,
 * 165.4 / 192.7 desktop) and a shorter balance is too; the box is the
 * member's because the member is who the shell must not jump for. On a
 * buy-bar page below `lg` the chip is its 32px coin, and globals.css sizes
 * this box to match.
 */
export function RewardsChipFallback({ variant }: { variant: ChipVariant }) {
  return variant === "desktop" ? (
    <div className="hidden shrink-0 lg:block">
      <div aria-hidden data-cq-fallback="rewards-chip" className="h-[50.5px] w-[155.5px]" />
    </div>
  ) : (
    <div aria-hidden data-cq-fallback="rewards-chip" className="h-9 w-[97.5px] shrink-0" />
  );
}
