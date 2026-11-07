import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { FaqList } from "@/components/content/FaqList";
import { ruleIcon } from "@/components/loyalty/art";
import { rewardLabel, ruleIsLive } from "@/components/loyalty/copy";
import { rateRange } from "@/components/loyalty/panel/GuestView";
import { Coin, Glyph, TierMark } from "@/components/loyalty/parts";
import { JsonLd } from "@/components/seo/JsonLd";
import { currencyForVisitor } from "@/lib/currency/visitor";
import { queueSelfPurge } from "@/lib/edge/purge";
import { EDGE_REWARDS_TAG } from "@/lib/edge/tags";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { fill, formatAmount, formatPts } from "@/lib/loyalty/format";
import { trimFactor } from "@/lib/loyalty/map";
import { loyaltyProgram } from "@/lib/loyalty/program";
import type { LoyaltyProgram } from "@/lib/loyalty/types";
import { pageMetadata } from "@/lib/seo/metadata";
import { breadcrumbNode, faqPageNode, graph } from "@/lib/seo/schema";
import { absoluteUrl } from "@/lib/seo/site";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  if (!isLocale(locale)) return {};
  const t = messagesFor(locale).loyalty.rewardsPage;
  return pageMetadata({ locale, path: "/rewards", title: t.metaTitle, description: t.metaDescription });
}

/**
 * «نقاط تشارجر» — the PUBLIC programme page (ADR 0043 §9): what Charger
 * Points and Charger Balance are, the ways to earn, the levels, the perks
 * (only while `features.perks` is on) and the FAQ — the guest panel's content
 * as an indexable page, in both languages, with FAQPage and BreadcrumbList
 * structured data built from the same rows the page draws.
 *
 * Everything comes from `GET /loyalty/program` (a shared read, tag
 * `loyalty`, fetched with no-store), so an admin edit or a campaign boundary rebuilds it. Nothing
 * here reads an account: the one thing of the visitor's is their currency,
 * which the level thresholds are stated in, read inside the programme's own
 * boundary (below). A section whose feature is off is not drawn, never
 * «قريباً». No comp exists for this page: it is built from the panel's own
 * design-system pieces.
 *
 * A programme that cannot be read DEGRADES (HANDBOOK §8, optional data): the
 * page is in the sitemap, so it still answers 200 with its static
 * explanation — the heading, the intro, what Charger Points are — and every
 * section the programme drives (figures, ways to earn, levels, perks, the
 * balance card, FAQ) is simply not drawn. The one per-request read is the
 * visitor's currency (v0.1.107): the level thresholds are stated in it, as
 * every other price on the site is — the programme itself is still the
 * shared, tagged read for that currency. A failure is re-asked after a
 * second (`SHELL_FAILURE_LIFE`), so a later render asks again.
 *
 * SHARED, THEN PERSONAL (ADR 0046 §2): the breadcrumb and the heading are
 * the same for every visitor; everything the programme drives is read in the
 * visitor's currency inside its own boundary (`VisitorProgramme`). Its
 * fallback is the degraded page — the static explanation, no figure — never
 * thresholds in a currency the visitor did not choose.
 */
export default async function RewardsPage(props: Props) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const m = messagesFor(locale);
  const t = m.loyalty.rewardsPage;

  return (
    <main className="mx-auto w-full max-w-[1248px] flex-1 px-4 pb-12 pt-6 sm:px-6 lg:pt-[70px]">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <nav aria-label={t.breadcrumb} className="text-caption font-semibold text-[var(--color-ink-subtle)]">
          <Link href={`/${locale}`} className="hover:text-[var(--color-brand-500)]">
            {m.common.storeName}
          </Link>
          <span aria-hidden className="mx-1.5">
            /
          </span>
          <span aria-current="page">{t.heading}</span>
        </nav>

        <header className="flex flex-col items-center gap-3 rounded-[16px] bg-[image:var(--gradient-brand)] px-5 py-8 text-center text-[var(--color-on-primary)]">
          <span className="grid size-20 place-items-center rounded-full bg-[var(--color-footer-rule)]">
            <Coin size={52} />
          </span>
          <h1 className="text-display font-extrabold leading-[1.3] lg:text-[32px]">{t.heading}</h1>
          <p className="max-w-xl text-body-s font-medium leading-[1.6] opacity-95 lg:text-body-l">{t.intro}</p>
          <div className="flex flex-wrap justify-center gap-2.5">
            <Link href={`/${locale}/account/sign-up`} className="flex h-12 items-center rounded-[12px] bg-[var(--color-surface-raised)] px-6 text-body-m font-bold text-[var(--color-brand-500)]">
              {m.loyalty.guest.join}
            </Link>
            <Link href={`/${locale}/account/points`} className="flex h-12 items-center rounded-[12px] px-6 text-body-m font-bold shadow-[inset_0_0_0_1px_var(--color-on-primary)]">
              {t.openWallet}
            </Link>
          </div>
        </header>

        <Suspense fallback={<ProgrammeContent locale={locale} program={null} />}>
          <VisitorProgramme locale={locale} />
        </Suspense>
      </div>
    </main>
  );
}

