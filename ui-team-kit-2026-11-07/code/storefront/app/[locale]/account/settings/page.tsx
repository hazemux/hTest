import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AccountShell, SaveNotice } from "@/components/account/AccountShell";
import { Sheet } from "@/components/ui/Sheet";
import { SwitchThumb, switchTrackClass } from "@/components/ui/Switch";
import { ThemeSwitch } from "@/components/ui/ThemeToggle";
import { getConsents, listSavedCards } from "@/lib/api/client";
import { saveMarketingChannel } from "@/lib/account/consent-actions";
import { requireCustomer } from "@/lib/account/guard";
import { makeCardDefault, removeCard, renameCard } from "@/lib/account/card-actions";
import { savePreferences } from "@/lib/account/profile-actions";
import { saveState } from "@/lib/account/save-state";
import { SUPPORTED_CURRENCIES } from "@/lib/currency/for-country";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { SubmitButton } from "@/components/ui/SubmitButton";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ saved?: string; error?: string; card?: string; remove?: string; rename?: string; sheet?: string }>;
};

/** A saved card as this page uses it: named by its PUBLIC id (ADR 0037) in every form and URL. */
type SavedCard = {
  public_id: string;
  brand: string;
  last_four: string;
  expiry_month?: string | null;
  expiry_year?: string | null;
  nickname?: string | null;
  is_default?: boolean;
  chargeable?: boolean;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  return isLocale(locale) ? { title: messagesFor(locale).account.settings } : {};
}

/**
 * «الإعدادات» — «Settings Mobile» (Claude Design, 2026-09-30): three labelled
 * groups on the phone's grouped-list look.
 *
 *   - PREFERENCES: the language the store writes to the customer in, as an
 *     inline العربية / English switch; the preferred currency, a row opening a
 *     short sheet; dark mode, a real switch (the same toggle as the drawer).
 *   - REMINDERS AND OFFERS (contract v0.1.91; the owner, 2026-10-04 and
 *     2026-10-18): one switch per channel, WhatsApp and email — opt-in, off
 *     until the customer turns it on. The same consent the guest ticks at
 *     checkout, worded the same: it covers cart reminders as well as offers
 *     (`RecoveryEligibility` reads it). Each switch is its own form posting
 *     its NEW state (`saveMarketingChannel`), the store's one switch look
 *     (`components/ui/Switch.tsx`). App push is the app's to ask for, so it
 *     is not drawn. NO COMP for this group: «Settings Mobile» predates it, so
 *     it is built to that screen's own rows, type scale and switch.
 *   - PRIVACY & SECURITY: the security screens as rows here — password,
 *     phone, email, two-step, passkeys, and deleting the account in red.
 *   - SAVED CARDS: borderless rows with the default badge and the expiry
 *     («re-enter» in amber for a card that cannot be charged); ⋯ opens an
 *     action sheet — make default, rename, remove — and removing asks first.
 *
 * NO JAVASCRIPT NEEDED. Every write is a plain form post (`savePreferences`,
 * `saveMarketingChannel`, `makeCardDefault`, `renameCard`, `removeCard`);
 * every sheet also opens from
 * the URL (`?sheet=currency`, `?sheet=card-<public id>`, `?rename=<public id>`,
 * `?remove=<public id>`).
 *
 * «إضافة بطاقة جديدة» IS NOT DRAWN, by the owner's ruling (2026-09-30): a
 * card is saved only by ticking «حفظ البطاقة» while paying, and only by a
 * signed-in customer — never on its own, never for a guest. The empty state
 * says so instead.
 */
