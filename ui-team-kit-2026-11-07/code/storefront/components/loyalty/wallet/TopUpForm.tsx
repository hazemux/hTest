"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { SubmitButton } from "@/components/ui/SubmitButton";
import { currencySign } from "@/lib/currency/signs";
import type { Locale } from "@/lib/i18n/locales";
import { formatMoney, messagesFor } from "@/lib/i18n/messages";
import { compareDecimal, fill, formatAmount, parseTypedAmount } from "@/lib/loyalty/format";
import { currencyDigits, topUpChoice, type TopUpError } from "@/lib/loyalty/topup";
import { trimFactor } from "@/lib/loyalty/map";
import type { TopUpCurrency } from "@/lib/loyalty/types";

import { Coin } from "../parts";

/**
 * STEP ONE of «شحن الرصيد» by bank transfer (Claude Design `WalletHub`
 * top-up; ADR 0043 decision 4): pick or type an amount. Posting it CREATES the
 * top-up (`POST /wallet/topups`, `createTopUp`), and only then do our bank
 * account (a snapshot taken for this top-up) and its reference exist — step
 * two, on the same page with `?id=`, shows them and takes the receipt.
 *
 * A PLAIN FORM that works before any script: the presets are radios named
 * `amount` (one checked in the server's HTML), the typed amount is
 * `custom_amount`. With the script, the summary and the button say exactly
 * the amount that will be posted, and an amount that is not a valid figure
 * locks the button — it is never swapped for a preset. The Server Action
 * applies the same rule (`topUpChoice`), so without the script the post is
 * refused the same way. The limits shown are the server's; it re-checks them.
 */
