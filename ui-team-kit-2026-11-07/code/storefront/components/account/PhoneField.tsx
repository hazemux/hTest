"use client";

import Image from "next/image";
import { useId, useState } from "react";

/**
 * The phone field as «Auth Mobile» (Claude Design, 2026-09-30) draws it: one
 * 60-tall control holding the country — flag and calling code — then the
 * number in 18px digits. The WHOLE control is LTR, so a number never reorders
 * on the Arabic page.
 *
 * THE PICKER IS THE PLATFORM'S OWN. A native `<select name="dial">` lies over
 * the flag and code, so a tap opens the phone's own list (a bottom sheet on
 * iOS and Android) and the form posts the choice with or without a script.
 * With one, the flag and code follow the choice.
 *
 * The server joins the two (`phoneFromParts`): the chosen country's code in
 * front, the national zero dropped — and a number typed in full with «+» or
 * «00» taken as typed.
 */
export function PhoneField({
  label,
  countryLabel,
  hint,
  countries,
  defaultCountry,
  name = "phone",
  autoFocus = false,
}: {
  label: string;
  /** The picker's accessible name — «رمز الدولة». */
  countryLabel: string;
  /** The WhatsApp line under the field. */
  hint?: string;
  countries: readonly { code: string; name: string; dial: string; flag: string | null }[];
  defaultCountry: string;
  name?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [country, setCountry] = useState(
    countries.some((each) => each.code === defaultCountry) ? defaultCountry : (countries[0]?.code ?? ""),
  );
  const chosen = countries.find((each) => each.code === country) ?? countries[0];

  return (
    <div className="flex w-full flex-col gap-2">
      <label htmlFor={id} className="text-body-l font-bold text-[var(--color-ink)] lg:text-heading-m">
        {label}
      </label>
      <div
        dir="ltr"
        className="flex h-[60px] overflow-hidden rounded-[12px] bg-[var(--color-field)] focus-within:shadow-[inset_0_0_0_2px_var(--color-brand-500)]"
      >
        <span className="relative flex shrink-0 items-center gap-1.5 bg-[var(--color-bg-subtle)] px-3">
          {chosen?.flag ? (
            <Image src={chosen.flag} alt="" aria-hidden width={24} height={17} unoptimized className="h-[17px] w-6 rounded-[3px] object-cover" />
          ) : null}
          <span className="text-body-l font-bold text-[var(--color-ink)]">+{chosen?.dial}</span>
          <span aria-hidden className="block size-3.5 bg-[var(--color-ink-subtle)] [mask-image:url(/brand/icon-chevron-down.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
          <select
            name="dial"
            aria-label={countryLabel}
            value={country}
            onChange={(event) => setCountry(event.currentTarget.value)}
            className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0"
          >
            {countries.map((each) => (
              <option key={each.code} value={each.code}>
                {each.name} (+{each.dial})
              </option>
            ))}
          </select>
        </span>
        <input
          id={id}
          name={name}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          required
          autoFocus={autoFocus}
          placeholder="XX XXX XXXX"
          className="w-0 min-w-0 flex-1 bg-transparent px-3.5 text-heading-m font-semibold tracking-[0.5px] text-[var(--color-ink)] outline-none placeholder:font-normal placeholder:text-[var(--color-ink-subtle)]"
        />
      </div>
      {hint ? (
        <p className="flex items-start gap-1.5 text-caption leading-[1.6] text-[var(--color-ink-subtle)] lg:text-body-s lg:font-medium">
          <span aria-hidden className="mt-0.5 block size-[15px] shrink-0 bg-[var(--color-success)] [mask-image:url(/brand/icon-whatsapp.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
          {hint}
        </p>
      ) : null}
    </div>
  );
}
