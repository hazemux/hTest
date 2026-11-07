import Image from "next/image";

import { SaveNotice } from "@/components/account/AccountShell";
import { CountryCityFields, type CityChoice } from "@/components/account/CountryCityFields";
import { CTA_BUTTON, PAY_BAR, PAY_BAR_CLEARANCE } from "@/components/checkout/styles";
import { Sheet } from "@/components/ui/Sheet";
import { latestBirthDate } from "@/lib/account/birth-date";
import type { AuthErrorCode } from "@/lib/account/errors";
import type { Customer } from "@/lib/account/guard";
import { saveProfile, startEmailChange } from "@/lib/account/profile-actions";
import type { components } from "@/lib/api/generated/v1.d.ts";
import { joinKey } from "@/lib/api/public-id";
import { RESIDENCE_COUNTRIES } from "@/lib/currency/countries";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { SubmitButton } from "@/components/ui/SubmitButton";

type AvatarOption = components["schemas"]["AvatarOption"];

/** The gender answers, in the comp's order; "" takes the answer back. */
const GENDERS = ["female", "male", ""] as const;

/** The corner of the store's character art (see `face` below). */
export const CHARACTER_TILE = "rounded-[23%]";

/** Where each control belongs: the save form, or the email form. */
const PROFILE_FORM = "profile-form";
const EMAIL_FORM = "email-form";

/**
 * «المعلومات الشخصية» — «Profile Mobile» (Claude Design, 2026-09-30).
 *
 * The character on top — tapping it opens a sheet of the STORE'S characters
 * (staff add them; nothing is uploaded from the customer's device, and «بدون
 * شخصية» is still a choice) — then the fields grouped the way a phone's
 * settings are, labels inside the rows: sign-in details, about you,
 * residence, and — for an account without one — a first password.
 *
 * TWO FORMS, NEVER NESTED. «حفظ التغيير» saves the character and every field
 * (`saveProfile`); the controls that sit outside its element join it by
 * `form="profile-form"`. The email is its own form (`startEmailChange`): a new
 * address is proved first, by a code, and until then the account keeps the
 * one it had.
 *
 * Every sheet also opens from the URL (`?sheet=avatar`, `?sheet=email`), so
 * the page works before any script loads.
 *
 * WHERE THIS DEPARTS FROM THE COMP: «حفظ التغيير» is always pressable rather
 * than waiting for a change — it is a plain form, and a button that needs a
 * script to come alive is a dead button without one.
 */