export function TopUpForm({
  locale,
  options,
  initialCurrency,
  bonusPct,
  pendingHoldHours,
  action,
  error,
  currencyBaseHref,
}: {
  locale: Locale;
  /** Every currency a top-up may be asked in, with its presets and limits — the server's. */
  options: TopUpCurrency[];
  initialCurrency: string;
  /** % of the received amount paid as bonus points — the programme's own string. */
  bonusPct: string;
  pendingHoldHours: number;
  action: (form: FormData) => Promise<void>;
  error: TopUpError | null;
  /**
   * This page's path; the currency switch links to `?currency=XXX` on it (a
   * link, not a script). A string, not a function: this is a Client
   * Component, and a server page cannot hand it a function.
   */
  currencyBaseHref: string;
}) {
  const m = messagesFor(locale);
  const t = m.loyalty.wallet.topup;
  const rules = options.find((option) => option.currency === initialCurrency) ?? options[0];
  const [preset, setPreset] = useState(rules && rules.presets.length > 1 ? 1 : 0);
  const [custom, setCustom] = useState("");
  const amountId = useId();
  const limitId = useId();

  if (!rules) return null;

  const digits = currencyDigits(rules.currency);
  const choice = topUpChoice({ typed: custom, preset: rules.presets[preset] ?? "", presets: rules.presets, digits, parse: parseTypedAmount });
  const amount = "amount" in choice ? choice.amount : null;
  const inCurrency = (value: string) => formatMoney(locale, value, rules.currency);

  const invalid = custom.trim() !== "" && amount === null;
  const under = amount !== null && compareDecimal(amount, rules.min.amount) < 0;
  const over = amount !== null && compareDecimal(amount, rules.max.amount) > 0;
  const blocked = amount === null || under || over;
  const limitLine = invalid
    ? t.invalidAmount
    : under
      ? fill(t.limitUnder, { amount: formatAmount(locale, rules.min) })
      : over
        ? fill(t.limitOver, { amount: formatAmount(locale, rules.max) })
        : fill(t.limitRange, { min: formatAmount(locale, rules.min), max: formatAmount(locale, rules.max) });

  return (
    <form action={action} className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="currency" value={rules.currency} />

      <section className="flex flex-col gap-4 rounded-[16px] border border-[var(--color-brand-500)] bg-[var(--color-brand-50)] p-5">
        {error ? (
          <p role="alert" className="rounded-[12px] bg-[var(--color-error-wash)] px-3.5 py-2.5 text-body-s font-semibold text-[var(--color-danger)]">
            {t.errors[error]}
          </p>
        ) : null}

        {options.length > 1 ? (
          <nav aria-label={t.currency} className="flex flex-wrap gap-2">
            {options.map((option) => (
              <Link
                key={option.currency}
                href={`${currencyBaseHref}?currency=${encodeURIComponent(option.currency)}`}
                scroll={false}
                aria-current={option.currency === rules.currency ? "true" : undefined}
                className={`rounded-full px-3 py-1.5 text-caption font-bold ${
                  option.currency === rules.currency ? "bg-[var(--color-brand-500)] text-[var(--color-on-primary)]" : "bg-[var(--color-surface-raised)] text-[var(--color-ink-muted)]"
                }`}
              >
                {option.currency}
              </Link>
            ))}
          </nav>
        ) : null}

        <fieldset className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
          <legend className="mb-4 p-0 text-body-l font-bold">{t.lead}</legend>
          <div className="grid grid-cols-2 gap-3">
            {rules.presets.map((option, index) => {
              const chosen = custom.trim() === "" && preset === index;
              return (
                <label
                  key={option}
                  className={`flex cursor-pointer flex-col items-center gap-0.5 rounded-[12px] bg-[var(--color-surface-raised)] p-3.5 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--color-primary)] ${
                    chosen ? "shadow-[inset_0_0_0_2px_var(--color-brand-500)]" : "shadow-[inset_0_0_0_1px_var(--color-line)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="amount"
                    value={option}
                    checked={chosen}
                    onChange={() => {
                      setPreset(index);
                      setCustom("");
                    }}
                    className="sr-only"
                  />
                  <span dir="ltr" className="text-display font-extrabold text-[var(--color-brand-500)]">
                    {inCurrency(option)}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={amountId} className="text-body-s font-bold">
            {t.custom}
          </label>
          <span
            className={`flex h-14 items-center gap-2 rounded-[12px] bg-[var(--color-surface-raised)] px-3.5 ${
              custom !== "" ? (blocked ? "shadow-[inset_0_0_0_2px_var(--color-danger)]" : "shadow-[inset_0_0_0_2px_var(--color-brand-500)]") : "shadow-[inset_0_0_0_1px_var(--color-line)]"
            }`}
          >
            <input
              id={amountId}
              name="custom_amount"
              type="text"
              inputMode="decimal"
              dir="ltr"
              autoComplete="off"
              value={custom}
              placeholder={t.customPh}
              aria-describedby={limitId}
              aria-invalid={custom !== "" && blocked ? true : undefined}
              onChange={(event) => setCustom(event.currentTarget.value)}
              className="w-0 min-w-0 flex-1 bg-transparent text-heading-m font-bold text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-subtle)]"
            />
            <span className="text-body-s font-bold text-[var(--color-ink-muted)]">{currencySign(rules.currency) ?? rules.currency}</span>
          </span>
          <span id={limitId} role={custom !== "" && blocked ? "alert" : undefined} className={`text-caption font-semibold ${custom !== "" && blocked ? "text-[var(--color-danger)]" : "text-[var(--color-ink-muted)]"}`}>
            {limitLine}
          </span>
        </div>

        <p className="text-caption font-medium leading-[1.6] text-[var(--color-ink-muted)]">{t.bankNote}</p>
      </section>

      <section className="flex flex-col gap-3 rounded-[16px] bg-[var(--color-surface-raised)] p-5 shadow-[0_0_12px_rgba(0,0,0,0.07)]">
        <h3 className="text-heading-m font-bold">{t.summary}</h3>
        <dl className="flex flex-col gap-2 text-body-s">
          <div className="flex justify-between gap-2 font-extrabold text-[var(--color-ink)]">
            <dt>{t.amount}</dt>
            <dd dir="ltr" data-amount>
              {amount ? inCurrency(amount) : "—"}
            </dd>
          </div>
        </dl>
        <p className="flex items-center gap-2.5 rounded-[12px] bg-[var(--color-success-wash)] p-3">
          <Coin size={28} />
          <span className="text-caption font-bold leading-[1.5] text-[var(--color-ink)]">{fill(t.bonusRule, { pct: trimFactor(bonusPct), hours: pendingHoldHours })}</span>
        </p>
        <p className="text-caption font-medium leading-[1.6] text-[var(--color-ink-muted)]">{fill(t.rules, { pct: trimFactor(bonusPct) })}</p>
        <SubmitButton
          disabled={blocked}
          className="flex h-[52px] items-center justify-center rounded-[12px] bg-[var(--color-brand-500)] px-4 text-body-l font-bold text-[var(--color-on-primary)] disabled:bg-[var(--color-button-disabled)]"
        >
          {amount && !blocked ? fill(t.continue, { amount: inCurrency(amount) }) : t.continuePlain}
        </SubmitButton>
        <p className="text-center text-caption-xs font-medium text-[var(--color-ink-subtle)]">{t.notCash}</p>
      </section>
    </form>
  );
}