/**
 * A copy drawn without the programme would show every visitor in its
 * currency the static explanation for an hour: it purges itself after about
 * a minute instead (ADR 0052 plan §5.5). Off a copy it costs one refill.
 */
function degradedRewardsCopy(): void {
  queueSelfPurge(EDGE_REWARDS_TAG);
}

/**
 * The programme in the visitor's currency (on the edge's shared copy, the
 * copy's), and the page's structured data (its FAQ node is the programme's).
 */
async function VisitorProgramme({ locale }: { locale: Locale }) {
  const program = await loyaltyProgram(locale, await currencyForVisitor(), degradedRewardsCopy);

  const m = messagesFor(locale);
  const url = absoluteUrl(`/${locale}/rewards`);
  const jsonLd = graph([
    breadcrumbNode(url, [
      { name: m.common.storeName, url: absoluteUrl(`/${locale}`) },
      { name: m.loyalty.rewardsPage.heading, url },
    ]),
    program ? faqPageNode(url, program.faq) : null,
  ]);

  return (
    <>
      <JsonLd data={jsonLd} />
      <ProgrammeContent locale={locale} program={program} />
    </>
  );
}

/** What Charger Points and Balance are, then every section the programme drives — none when it is null. */
function ProgrammeContent({ locale, program }: { locale: Locale; program: LoyaltyProgram | null }) {
  const m = messagesFor(locale);
  const t = m.loyalty.rewardsPage;

  return (
    <>
      <section aria-labelledby="buckets" className="flex flex-col gap-3">
        <h2 id="buckets" className="text-heading-m font-bold lg:text-heading-l">
          {t.bucketsTitle}
        </h2>
        <div className={`grid gap-3 ${program?.features.topup ? "sm:grid-cols-2" : ""}`}>
          <article className="flex flex-col gap-2 rounded-[16px] border border-[var(--color-brand-500)] bg-[var(--color-brand-50)] p-4">
            <h3 className="flex items-center gap-2 text-body-l font-bold">
              <Coin size={28} />
              {m.loyalty.pointsTitle}
            </h3>
            <p className="text-body-s leading-[1.6] text-[var(--color-ink-muted)]">{t.pointsWhat}</p>
            {program ? (
              <ul className="flex flex-wrap gap-1.5 text-caption font-semibold text-[var(--color-ink-muted)]">
                <li className="rounded-full bg-[var(--color-surface-raised)] px-2.5 py-1">{fill(m.loyalty.peg, { pts: formatPts(locale, program.pointsPerUsd) })}</li>
                <li className="rounded-full bg-[var(--color-surface-raised)] px-2.5 py-1">{fill(m.loyalty.wallet.ptsMin, { pts: formatPts(locale, program.minRedeem) })}</li>
                <li className="rounded-full bg-[var(--color-surface-raised)] px-2.5 py-1">{fill(m.loyalty.wallet.ptsCap, { pct: program.maxSharePct })}</li>
              </ul>
            ) : null}
          </article>
          {program?.features.topup ? (
            <article className="flex flex-col gap-2 rounded-[16px] bg-[var(--color-surface-raised)] p-4 shadow-[0_0_12px_rgba(0,0,0,0.07)]">
              <h3 className="flex items-center gap-2 text-body-l font-bold">
                <Glyph src="/brand/icon-wallet.svg" tone="bg-[var(--color-ink)]" className="size-6" />
                {m.loyalty.balanceTitle}
              </h3>
              <p className="text-body-s leading-[1.6] text-[var(--color-ink-muted)]">{t.balanceWhat}</p>
              <ul className="flex flex-wrap gap-1.5 text-caption font-semibold text-[var(--color-ink-muted)]">
                {[m.loyalty.wallet.balNever, m.loyalty.wallet.balCovers, m.loyalty.wallet.balNoCash].map((text) => (
                  <li key={text} className="rounded-full bg-[var(--color-chip)] px-2.5 py-1">
                    {text}
                  </li>
                ))}
              </ul>
            </article>
          ) : null}
        </div>
      </section>

      {program ? <ProgramSections locale={locale} program={program} /> : null}
    </>
  );
}