export function ProfileCard({
  locale,
  customer,
  state,
  avatars,
  place,
  problem = null,
  emailConfirmed = false,
  sheet = null,
  stockAlertNext = null,
}: {
  locale: Locale;
  customer: Customer;
  state: "saved" | "error" | null;
  /** `GET /content/avatars` — empty hides the picker. */
  avatars: readonly AvatarOption[];
  /**
   * Where the residence fields open (`placeForProfile`): the saved country and
   * city, else the visitor's detected ones — with that country's cities, so
   * the dropdown is filled without a script.
   */
  place: { country: string; cities: readonly CityChoice[]; cityId: number | null };
  /** A named refusal from the last write, already checked against our codes. */
  problem?: AuthErrorCode | null;
  emailConfirmed?: boolean;
  /** The sheet the URL opened (no script). */
  sheet?: "avatar" | "email" | null;
  /**
   * «نبهني عند التوفير» sent an account with no email here (owner,
   * 2026-11-02): the sheet says why, and its form carries the alert to set
   * once the address is proved (`lib/stock-alerts/after-email.ts`).
   */
  stockAlertNext?: string | null;
}) {
  const m = messagesFor(locale);
  const page = `/${locale}/account/profile`;
  const name = customer.name?.trim() || null;
  const avatar = customer.avatar ?? null;
  // The customer's own character stays a choice even when staff have stopped
  // offering it, or the list did not load: otherwise no radio is checked and
  // the next save would look like a decision to drop it. It goes first.
  //
  // Named by PUBLIC id (ADR 0037). A character without one cannot be posted,
  // so it is not a radio; when it is the customer's own, no radio is checked
  // and the form carries no `avatar_public_id` at all — which leaves the
  // character as it is (`publicIdChoice`), never clears it.
  const avatarKey = joinKey(avatar?.public_id);
  const offered = avatars.flatMap((option) => {
    const key = joinKey(option.public_id);
    return key === null ? [] : [{ key, image: option.image }];
  });
  const choices: readonly { key: string; image: AvatarOption["image"] }[] =
    avatar && avatarKey !== null && !offered.some((option) => option.key === avatarKey)
      ? [{ key: avatarKey, image: { url: avatar.url, alt: avatar.name } }, ...offered]
      : offered;

  const group = "flex flex-col gap-2.5";
  const heading = "text-body-s font-bold text-[var(--color-ink-subtle)] lg:text-body-l";
  const rows = "rounded-[12px] bg-[var(--color-chip)] px-3.5";
  const row = "flex min-h-[60px] flex-col justify-center";
  const rule = "border-b border-[var(--color-line)]";
  const small = "text-caption text-[var(--color-ink-subtle)] lg:text-body-s";
  const control =
    "h-[26px] w-full min-w-0 border-0 bg-transparent p-0 text-body-s font-semibold text-[var(--color-ink)] outline-none lg:text-body-m placeholder:font-normal placeholder:text-[var(--color-ink-subtle)] focus-visible:outline-none";

  // A CHARACTER IS ITS OWN TILE: the store's art is a square PNG with rounded
  // corners of its own (≈23% of its width) and transparent outside them. It is
  // drawn as it comes — no ground behind it, the corner matched to the art —
  // and the ring stands 2px off its edge, so nothing shows in its corners.
  const face = (size: string, radius: string, text: string) =>
    avatar ? (
      <Image
        src={avatar.url}
        alt={avatar.name[locale]}
        width={176}
        height={176}
        className={`${size} ${CHARACTER_TILE} shrink-0 outline outline-2 outline-offset-2 outline-[var(--color-brand-500)]`}
      />
    ) : (
      <span
        aria-hidden
        className={`grid ${size} ${radius} shrink-0 place-items-center bg-[var(--color-primary-wash-lighter)] ${text} font-bold text-[var(--color-brand-500)] shadow-[0_0_0_2px_var(--color-brand-500)]`}
      >
        {name ? name.charAt(0) : null}
      </span>
    );

  return (
    <section className={`flex flex-col gap-6 lg:rounded-[16px] lg:bg-[var(--color-surface-raised)] lg:p-6 lg:shadow-[0_0_12px_rgba(0,0,0,0.07)] ${PAY_BAR_CLEARANCE}`}>
      <h2 className="hidden text-heading-l font-bold leading-[1.4] text-[var(--color-ink)] lg:block">{m.account.personalInfo}</h2>

      {state || problem || emailConfirmed ? (
        <div className="flex flex-col gap-2 [&>p]:mb-0">
          <SaveNotice state={state} locale={locale} />
          {problem ? (
            <p role="alert" className="rounded-[10px] bg-[var(--color-error-subtlest)] px-3 py-2.5 text-body-s font-semibold text-[var(--color-danger)] lg:text-body-l">
              {m.account.errors[problem]}
            </p>
          ) : null}
          {emailConfirmed ? (
            <p role="status" className="cq-notice-auto rounded-[10px] bg-[var(--color-success-subtlest)] px-3 py-2.5 text-body-s font-semibold text-[var(--color-success)] lg:text-body-l">
              {m.account.emailConfirmed}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* THE CHARACTER — its sheet's radios belong to the save form. */}
      {choices.length > 0 ? (
        <div className="flex flex-col items-center gap-2.5">
          <Sheet
            title={m.account.chooseAvatar}
            closeLabel={m.nav.menu.close}
            fallbackHref={`${page}?sheet=avatar`}
            closeHref={page}
            openInitially={sheet === "avatar"}
            triggerLabel={m.account.chooseAvatar}
            triggerClassName="relative block rounded-[24px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-primary)]"
            trigger={
              <>
                {face("size-[88px]", "rounded-[24px]", "text-[34px]")}
                <span
                  aria-hidden
                  className="absolute -bottom-1.5 -end-1.5 grid size-7 place-items-center rounded-full bg-[var(--color-brand-500)] shadow-[0_0_0_3px_var(--background)]"
                >
                  <span className="block size-3.5 bg-[var(--color-on-cta)] [mask-image:url(/brand/icon-edit.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
                </span>
              </>
            }
          >
            <fieldset>
              <legend className="sr-only">{m.account.chooseAvatar}</legend>
              <div className="grid grid-cols-4 gap-3">
                {choices.map((option) => (
                  <label key={option.key} className="cursor-pointer">
                    <input
                      type="radio"
                      name="avatar_public_id"
                      form={PROFILE_FORM}
                      value={option.key}
                      defaultChecked={avatarKey === option.key}
                      className="peer sr-only"
                    />
                    <Image
                      src={option.image.url}
                      alt={option.image.alt[locale]}
                      width={144}
                      height={144}
                      className={`aspect-square w-full ${CHARACTER_TILE} outline-offset-2 peer-checked:outline peer-checked:outline-[3px] peer-checked:outline-[var(--color-brand-500)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--color-primary)]`}
                    />
                  </label>
                ))}
                <label className="cursor-pointer">
                  <input type="radio" name="avatar_public_id" form={PROFILE_FORM} value="" defaultChecked={!avatar} className="peer sr-only" />
                  <span className={`grid aspect-square w-full place-items-center ${CHARACTER_TILE} bg-[var(--color-primary-wash-lighter)] p-1 text-center text-caption-xs font-bold text-[var(--color-ink-muted)] outline-offset-2 peer-checked:outline peer-checked:outline-[3px] peer-checked:outline-[var(--color-brand-500)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--color-primary)]`}>
                    {m.account.noAvatar}
                  </span>
                </label>
              </div>
            </fieldset>
            <p className="text-caption text-[var(--color-ink-subtle)]">{m.account.avatarNote}</p>
            <button type="submit" form={PROFILE_FORM} className={`${CTA_BUTTON} justify-center`}>
              {m.account.save}
            </button>
          </Sheet>
          <span className="text-caption font-bold text-[var(--color-brand-500)] lg:text-body-s">{m.account.chooseAvatar}</span>
        </div>
      ) : null}

      {/* SIGN-IN DETAILS — the phone is the account; the email changes by code. */}
      <section className={group} aria-labelledby="sign-in-details">
        <h3 id="sign-in-details" className={heading}>
          {m.account.signInDetails}
        </h3>
        <div className={rows}>
          <div className={`${row} ${rule}`}>
            <span className={small}>{m.account.phone}</span>
            <bdi dir="ltr" className="self-start text-body-s font-semibold lg:text-body-m">
              {customer.phone}
            </bdi>
          </div>
          <div className="flex min-h-[56px] items-center gap-3">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={small}>{m.account.email}</span>
              {customer.email ? (
                <bdi dir="ltr" className="max-w-full self-start text-body-s font-semibold [overflow-wrap:anywhere] lg:text-body-m">
                  {customer.email}
                </bdi>
              ) : (
                <span className="text-body-s text-[var(--color-ink-muted)] lg:text-body-m">{m.account.emailNone}</span>
              )}
            </span>
            <Sheet
              title={customer.email ? m.account.emailChange : m.account.emailAdd}
              closeLabel={m.nav.menu.close}
              fallbackHref={`${page}?sheet=email#email`}
              closeHref={page}
              openInitially={sheet === "email"}
              triggerClassName="shrink-0 text-caption font-bold text-[var(--color-brand-500)] lg:text-body-s"
              trigger={customer.email ? m.account.change : m.account.emailAdd}
            >
              {stockAlertNext ? <p className="text-body-s leading-[1.6] text-[var(--color-ink)]">{m.account.emailForStockAlert}</p> : null}
              <label className="flex flex-col gap-1.5">
                <span className="text-caption text-[var(--color-ink-subtle)]">{m.account.newEmail}</span>
                <input
                  id="email"
                  type="email"
                  name="email"
                  form={EMAIL_FORM}
                  dir="ltr"
                  required
                  maxLength={255}
                  autoComplete="email"
                  inputMode="email"
                  placeholder="name@mail.com"
                  className="h-12 rounded-[12px] border border-[var(--color-line)] bg-[var(--color-field)] px-3.5 text-body-s text-[var(--color-ink)] outline-none focus:border-[var(--color-primary)]"
                />
              </label>
              <p className="text-caption leading-[1.6] text-[var(--color-ink-muted)]">{m.account.emailHint}</p>
              <button type="submit" form={EMAIL_FORM} className={`${CTA_BUTTON} justify-center`}>
                {m.account.sendCode}
              </button>
            </Sheet>
          </div>
        </div>
      </section>

      <form id={PROFILE_FORM} action={saveProfile} className="flex flex-col gap-6">
        <input type="hidden" name="locale" value={locale} />

        <section className={group} aria-labelledby="about-you">
          <h3 id="about-you" className={heading}>
            {m.account.aboutYou}
          </h3>
          <div className={rows}>
            <label className={`${row} ${rule}`}>
              <span className={small}>{m.account.name}</span>
              <input type="text" name="name" defaultValue={customer.name ?? ""} maxLength={160} autoComplete="name" className={control} />
            </label>
            <label className={`${row} ${rule}`}>
              <span className={small}>{m.account.nickname}</span>
              <input
                type="text"
                name="nickname"
                dir="auto"
                defaultValue={customer.nickname ?? ""}
                maxLength={60}
                placeholder={m.account.nicknamePlaceholder}
                autoComplete="nickname"
                className={control}
              />
            </label>
            <label className={row}>
              <span className={small}>{m.account.birthDate}</span>
              {/* A date reads LTR on the Arabic page too; the phone opens its own picker. */}
              <input
                type="date"
                name="birth_date"
                dir="ltr"
                defaultValue={customer.birth_date ?? ""}
                min="1900-01-01"
                max={latestBirthDate()}
                autoComplete="bday"
                // An LTR value under a label at the page's start: sized to its
                // content and placed at the row's start (right, in Arabic).
                className={`${control} !w-auto self-start`}
              />
            </label>
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className={`${small} mb-1.5 px-0.5`}>{m.account.gender}</legend>
            <div className="flex gap-1 rounded-[12px] bg-[var(--color-chip)] p-1">
              {GENDERS.map((value) => (
                <label key={value || "unset"} className="flex-1 cursor-pointer">
                  <input
                    type="radio"
                    name="gender"
                    value={value}
                    defaultChecked={value === "" ? !customer.gender : customer.gender === value}
                    className="peer sr-only"
                  />
                  <span className="flex h-[38px] items-center justify-center rounded-[9px] px-1 text-center text-caption font-bold leading-tight lg:text-body-s text-[var(--color-ink-muted)] peer-checked:bg-[var(--background)] peer-checked:text-[var(--color-brand-500)] peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--color-primary)]">
                    {value === "" ? m.account.genderUnsetShort : m.account[value]}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </section>

        <section className={group} aria-labelledby="residence">
          <h3 id="residence" className={heading}>
            {m.account.residence}
          </h3>
          <div className={`${rows} [&>label:first-child]:border-b [&>label:first-child]:border-[var(--color-line)]`}>
            <CountryCityFields
              locale={locale}
              countries={RESIDENCE_COUNTRIES.map((c) => ({ value: c.code, label: c.name[locale] }))}
              initialCountry={place.country}
              initialCities={place.cities}
              initialCityId={place.cityId}
              initialCityName={customer.city_name ?? null}
              labels={{
                country: m.account.country,
                city: m.account.city,
                chooseCountry: m.account.chooseCountry,
                chooseCity: m.account.chooseCity,
                chooseCountryFirst: m.account.chooseCountryFirst,
              }}
              wrapperClassName={row}
              labelClassName={small}
              selectClassName={`${control} cursor-pointer appearance-none disabled:opacity-60`}
            />
          </div>
        </section>

        {customer.has_password ? null : (
          <section className={group} aria-labelledby="first-password">
            <h3 id="first-password" className={heading}>
              {m.account.setPassword}
            </h3>
            <div className={rows}>
              <label className={row}>
                <span className={small}>
                  {m.account.password} {m.account.optional}
                </span>
                <input type="password" name="password" dir="ltr" minLength={8} maxLength={255} autoComplete="new-password" className={`${control} ${locale === "ar" ? "text-right" : "text-left"}`} />
              </label>
            </div>
            <p className="text-caption leading-[1.5] text-[var(--color-ink-subtle)] lg:text-body-s">{m.account.setPasswordHint}</p>
          </section>
        )}

        {/* Sticky at the bottom on the phone, where this page has no tab bar. */}
        <div className={`${PAY_BAR} lg:items-start`}>
          <SubmitButton className={`${CTA_BUTTON} justify-center lg:w-auto lg:px-10`}>
            {m.account.save}
          </SubmitButton>
        </div>
      </form>

      <form id={EMAIL_FORM} action={startEmailChange} hidden>
        <input type="hidden" name="locale" value={locale} />
        {stockAlertNext ? <input type="hidden" name="next" value={stockAlertNext} /> : null}
      </form>
    </section>
  );
}
