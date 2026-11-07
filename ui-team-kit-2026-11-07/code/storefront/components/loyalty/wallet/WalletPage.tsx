import { AccountShell } from "@/components/account/AccountShell";
import { StepUpPrompt } from "@/components/account/StepUpPrompt";
import { getStepUp, getWallet, getWalletTopUp, listWalletTransactions } from "@/lib/api/client";
import { requireCustomer } from "@/lib/account/guard";
import { READ_DEADLINE_MS } from "@/lib/api/deadlines";
import type { ProofOutcome } from "@/lib/checkout/transfer-proof";
import { currencyForVisitor } from "@/lib/currency/visitor";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { cancelTopUp, createTopUp } from "@/lib/loyalty/actions";
import { mapBalancePage, mapPointsPage, mapTopUp, mapWallet } from "@/lib/loyalty/map";
import { loyaltyProgram } from "@/lib/loyalty/program";
import { isTopUpError } from "@/lib/loyalty/topup";
import type { PointsHistoryKind, TopUpView } from "@/lib/loyalty/types";

import { WalletHub, type WalletTab } from "../WalletHub";
import { TopUpForm } from "./TopUpForm";
import { TopUpResult, topUpOutcome } from "./TopUpResult";
import { TopUpTransfer } from "./TopUpTransfer";
import { POINTS_STATUS_FILTERS } from "./WalletHistory";

export type WalletSearch = {
  tab?: string;
  bucket?: string;
  status?: string;
  cursor?: string;
  id?: string;
  proof?: string;
  error?: string;
  currency?: string;
};

const PROOF_OUTCOMES: readonly ProofOutcome[] = ["sent", "missing", "too_large", "rejected", "closed", "details", "failed"];
const MAX_PROOF_BYTES = Number(process.env.BANK_TRANSFER_PROOF_MAX_BYTES ?? 10 * 1024 * 1024);

/** A cursor is opaque — passed back only if it looks like one (no spaces, bounded). */
function cursorOf(value: string | undefined): string | undefined {
  return value && /^[A-Za-z0-9_\-=.]{1,512}$/.test(value) ? value : undefined;
}

