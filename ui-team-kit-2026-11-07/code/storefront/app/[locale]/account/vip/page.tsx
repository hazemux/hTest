import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AccountShell, vipEnabled } from "@/components/account/AccountShell";
import { factorText } from "@/components/loyalty/vip/VipChip";
import { VipMembership, type VipBenefitRow } from "@/components/loyalty/vip/VipMembership";
import { requireCustomer } from "@/lib/account/guard";
import { visitorAccount } from "@/lib/account/visitor-account";
import { ApiError, getMyVip } from "@/lib/api/client";
import { SHELL_CURRENCY } from "@/lib/catalog/shell";
import { READ_DEADLINE_MS } from "@/lib/api/deadlines";
import { currencyForVisitor } from "@/lib/currency/visitor";
import { isLocale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { fill } from "@/lib/loyalty/format";
import { mapVipMembership, mapWallet } from "@/lib/loyalty/map";
import { loyaltyProgram } from "@/lib/loyalty/program";
import type { Messages } from "@/lib/i18n/messages";
import type { VipProgram } from "@/lib/loyalty/types";
import { setVipRenewal, subscribeVip } from "@/lib/loyalty/vip-actions";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  return isLocale(locale) ? { title: messagesFor(locale).account.vipTitle } : {};
}

/**
 * «عضوية VIP» (ADR 0044) — paid monthly from Charger Balance: the benefits,
 * the price in the visitor's currency (the server's figure — HANDBOOK §1),
 * a one-tap subscription when the balance covers it (else the way to top
 * up), and the status card with the period end and the renewal switch.
 *
 * A 404 while the programme's `features.vip` is off, or while `GET /me/vip`
 * says so: never «قريباً». Private: every read is `no-store`, and the route
 * is noindex with the rest of `/account` (`next.config.ts`).
 */
export default async function VipPage(props: Props) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();
  // VIP OFF IS A REAL 404, so it is decided in the shell, before anything
  // per request: with Cache Components a `notFound()` after the request's
  // first read streams as a 200 (Next's not-found.md, "Status codes";
  // `instant = false` does not change it). The switch is the programme's,
  // the same in every currency, from the shared tagged read in the shell's
  // currency — a `loyalty` revalidation re-decides it. A failed read is
  // never kept (`sharedRead`), so it falls through to the per-request check
  // below rather than baking a 404 into the shell.
  if ((await loyaltyProgram(locale, SHELL_CURRENCY))?.features.vip === false) notFound();

  // Per request from here: this page is somebody's account.
  await connection();
  const m = messagesFor(locale);
  const here = `/${locale}/account/vip`;
  const { token } = await requireCustomer(locale, here);
  if (!(await vipEnabled(locale))) notFound();

  const currency = await currencyForVisitor();
  const [answer, program, account] = await Promise.all([
    getMyVip({ currency }, { locale, bearerToken: token, deadlineMs: READ_DEADLINE_MS }).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) notFound();
      return null;
    }),
    loyaltyProgram(locale, currency),
    // Who is here — the SAME call the layout made, deduped (HANDBOOK §8):
    // the name, the character, the tier for the frame, two-step on or off.
    visitorAccount(locale, token, currency),
  ]);
  const customer = account.customer;
  const wallet = customer && account.wallet ? mapWallet(account.wallet, locale, customer.name) : null;

  const vip = program?.vip ?? null;

  return (
    <AccountShell locale={locale} active="vip">
      <div className="flex flex-col gap-4">
        <h2 className="text-body-l font-semibold leading-[1.5] text-[var(--color-ink)] lg:text-heading-l lg:font-bold">{m.account.vipTitle}</h2>
        {answer && vip ? (
          <VipMembership
            locale={locale}
            state={mapVipMembership(answer.data)}
            who={customer ? { name: customer.name?.trim() || null, avatar: customer.avatar?.url ?? null, tier: wallet?.tier ? { code: wallet.tier.code, name: wallet.tier.name } : null } : undefined}
            twoFactor={customer?.two_factor_enabled === true}
            benefits={benefitRows(m, vip, wallet?.tier?.name ?? null)}
            shopHref={`/${locale}`}
            noticeDays={vip.noticeDays}
            topUpHref={program?.features.topup ? `/${locale}/account/points/top-up` : null}
            verifyHref={`/${locale}/account/verify?next=${encodeURIComponent(here)}`}
            subscribe={subscribeVip}
            setRenewal={setVipRenewal}
          />
        ) : (
          <p role="status" className="rounded-[16px] bg-[var(--color-chip)] p-6 text-center text-body-s font-semibold text-[var(--color-ink-muted)]">
            {m.account.sectionUnavailable}
          </p>
        )}
      </div>
    </AccountShell>
  );
}

/**
 * The benefit rows, in the server's order (`GET /loyalty/program`'s
 * `vip.benefits` — a code this build has no words for is already dropped),
 * with the multiplier the server stated and the customer's tier name.
 */
function benefitRows(m: Messages, vip: VipProgram, tier: string | null): VipBenefitRow[] {
  const rows = m.loyalty.vip.page.benefitRows;
  const factor = factorText(vip.multiplier);
  return vip.benefits.map((code) => ({
    code,
    title: fill(rows[code].title, { factor }),
    sub: code === "cashback_multiplier" && !tier ? m.loyalty.vip.page.cashbackSubNoTier : fill(rows[code].sub, { tier: tier ?? "" }),
  }));
}