/** Everything `GET /loyalty/program` drives — drawn only when it answered. */
function ProgramSections({ locale, program }: { locale: Locale; program: LoyaltyProgram }) {
  const m = messagesFor(locale);
  const t = m.loyalty.rewardsPage;
  const { minRate, maxRate } = rateRange(program.tiers.map((tier) => tier.rate));
  const ways = program.rules.filter((rule) => ruleIsLive(rule, program.features) && rule.state !== "campaign");
  const perks = program.features.perks ? program.perks : [];

  return (
    <>
      {minRate || ways.length > 0 ? (
        <section aria-labelledby="ways" className="flex flex-col gap-3">
          <h2 id="ways" className="text-heading-m font-bold lg:text-heading-l">
            {m.loyalty.guest.ways}
          </h2>
          <ul className="flex flex-col rounded-[16px] bg-[var(--color-surface-raised)] px-4 shadow-[0_0_12px_rgba(0,0,0,0.07)]">
            {minRate && maxRate ? (
              <WayRow icon={ruleIcon("purchase")} name={m.loyalty.guest.purchase} value={minRate === maxRate ? fill(m.loyalty.reward.rate, { rate: minRate }) : fill(m.loyalty.reward.rateRange, { min: minRate, max: maxRate })} />
            ) : null}
            {ways.map((rule) => (
              <WayRow key={rule.code} icon={ruleIcon(rule.code)} name={rule.name} value={rewardLabel(m, locale, rule.reward)} note={rule.afterFirstOrder ? m.loyalty.home.lockedSub : null} />
            ))}
          </ul>
          <p className="text-caption leading-[1.6] text-[var(--color-ink-subtle)]">{fill(m.loyalty.earn.rule, { hours: program.pendingHoldHours })}</p>
        </section>
      ) : null}

      {program.tiers.length > 0 ? (
        <section aria-labelledby="levels" className="flex flex-col gap-3">
          <h2 id="levels" className="text-heading-m font-bold lg:text-heading-l">
            {m.loyalty.panel.views.levels}
          </h2>
          <ol className="grid gap-3 sm:grid-cols-2">
            {program.tiers.map((tier) => (
              <li key={tier.code} className="flex gap-3 rounded-[16px] bg-[var(--color-surface-raised)] p-4 shadow-[0_0_12px_rgba(0,0,0,0.07)]">
                <TierMark code={tier.code} size={48} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h3 className="text-body-l font-bold">{fill(m.loyalty.levels.name, { tier: tier.name, level: tier.level })}</h3>
                  <p className="text-caption font-semibold text-[var(--color-ink-muted)]">
                    {fill(m.loyalty.levels.meta, { amount: formatAmount(locale, tier.minSpend), rate: tier.rate })}
                  </p>
                  {tier.benefits.length > 0 ? (
                    <ul className="mt-1 flex flex-col gap-1">
                      {tier.benefits.map((benefit) => (
                        <li key={benefit} className="flex items-center gap-1.5 text-caption font-medium text-[var(--color-ink-muted)]">
                          <Glyph src="/brand/icon-check.svg" tone="bg-[var(--color-success)]" className="size-3.5" />
                          {benefit}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          <p className="text-caption leading-[1.6] text-[var(--color-ink-subtle)]">{fill(m.loyalty.levels.rollingNote, { days: program.graceDays })}</p>
        </section>
      ) : null}

      {perks.length > 0 ? (
        <section aria-labelledby="perks" className="flex flex-col gap-3">
          <h2 id="perks" className="text-heading-m font-bold lg:text-heading-l">
            {m.loyalty.redeem.perksTitle}
          </h2>
          <ul className="flex flex-col rounded-[16px] bg-[var(--color-surface-raised)] px-4 shadow-[0_0_12px_rgba(0,0,0,0.07)]">
            {perks.map((perk) => (
              <WayRow key={perk.code} icon="/brand/icon-nav-discount.svg" name={perk.name} value={fill(m.loyalty.ptsAmount, { pts: formatPts(locale, perk.pricePts) })} note={perk.description || null} />
            ))}
          </ul>
        </section>
      ) : null}

      {program.topUp ? (
        <p className="rounded-[16px] bg-[var(--color-success-wash)] p-4 text-body-s font-semibold leading-[1.6]">{fill(t.topUpNote, { pct: trimFactor(program.topUp.bonusPct) })}</p>
      ) : null}

      {program.faq.length > 0 ? (
        <section aria-labelledby="faq" className="flex flex-col gap-3">
          <h2 id="faq" className="text-heading-m font-bold lg:text-heading-l">
            {m.loyalty.panel.faq}
          </h2>
          <FaqList entries={program.faq} labels={{ search: m.faq.search, noMatch: m.faq.noMatch }} />
        </section>
      ) : null}
    </>
  );
}

function WayRow({ icon, name, value, note = null }: { icon: string; name: string; value: string; note?: string | null }) {
  return (
    <li className="flex items-center gap-3 border-t border-[var(--color-line)] py-3 first:border-t-0">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--color-brand-wash)]">
        <Glyph src={icon} tone="bg-[var(--color-brand-500)]" className="size-[18px]" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body-s font-semibold lg:text-body-m">{name}</span>
        {note ? <span className="text-caption-xs font-medium text-[var(--color-ink-subtle)]">{note}</span> : null}
      </span>
      <b dir="ltr" className="shrink-0 text-body-s text-[var(--color-brand-500)]">
        {value}
      </b>
    </li>
  );
}