/** Today somewhere on Earth (UTC+14) — the API's own bound for a transfer date. */
function latestToday(): string {
  return new Date(new Date().getTime() + 14 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * «المحفظة والنقاط» — `/account/points` (overview, history) and
 * `/account/points/top-up` (the bank-transfer top-up), ONE server component
 * so both URLs draw the same hub. Every state is in the URL (`?tab=`,
 * `?bucket=`, `?status=`, `?cursor=`, `?id=`), so Back/Forward and a browser
 * without JavaScript reach each one; every read is `no-store` and the routes
 * are private (`next.config.ts`: noindex, `Referrer-Policy: same-origin`).
 */
export async function WalletPage({ locale, tab, search }: { locale: Locale; tab: WalletTab; search: WalletSearch }) {
  const m = messagesFor(locale);
  const base = `/${locale}/account/points`;
  const here = tab === "topup" ? `${base}/top-up` : base;
  const { token, customer } = await requireCustomer(locale, here);

  // «التأكيد الثنائي» guards opening the wallet (unchanged): with it on, this
  // page waits for this session's code. Spending is what the API refuses.
  if (customer.two_factor_enabled) {
    const stepUp = await getStepUp({ locale, bearerToken: token }).catch(() => null);
    if (!stepUp?.verified_until) {
      return (
        <AccountShell locale={locale} active="points">
          <StepUpPrompt locale={locale} title={m.loyalty.wallet.title} next={here} />
        </AccountShell>
      );
    }
  }

  const currency = await currencyForVisitor();
  const bucket = search.bucket === "balance" ? "balance" : "points";
  const status = bucket === "points" && (POINTS_STATUS_FILTERS as readonly string[]).includes(search.status ?? "") ? (search.status as PointsHistoryKind) : null;
  const cursor = cursorOf(search.cursor);
  const topUpId = tab === "topup" && search.id && /^TU-[A-Z0-9-]{1,40}$/.test(search.id) ? search.id : null;
  const personal = { locale, bearerToken: token, deadlineMs: READ_DEADLINE_MS };

  // Independent reads go out together (HANDBOOK §8); the wallet's arguments
  // match the layout's, so the header and this page share one read.
  const [walletAnswer, program, historyAnswer, topUpAnswer] = await Promise.all([
    getWallet({ locale, bearerToken: token, deadlineMs: 3000 }, { currency }).catch(() => null),
    loyaltyProgram(locale, currency),
    tab === "history"
      ? listWalletTransactions({ bucket, currency, per_page: 25, ...(status ? { status } : {}), ...(cursor ? { cursor } : {}) }, personal).catch(() => null)
      : Promise.resolve(null),
    topUpId ? getWalletTopUp(topUpId, personal).then((answer) => mapTopUp(answer.data)).catch(() => null) : Promise.resolve(null),
  ]);

  const wallet = walletAnswer ? mapWallet(walletAnswer, locale, customer.name) : null;
  if (!wallet || !program) {
    return (
      <AccountShell locale={locale} active="points">
        <p role="status" className="rounded-[16px] bg-[var(--color-chip)] p-6 text-center text-body-s font-semibold text-[var(--color-ink-muted)]">
          {m.account.sectionUnavailable}
        </p>
      </AccountShell>
    );
  }

  const historyHref = (state: { bucket: "points" | "balance"; status?: PointsHistoryKind | null; cursor?: string | null }) => {
    const query = new URLSearchParams({ tab: "history", bucket: state.bucket });
    if (state.status) query.set("status", state.status);
    if (state.cursor) query.set("cursor", state.cursor);
    return `${base}?${query.toString()}`;
  };

  const topUpPage = `${base}/top-up`;
  const topUpLive = program.features.topup && program.topUp !== null && program.topUp.currencies.length > 0;
  let topUp: React.ReactNode = null;
  // A top-up already asked for opens even while top-up is switched off: the
  // customer may have sent the money already, and still owes us the receipt
  // (the API keeps serving it; only asking for a NEW one is refused).
  if (topUpId) {
    topUp = <TopUpStep locale={locale} topUp={topUpAnswer} search={search} pendingHoldHours={program.pendingHoldHours} topUpPage={topUpPage} walletPage={base} />;
  } else if (topUpLive && program.topUp) {
    topUp = (
      <TopUpForm
        locale={locale}
        options={program.topUp.currencies}
        initialCurrency={program.topUp.currencies.some((entry) => entry.currency === search.currency) ? (search.currency as string) : currency}
        bonusPct={program.topUp.bonusPct}
        pendingHoldHours={program.pendingHoldHours}
        action={createTopUp}
        error={isTopUpError(search.error) ? search.error : null}
        currencyBaseHref={topUpPage}
      />
    );
  }

  return (
    <AccountShell locale={locale} active="points">
      <WalletHub
        locale={locale}
        program={program}
        wallet={wallet}
        now={new Date().toISOString()}
        tab={tab}
        tabHrefs={{ overview: base, history: `${base}?tab=history`, topup: topUpPage }}
        history={tab === "history" ? { bucket, status, page: historyAnswer ? (bucket === "points" ? mapPointsPage(historyAnswer) : mapBalancePage(historyAnswer)) : null, href: historyHref } : null}
        topUp={topUp}
        links={{ checkout: `/${locale}/cart`, invite: null }}
      />
    </AccountShell>
  );
}

/** A created top-up: its transfer step, or where it stands. Not found is said, with the way to start again. */
function TopUpStep({
  locale,
  topUp,
  search,
  pendingHoldHours,
  topUpPage,
  walletPage,
}: {
  locale: Locale;
  topUp: TopUpView | null;
  search: WalletSearch;
  pendingHoldHours: number;
  topUpPage: string;
  walletPage: string;
}) {
  const t = messagesFor(locale).loyalty.wallet.topup;
  if (!topUp) {
    return (
      <section role="alert" className="flex flex-col items-center gap-3 rounded-[16px] bg-[var(--color-surface-raised)] p-6 text-center shadow-[0_0_12px_rgba(0,0,0,0.07)]">
        <p className="text-body-s font-semibold text-[var(--color-ink-muted)]">{t.notFound}</p>
        <a href={topUpPage} className="text-body-s font-bold text-[var(--color-brand-500)]">
          {t.startAgain}
        </a>
      </section>
    );
  }

  const proof = PROOF_OUTCOMES.includes(search.proof as ProofOutcome) ? (search.proof as ProofOutcome) : null;
  const outcome = topUpOutcome(topUp.status);
  const self = `${topUpPage}?id=${encodeURIComponent(topUp.publicId)}`;
  const transfer = (
    <TopUpTransfer locale={locale} topUp={topUp} outcome={proof} maxBytes={MAX_PROOF_BYTES} today={latestToday()} cancelAction={cancelTopUp} pendingHoldHours={pendingHoldHours} />
  );

  return (
    <div className="flex flex-col gap-4">
      {search.error === "cancel_failed" ? (
        <p role="alert" className="rounded-[12px] bg-[var(--color-error-wash)] px-3.5 py-2.5 text-body-s font-semibold text-[var(--color-danger)]">
          {t.errors.cancel_failed}
        </p>
      ) : null}
      {outcome === null ? (
        transfer
      ) : (
        <>
          <TopUpResult
            locale={locale}
            topUp={topUp}
            pendingHoldHours={pendingHoldHours}
            ctaHref={outcome === "review" ? walletPage : outcome === "success" ? `/${locale}` : topUp.acceptsReceipt ? null : topUpPage}
            refreshHref={outcome === "review" ? self : null}
          />
          {/* A rejected receipt may be sent again for THE SAME top-up. */}
          {outcome === "failed" && topUp.acceptsReceipt ? transfer : null}
        </>
      )}
    </div>
  );
}