export default async function SettingsPage(props: Props) {
  // Per request, always: this page is somebody's account.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const m = messagesFor(locale);
  const { token, customer } = await requireCustomer(locale, `/${locale}/account/settings`);
  const [cards, consents] = await Promise.all([
    listSavedCards({ locale, bearerToken: token }).catch(() => null),
    getConsents({ locale, bearerToken: token }).catch(() => null),
  ]);
  const listed = (Array.isArray(cards) ? cards : ((cards as { data?: unknown } | null)?.data ?? null)) as
    | (Omit<SavedCard, "public_id"> & { public_id?: string | null })[]
    | null;
  // A card that arrives without a public id (a malformed answer) cannot be
  // renamed or removed by one, so it is not listed with controls
  // that would fail.
  const savedCards: SavedCard[] | null =
    listed?.flatMap((card) => (typeof card.public_id === "string" && card.public_id !== "" ? [{ ...card, public_id: card.public_id }] : [])) ?? null;
  const { card: cardOutcome, remove, rename, sheet, ...saveParams } = await props.searchParams;
  const removing = savedCards?.find((card) => card.public_id === remove) ?? null;
  // THE PAGE'S OWN LANGUAGE is the one pressed. Saving a language switches
  // the store to it (`savePreferences`), so the two agree after every save;
  // following the account's stored value instead showed «English» pressed on
  // an Arabic page.
  const language: Locale = locale;
  const currency = customer.currency ?? "AED";
  const page = `/${locale}/account/settings`;
  const base = `/${locale}/account`;

  const security = [
    {
      href: `${base}/settings/security/password`,
      icon: "/brand/icon-security-lock.svg",
      label: m.account.securityChangePassword,
      sub: customer.has_password ? null : m.account.passwordNotAdded,
    },
    { href: `${base}/settings/security/phone`, icon: "/brand/icon-security-phone.svg", label: m.account.phoneTitle, sub: customer.phone, ltr: true },
    {
      href: `${base}/profile?sheet=email#email`,
      icon: "/brand/icon-security-email.svg",
      label: m.account.securityChangeEmail,
      sub: customer.email ?? m.account.emailNone,
      ltr: Boolean(customer.email),
    },
    {
      href: `${base}/settings/security/two-factor`,
      icon: "/brand/icon-security-2fa.svg",
      label: m.account.twoFactorTitle,
      sub: customer.two_factor_enabled ? m.account.twoFactorStateOn : m.account.twoFactorStateOff,
    },
    { href: `${base}/settings/security/passkeys`, icon: "/brand/icon-security-lock.svg", label: m.account.passkeys, sub: null },
    { href: `${base}/settings/security/delete`, icon: "/brand/icon-security-delete.svg", label: m.account.securityDelete, sub: null, danger: true },
  ];

  return (
    <AccountShell locale={locale} active="settings">
      <div className="flex flex-col gap-6 lg:rounded-[16px] lg:bg-[var(--color-surface-raised)] lg:p-6 lg:shadow-[0_0_12px_rgba(0,0,0,0.07)]">
        <h2 className="text-heading-m font-bold leading-[1.4] text-[var(--color-ink)] lg:text-heading-l">{m.account.settings}</h2>
        <SaveNotice state={saveState(saveParams)} locale={locale} />

        {/* PREFERENCES */}
        <section aria-labelledby="preferences" className={GROUP}>
          <h3 id="preferences" className={GROUP_TITLE}>
            {m.account.preferences}
          </h3>
          <div className={ROWS}>
            <form action={savePreferences} className={`${ROW} ${RULE}`}>
              {/* Each form posts only its own preference, so switching one
                  never rewrites the other with whatever this page showed. */}
              <input type="hidden" name="locale" value={locale} />
              <Glyph src="/brand/icon-settings-language.svg" />
              <span className="flex-1 text-body-s font-bold lg:text-body-l">{m.account.languagePref}</span>
              <div role="group" aria-label={m.account.languagePref} className="flex shrink-0 rounded-[10px] bg-[var(--color-bg-subtle)] p-[3px]">
                {(["ar", "en"] as const).map((each) => (
                  <SubmitButton
                    key={each}
                    name="language"
                    value={each}
                    lang={each}
                    aria-pressed={language === each}
                    className={`rounded-[8px] px-2.5 py-1 text-caption font-bold lg:text-body-s ${
                      language === each ? "bg-[var(--background)] text-[var(--color-brand-500)] shadow-sm" : "text-[var(--color-ink-muted)]"
                    }`}
                  >
                    {each === "ar" ? m.common.switchToArabic : m.common.switchToEnglish}
                  </SubmitButton>
                ))}
              </div>
            </form>

            <div className={`${ROW} ${RULE}`}>
              <Sheet
                title={m.account.currencyPref}
                closeLabel={m.account.close}
                fallbackHref={`${page}?sheet=currency`}
                closeHref={page}
                openInitially={sheet === "currency"}
                triggerClassName="flex min-h-[56px] w-full items-center gap-3 text-[var(--color-ink)]"
                trigger={
                  <>
                    <Glyph src="/brand/icon-settings-currency.svg" />
                    <span className="flex-1 text-body-s font-bold lg:text-body-l">{m.account.currencyPref}</span>
                    <span dir="ltr" className="text-body-s font-bold text-[var(--color-ink-muted)] lg:text-body-l">
                      {currency}
                    </span>
                    <Chevron />
                  </>
                }
              >
                <form action={savePreferences} className="flex flex-col gap-1">
                  <input type="hidden" name="locale" value={locale} />
                  {SUPPORTED_CURRENCIES.map((code) => (
                    <SubmitButton
                      key={code}
                      name="currency"
                      value={code}
                      aria-pressed={code === currency}
                      className={`flex min-h-[46px] items-center gap-3 rounded-[10px] px-2.5 text-start ${
                        code === currency ? "bg-[var(--color-primary-wash-lighter)]" : "hover:bg-[var(--color-chip)]"
                      }`}
                    >
                      <bdi dir="ltr" className={`w-10 text-body-s font-bold ${code === currency ? "text-[var(--color-brand-500)]" : "text-[var(--color-ink)]"}`}>
                        {code}
                      </bdi>
                      <span className="flex-1 text-body-s text-[var(--color-ink)]">{m.currencyName[code]}</span>
                      {code === currency ? (
                        <span aria-hidden className="block size-3.5 bg-[var(--color-brand-500)] [mask-image:url(/brand/icon-check.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
                      ) : null}
                    </SubmitButton>
                  ))}
                </form>
              </Sheet>
            </div>

            <div className={ROW}>
              <span aria-hidden className="block size-5 shrink-0 rounded-full shadow-[inset_-6px_-2px_0_0_var(--color-ink)]" />
              <span className="flex-1 text-body-s font-bold lg:text-body-l">{m.nav.theme.dark}</span>
              <ThemeSwitch label={m.nav.theme.dark} />
            </div>
          </div>
          <p className="px-1 text-caption leading-[1.6] text-[var(--color-ink-subtle)] lg:text-body-s">{m.account.settingsLead}</p>
        </section>

        {/* REMINDERS AND OFFERS */}
        <section id="marketing" aria-labelledby="marketing-title" className={GROUP}>
          <h3 id="marketing-title" className={GROUP_TITLE}>
            {m.account.marketingTitle}
          </h3>
          {consents === null ? (
            <p className="rounded-[16px] bg-[var(--color-chip)] p-4 text-body-s text-[var(--color-ink-muted)] lg:text-body-l">{m.account.sectionUnavailable}</p>
          ) : (
            <div className={ROWS}>
              {MARKETING_CHANNELS.map((channel, index) => {
                const granted = consents.marketing[channel].granted;
                const label = channel === "whatsapp" ? m.account.marketingWhatsapp : m.account.marketingEmail;
                return (
                  <form
                    key={channel}
                    action={saveMarketingChannel}
                    data-marketing-channel={channel}
                    className={`${ROW} ${index < MARKETING_CHANNELS.length - 1 ? RULE : ""}`}
                  >
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="channel" value={channel} />
                    <Glyph src={channel === "whatsapp" ? "/brand/icon-whatsapp.svg" : "/brand/icon-security-email.svg"} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-body-s font-bold lg:text-body-l">{label}</span>
                      {channel === "email" && !customer.email ? (
                        <span className="text-caption text-[var(--color-ink-subtle)] lg:text-body-s">{m.account.marketingNeedsEmail}</span>
                      ) : null}
                    </span>
                    {/* The switch says where it stands and posts the OPPOSITE. */}
                    <SubmitButton name="granted" value={granted ? "0" : "1"} role="switch" aria-checked={granted} aria-label={label} className={switchTrackClass(granted)}>
                      <SwitchThumb on={granted} />
                    </SubmitButton>
                  </form>
                );
              })}
            </div>
          )}
          <p className="px-1 text-caption leading-[1.6] text-[var(--color-ink-subtle)] lg:text-body-s">{m.account.marketingLead}</p>
        </section>

        {/* PRIVACY & SECURITY */}
        <section aria-labelledby="security" className={GROUP}>
          <h3 id="security" className={GROUP_TITLE}>
            {m.account.privacy}
          </h3>
          <ul className={ROWS}>
            {security.map((row, index) => (
              <li key={row.href} className={index < security.length - 1 ? RULE : undefined}>
                <Link
                  href={row.href}
                  className={`flex min-h-[56px] items-center gap-3 ${row.danger ? "text-[var(--color-danger)]" : "text-[var(--color-ink)]"}`}
                >
                  <Glyph src={row.icon} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-body-s font-bold lg:text-body-l">{row.label}</span>
                    {row.sub ? (
                      <bdi dir={row.ltr ? "ltr" : undefined} className="max-w-full self-start truncate text-caption text-[var(--color-ink-subtle)] lg:text-body-s">
                        {row.sub}
                      </bdi>
                    ) : null}
                  </span>
                  <Chevron />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* SAVED CARDS */}
        <section id="saved-cards" aria-labelledby="saved-cards-title" className={GROUP}>
          <h3 id="saved-cards-title" className={GROUP_TITLE}>
            {m.account.cardsTitle}
          </h3>

          {cardOutcome ? (
            <p
              role={cardOutcome === "error" ? "alert" : "status"}
              className={`rounded-[10px] px-3 py-2.5 text-caption font-bold lg:text-body-s ${
                cardOutcome === "error"
                  ? "bg-[var(--color-error-subtlest)] text-[var(--color-danger)]"
                  : "bg-[var(--color-success-subtlest)] text-[var(--color-success)]"
              }`}
            >
              {cardOutcome === "error" ? m.account.cardActionFailed : cardOutcome === "removed" ? m.account.cardRemoved : m.account.cardUpdated}
            </p>
          ) : null}

          {savedCards === null ? (
            <p className="rounded-[16px] bg-[var(--color-chip)] p-4 text-body-s text-[var(--color-ink-muted)] lg:text-body-l">{m.account.sectionUnavailable}</p>
          ) : savedCards.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-[16px] bg-[var(--color-chip)] px-5 py-6 text-center">
              <span className="grid size-[52px] place-items-center rounded-full bg-[var(--background)]">
                <span aria-hidden className="block h-[18px] w-[22px] bg-[var(--color-ink)] [mask-image:url(/brand/icon-card.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
              </span>
              <p className="text-body-s font-bold text-[var(--color-ink)] lg:text-body-l">{m.account.cardsEmptyTitle}</p>
              <p className="max-w-[240px] text-caption leading-[1.6] lg:text-body-s text-[var(--color-ink-subtle)]">{m.account.cardsEmptyLead}</p>
            </div>
          ) : (
            <ul className={ROWS}>
              {savedCards.map((card, index) => (
                <li key={card.public_id} data-saved-card={card.public_id} className={index < savedCards.length - 1 ? RULE : undefined}>
                  <CardRow locale={locale} card={card} menuOpen={sheet === `card-${card.public_id}` || rename === card.public_id} />
                </li>
              ))}
            </ul>
          )}

          <p className="flex items-center gap-1.5 px-1 text-caption font-bold text-[var(--color-success)]">
            <span aria-hidden className="block size-3.5 shrink-0 bg-current [mask-image:url(/brand/icon-shield-tick.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
            {m.account.cardsSecure}
          </p>
        </section>
      </div>

      {removing ? <RemoveSheet locale={locale} card={removing} /> : null}
    </AccountShell>
  );
}

/** The channels this page offers, in the order drawn. */
const MARKETING_CHANNELS = ["whatsapp", "email"] as const;

const GROUP = "flex flex-col gap-2";
const GROUP_TITLE = "px-1 text-caption font-bold text-[var(--color-ink-subtle)] lg:text-body-s";
const ROWS = "rounded-[16px] bg-[var(--color-chip)] px-3.5 text-[var(--color-ink)]";
const ROW = "flex min-h-[56px] items-center gap-3";
const RULE = "border-b border-[var(--color-line)]";

/** A 20px settings glyph in the row's own colour. */
function Glyph({ src }: { src: string }) {
  return (
    <span
      aria-hidden
      className="block size-5 shrink-0 bg-current [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]"
      style={{ maskImage: `url(${src})`, WebkitMaskImage: `url(${src})` }}
    />
  );
}

function Chevron() {
  return (
    <span
      aria-hidden
      className="block size-4 shrink-0 bg-[var(--color-ink-subtle)] [mask-image:url(/brand/icon-chevron-start.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:5px_10px] ltr:-scale-x-100"
    />
  );
}

/** A card's brand in its 48x34 tile — the scheme's own mark where we have it. */
function BrandMark({ brand }: { brand: string }) {
  const key = brand.toLowerCase();
  const src = key.includes("visa") ? "/brand/visa.svg" : key.includes("master") ? "/brand/mastercard.svg" : null;
  return (
    <span className="grid h-[34px] w-12 shrink-0 place-items-center rounded-[8px] bg-[var(--background)] px-1 shadow-[inset_0_0_0_1px_var(--color-line)]">
      {src ? (
        <Image src={src} alt="" aria-hidden width={32} height={16} className="cq-mark-plate h-4 w-auto" />
      ) : (
        <span dir="ltr" className="text-caption font-black uppercase italic text-[var(--color-ink)]">
          {brand}
        </span>
      )}
    </span>
  );
}

/** «Visa», «Mastercard» — the comp's casing; the API sends the scheme in capitals. */
function brandName(brand: string): string {
  return brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase();
}

function expiryOf(card: SavedCard): string | null {
  return card.expiry_month && card.expiry_year ? `${card.expiry_month.padStart(2, "0")}/${card.expiry_year.slice(-2)}` : null;
}

/**
 * One saved card: the brand tile, «Visa •••• 4242» with «الاساسية» when it
 * is the default, the expiry — or, for a card that can no longer be charged,
 * «أدخل هذه البطاقة مرة أخرى» in amber — and ⋯ opening its action sheet:
 * make it the default, rename it right there, or remove it (which asks first,
 * in its own sheet).
 */
function CardRow({ locale, card, menuOpen }: { locale: Locale; card: SavedCard; menuOpen: boolean }) {
  const m = messagesFor(locale);
  const expiry = expiryOf(card);
  const page = `/${locale}/account/settings`;
  const label = `${card.nickname ? `${card.nickname} · ` : ""}${brandName(card.brand)} •••• ${card.last_four}`;

  return (
    <div className="flex min-h-16 items-center gap-3">
      <BrandMark brand={card.brand} />
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="flex flex-wrap items-center gap-1.5">
          <bdi dir="ltr" className="text-body-s font-semibold lg:text-body-l">
            {label}
          </bdi>
          {card.is_default ? (
            <span className="rounded-full bg-[var(--color-primary-wash-lighter)] px-[7px] text-caption-xs font-semibold leading-[18px] text-[var(--color-brand-500)]">
              {m.account.defaultBadge}
            </span>
          ) : null}
        </span>
        {card.chargeable === false ? (
          <span className="text-caption text-[var(--color-warning-strong)] lg:text-body-s">{m.payment.reenterCard}</span>
        ) : expiry ? (
          <span className="text-caption text-[var(--color-ink-subtle)] lg:text-body-s">
            {m.account.cardExpires} <span dir="ltr">{expiry}</span>
          </span>
        ) : null}
      </span>

      <Sheet
        title={label}
        closeLabel={m.account.close}
        fallbackHref={`${page}?sheet=card-${card.public_id}#saved-cards`}
        closeHref={`${page}#saved-cards`}
        openInitially={menuOpen}
        triggerLabel={`${m.account.cardMenu}: ${card.brand} ${card.last_four}`}
        triggerClassName="grid size-[34px] shrink-0 place-items-center rounded-[10px] hover:bg-[var(--color-bg-subtle)]"
        trigger={<span aria-hidden className="block size-4 bg-[var(--color-ink)] [mask-image:url(/brand/icon-kebab.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />}
      >
        <div className="flex flex-col rounded-[14px] bg-[var(--color-chip)] px-3.5">
          {!card.is_default && card.chargeable !== false ? (
            <form action={makeCardDefault} className={RULE}>
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="card" value={card.public_id} />
              <SubmitButton className={SHEET_ROW}>
                <span aria-hidden className="block size-[18px] shrink-0 bg-current [mask-image:url(/brand/icon-heart-outline.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
                {m.account.makeDefaultShort}
              </SubmitButton>
            </form>
          ) : null}
          {/* Removing asks first, in its own sheet (`?remove=`); this one closes as the URL changes. */}
          <Link href={`${page}?remove=${card.public_id}#saved-cards`} scroll={false} className={`${SHEET_ROW} text-[var(--color-danger)]`}>
            <span aria-hidden className="block size-[18px] shrink-0 bg-current [mask-image:url(/brand/icon-trash.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
            {m.account.removeCard}
          </Link>
        </div>

        {/* «تغيير اسم البطاقة» — right here, no second sheet. */}
        <form action={renameCard} className="flex flex-col gap-2">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="card" value={card.public_id} />
          <label className="flex flex-col gap-1.5">
            <span className="flex items-center gap-2 text-body-s font-bold">
              <span aria-hidden className="block size-4 shrink-0 bg-current [mask-image:url(/brand/icon-edit.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
              {m.account.cardNickname}
            </span>
            <input
              name="nickname"
              maxLength={40}
              defaultValue={card.nickname ?? ""}
              placeholder={m.account.renameCard}
              className="h-12 rounded-[12px] border border-[var(--color-line)] bg-[var(--background)] px-3.5 text-body-s text-[var(--color-ink)] outline-none focus:border-[var(--color-primary)]"
            />
          </label>
          <SubmitButton className="h-12 rounded-[12px] bg-[var(--color-brand-500)] text-body-s font-bold text-[var(--color-on-cta)] hover:bg-[var(--color-primary-hover)]">
            {m.account.cardRename}
          </SubmitButton>
        </form>
      </Sheet>

    </div>
  );
}

const SHEET_ROW = "flex min-h-[52px] w-full items-center gap-3 text-start text-body-s font-bold";

/**
 * «حذف البطاقة؟» — the bottom sheet (`7430:56060`): drag pill, title and
 * close, the warning disc, the question naming the card, what removal
 * means, the default-card note when it applies, then «نعم، احذف البطاقة»
 * and «إلغاء». Server-rendered from `?remove=`; closing is a link back.
 */
function RemoveSheet({ locale, card }: { locale: Locale; card: SavedCard }) {
  const m = messagesFor(locale);
  const back = `/${locale}/account/settings#saved-cards`;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center lg:items-center">
      <Link href={back} scroll={false} aria-label={m.account.close} className="absolute inset-0 bg-[var(--color-backdrop)] backdrop-blur-[2px]" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-card-title"
        className="relative w-full max-w-[480px] rounded-t-[24px] border-t border-[var(--color-border)] bg-[var(--color-surface)] pb-5 lg:rounded-[24px]"
      >
        <div className="flex justify-center pb-1 pt-2 lg:hidden">
          <span aria-hidden className="h-1 w-10 rounded-[2px] bg-[var(--color-border)]" />
        </div>
        <div className="flex items-center justify-between px-6 py-3">
          <h2 id="remove-card-title" className="text-body-l font-semibold leading-[1.5] text-[var(--color-ink)]">
            {m.account.removeSheetTitle}
          </h2>
          <Link href={back} scroll={false} aria-label={m.account.close} className="grid size-6 place-items-center">
            <span aria-hidden className="block size-6 bg-[var(--color-ink)] [mask-image:url(/brand/icon-close.svg)] [mask-size:contain]" />
          </Link>
        </div>
        <div className="flex flex-col items-center gap-4 px-6 pb-6 pt-3 text-center">
          <span className="grid place-items-center rounded-full bg-[var(--color-error-wash)] p-3">
            <span aria-hidden className="block size-6 bg-[var(--color-error)] [mask-image:url(/brand/icon-warning-trash.svg)] [mask-size:contain]" />
          </span>
          <p className="text-body-l font-semibold leading-[1.5] text-[var(--color-ink)]">
            {m.account.removeSheetQuestion.replace("{brand}", brandName(card.brand)).replace("{last4}", card.last_four)}
          </p>
          <p className="text-body-s leading-[1.5] text-[var(--color-ink-subtle)]">{m.account.removeSheetLead}</p>
          {card.is_default ? (
            <p className="w-full rounded-[8px] border border-[color-mix(in_srgb,var(--color-warning)_35%,transparent)] bg-[var(--color-warning-wash)] p-3 text-start text-caption leading-[1.5] text-[var(--color-warning)]">
              {m.account.removeSheetDefault}
            </p>
          ) : null}
          <div className="flex w-full flex-col gap-3 pt-2">
            <form action={removeCard}>
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="card" value={card.public_id} />
              <SubmitButton className="w-full rounded-[10px] bg-[var(--color-error)] p-3.5 text-body-l font-semibold text-white">
                {m.account.removeSheetConfirm}
              </SubmitButton>
            </form>
            <Link href={back} scroll={false} className="rounded-[10px] border-[1.5px] border-[var(--color-border)] p-3.5 text-body-l font-semibold text-[var(--color-ink)]">
              {m.account.cancel}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
