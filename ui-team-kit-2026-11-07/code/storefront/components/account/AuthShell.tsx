import Image from "next/image";
import Link from "next/link";

import { authHref } from "@/lib/account/auth-href";
import { isAuthErrorCode } from "@/lib/account/errors";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { SubmitButton } from "@/components/ui/SubmitButton";

/**
 * The sign-in / sign-up screen — «Auth Mobile» (Claude Design, 2026-09-30),
 * over the Figma frame `6507:14231` it replaces on the phone.
 *
 * ON THE PHONE: the two tabbed screens (sign-in, sign-up) open with a close
 * button back to the store and the 72px logo, the tabs centred under it; a
 * step screen (the code, the reset) has a back button and its own title
 * instead. From `lg` the artwork half returns beside the form.
 *
 * THE SPLIT IS DOM ORDER, NOT A DIRECTION CONDITIONAL. The comp is Arabic, and
 * draws the form on the RIGHT with the artwork on the LEFT — which in RTL means
 * the form is at the inline START. So the form is the FIRST child and the panel
 * the second, and the whole screen mirrors correctly for English with no
 * `ltr:`/`rtl:` anywhere. Every alignment below is logical (`items-start`,
 * `text-start`) rather than the `items-end`/`text-right` Figma's LTR-assuming
 * export produces — those would pin the form to the wrong edge on the Arabic
 * page, which is the default page.
 *
 * WHAT THE COMP DRAWS THAT IS NOT HERE, and why (the same honesty the home page
 * applies to its cart and wallet):
 *
 *   - A phone / email RADIO for the code's delivery channel. `POST
 *     /auth/otp/request` in `openapi/v1.yaml` requires `phone` and declares NO
 *     `email` property at all, so the email half cannot be sent by a client
 *     generated from the contract. The Laravel side does accept one — that
 *     drift is reported, not coded around. WhatsApp to a phone is what ships.
 *   - THREE SOCIAL BUTTONS (X, Apple, Google). `POST /auth/social/{provider}`
 *     is declared in the contract as "**Not implemented (post-v1)**". Three
 *     buttons that answer 404 are worse than an honest gap.
 *
 * The panel is DESKTOP ONLY. It is decoration, it costs 240KB, and this store's
 * customers are mostly on mobile data — a sign-in form must not wait on a
 * picture.
 */
export function AuthShell({
  locale,
  active,
  title,
  lead,
  error,
  children,
  footer,
  backHref,
  next,
}: {
  locale: Locale;
  /** Which half of the toggle is current. `null` on the code step, which the comp draws with a heading instead. */
  active: "sign-in" | "sign-up" | null;
  title?: string;
  /** A line under the title — words, or words with the number the code went to. */
  lead?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** A step screen's way back (the code → the screen it came from). */
  backHref?: string;
  /** The page to come back to (`?next=`, already checked internal) — kept when switching sign-in ↔ sign-up. */
  next?: string;
}) {
  const m = messagesFor(locale);

  // An unrecognised `error` renders NOTHING rather than itself. The query
  // string is attacker-controllable, and echoing it back would be a way to put
  // arbitrary text on the page that asks for a password.
  const message = error && isAuthErrorCode(error) ? m.account.errors[error] : null;

  return (
    // FULL SCREEN, no site chrome (the layout drops it on these routes): the
    // form centred in one half, the artwork filling the other on desktop.
    <main className="flex w-full flex-1">
      <div className="grid min-h-dvh w-full bg-[var(--background)] lg:grid-cols-2 lg:bg-[var(--color-surface-raised)]">
        <div className="relative flex flex-col items-center px-6 pb-8 pt-9 lg:justify-center lg:px-10 lg:py-8">
          <div className="flex w-full max-w-[380px] flex-col gap-5">
            {backHref ? (
              <Link href={backHref} aria-label={m.account.back} className="-ms-2 grid size-10 place-items-center rounded-[12px]">
                <span
                  aria-hidden
                  className="block size-6 bg-[var(--color-ink)] [mask-image:url(/brand/icon-chevron-start.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:5.5px_11.5px] rtl:-scale-x-100"
                />
              </Link>
            ) : (
              <>
                {/* With no header on these screens, the close is the way back
                    to the store — to the page the customer came from, when
                    they came from one (`next`, already checked internal). */}
                <Link
                  href={next ?? `/${locale}`}
                  aria-label={m.account.closeToStore}
                  className="absolute start-4 top-4 z-[2] grid size-9 place-items-center rounded-full bg-[var(--color-chip)] lg:hidden"
                >
                  <span aria-hidden className="block size-3 bg-[var(--color-ink)] [mask-image:url(/brand/icon-close.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
                </Link>
                <Link href={`/${locale}`} className="self-center lg:hidden">
                  <Image src="/brand/logo-chargerquick.svg" alt={m.common.storeName} width={86} height={96} className="cq-light-theme-only h-[72px] w-auto" />
                  <Image src="/brand/logo-chargerquick-mark-light.svg" alt="" aria-hidden width={86} height={96} className="cq-dark-theme-only h-[72px] w-auto" />
                </Link>
              </>
            )}

            {/* THE PAGE ALWAYS HAS AN H1, even when the comp draws no heading.
                On sign-in and sign-up the toggle IS the title visually, so the
                heading is `sr-only`; a step passes a real `title`. */}
            {title ? (
              <div className="mt-2 flex flex-col gap-1.5">
                <h1 className="text-display font-bold leading-[1.4] text-[var(--color-ink)]">{title}</h1>
                {lead ? <p className="text-body-s leading-[1.7] text-[var(--color-ink-muted)] lg:text-heading-l lg:font-medium">{lead}</p> : null}
              </div>
            ) : (
              <h1 className="sr-only">{active === "sign-up" ? m.account.signUp : m.account.signIn}</h1>
            )}

            {active ? <AuthToggle locale={locale} active={active} next={next} /> : null}

            {message ? (
              // `role="alert"` so a screen reader announces the refusal rather
              // than leaving someone re-submitting a form that keeps failing
              // with no spoken explanation.
              <p role="alert" className="w-full rounded-[10px] bg-[var(--color-error-subtlest)] px-3 py-2.5 text-body-s font-semibold leading-[1.5] text-[var(--color-danger)] lg:text-body-l">
                {message}
              </p>
            ) : null}

            <div className="w-full">{children}</div>

            {footer ? <div className="w-full text-center text-body-s text-[var(--color-ink-muted)] lg:text-body-l">{footer}</div> : null}
          </div>
        </div>

        <AuthPanel locale={locale} />
      </div>
    </main>
  );
}

/**
 * The pill toggle from the comp (`6507:14325`): a brand-wash track with the
 * current half filled by the design's own five-stop gradient.
 *
 * TWO LINKS, NOT A TABBED WIDGET. Sign-in and sign-up are separate URLs with
 * separate forms, so a customer can bookmark either, open one in a new tab, and
 * reach both with JavaScript switched off. A hydrated tab control would buy
 * nothing and cost a round-trip on a mobile connection.
 */
function AuthToggle({
  locale,
  active,
  next,
}: {
  locale: Locale;
  active: "sign-in" | "sign-up";
  next?: string;
}) {
  const m = messagesFor(locale);

  // Switching half keeps the page the customer came from, so signing UP from
  // a product page also lands back on it.
  const halves = [
    { key: "sign-in" as const, href: authHref(locale, "sign-in", next), label: m.account.signIn },
    { key: "sign-up" as const, href: authHref(locale, "sign-up", next), label: m.account.signUp },
  ];

  return (
    <nav aria-label={m.account.signIn} className="flex items-center self-center rounded-[30px] bg-[var(--color-primary-wash-lighter)] p-[3px]">
      {halves.map((half) =>
        half.key === active ? (
          <span
            key={half.key}
            aria-current="page"
            className="rounded-[40px] bg-[var(--color-brand-500)] px-[18px] py-[9px] text-body-m font-bold text-[var(--color-on-cta)] lg:text-heading-m"
          >
            {half.label}
          </span>
        ) : (
          <Link key={half.key} href={half.href} className="rounded-[40px] px-[18px] py-[9px] text-body-m font-semibold text-[var(--color-ink-muted)] lg:text-heading-m">
            {half.label}
          </Link>
        ),
      )}
    </nav>
  );
}

/**
 * The artwork half.
 *
 * `aria-hidden` throughout and no alt text: it is a mood plate of game cards,
 * it says nothing a customer needs, and a screen reader reading "a grid of game
 * top-up cards" before the sign-in form is noise.
 */
function AuthPanel({ locale }: { locale: Locale }) {
  const m = messagesFor(locale);

  return (
    <div className="relative hidden min-h-dvh overflow-hidden bg-[var(--color-brand-900)] lg:block">
      <Image
        src="/brand/auth-panel.webp"
        alt=""
        aria-hidden
        fill
        sizes="(min-width: 1024px) 50vw, 0px"
        // A file from public/: served as itself, never through
        // `/_next/image` (HANDBOOK §7 item 8).
        unoptimized
        className="object-cover"
      />
      {/* The comp's darkening plate — without it the logo sits on busy artwork
          and loses its edges. Mixed from the ramp's darkest step rather than a
          hex literal or a generic black. */}
      <div aria-hidden className="absolute inset-0 bg-[var(--color-brand-950)]/30" />

      {/* Geometry from the comp: the logo spans 66% of the panel, its reading
          edge 17% in from the panel's inline start. */}
      {/* A link home: with no header on these screens, the logo is the way
          back, as it is on the phone. */}
      <Link href={`/${locale}`} className="absolute start-[17%] top-1/2 w-[66%] -translate-y-1/2">
        <Image
          src="/brand/logo-chargerquick-light.svg"
          alt={m.common.storeName}
          width={487}
          height={160}
          className="w-full"
        />
      </Link>

      {/* THE ONE MIRRORED THING ON THE PAGE, and the exception that proves the
          rule. This is the comp's torn white edge where the plate meets the
          form; its teeth point AT the form, so unlike a margin it genuinely has
          a handedness and must flip with the language. Safe to express as an
          `ltr:` variant here precisely because `app/[locale]/layout.tsx` derives
          `lang` and `dir` from one value — see HANDBOOK §4 on why Tailwind's
          `ltr:` compiles to a lang-OR-dir test and why that line must stay as it
          is. Decorative, so nothing is announced either way. */}
      <Image
        src="/brand/auth-panel-shape.svg"
        alt=""
        aria-hidden
        width={382}
        height={768}
        // The comp's own proportions: the shape is 52% of the panel's width and
        // hangs 27% off its inline start, so only the torn quarter shows and
        // the rest is clipped away. Sized in per cent rather than pixels
        // because this panel is fluid where the 1360 comp was fixed.
        className="absolute inset-y-0 start-[-27%] h-full w-[52%] max-w-none ltr:-scale-x-100"
      />
    </div>
  );
}

/**
 * A labelled input, drawn to the comp's `id input` (`6507:14343`): a 6% grey
 * fill, 12px radius, 16px padding, with the label above at 18px semibold.
 *
 * `dir` is a REQUIRED prop with no default, because getting it wrong is the
 * whole bug class this component exists to prevent: a phone number, an email
 * address or a verification code rendered right-to-left on the Arabic page
 * shows its groups reordered, and the customer reads back — or copies — the
 * wrong value. A NAME is the exception that inherits the page, which is why
 * there is no blanket `dir="ltr"` here.
 */
export function AuthField({
  label,
  name,
  type,
  dir,
  required,
  placeholder,
  hint,
  autoComplete,
  inputMode,
  maxLength,
  defaultValue,
  placeholderFollowsPage,
}: {
  label: string;
  name: string;
  type: "text" | "tel" | "email" | "password";
  dir: "ltr" | "auto";
  required?: boolean;
  placeholder?: string;
  hint?: string;
  autoComplete?: string;
  inputMode?: "numeric" | "tel" | "email" | "text";
  maxLength?: number;
  /** Never for a password or a code — those are never echoed back into a page. */
  defaultValue?: string;
  /**
   * An ARABIC placeholder in an LTR field («برجاء كتابة البريد الالكتروني»)
   * reads from the page's edge, like the comp, while what is typed stays LTR.
   */
  placeholderFollowsPage?: boolean;
}) {
  return (
    <label className="block w-full">
      <span className="block text-body-l font-bold text-[var(--color-ink)] lg:text-heading-m">{label}</span>
      <input
        name={name}
        type={type}
        dir={dir}
        required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        defaultValue={defaultValue}
        className={`mt-2 h-[60px] w-full rounded-[12px] bg-[var(--color-field)] px-3.5 text-body-l font-semibold text-[var(--color-ink)] outline-none placeholder:font-normal placeholder:text-[var(--color-ink-subtle)] focus:shadow-[inset_0_0_0_2px_var(--color-brand-500)]${placeholderFollowsPage ? " rtl:placeholder:text-right" : ""}`}
      />
      {hint ? (
        <span className="mt-2 block text-caption leading-[1.6] text-[var(--color-ink-subtle)] lg:text-body-s lg:font-medium">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

/** The screen's one blue button («Auth Mobile»): 56 tall, 12px corners. */
export function AuthSubmit({ children }: { children: React.ReactNode }) {
  return (
    <SubmitButton
      className="flex h-14 w-full items-center justify-center rounded-[12px] bg-[var(--color-brand-500)] text-body-l font-bold text-[var(--color-on-cta)] transition lg:text-heading-m hover:bg-[var(--color-primary-hover)]"
    >
      {children}
    </SubmitButton>
  );
}

/**
 * The comp's "تذكرني" checkbox (`6507:14346`).
 *
 * IT DOES SOMETHING. Unchecked, the session cookie is written with no `maxAge`
 * and dies when the browser closes; checked, it lasts thirty days. A shared or
 * borrowed phone is common in this market, and a "remember me" that remembered
 * either way would be a control that lies about a credential.
 *
 * A NATIVE checkbox with `accent-color`, which is exactly the comp's blue box
 * with a white tick, and needs no JavaScript and no exported asset.
 */
export function AuthRemember({ label }: { label: string }) {
  return (
    <label className="flex w-full cursor-pointer items-center justify-start gap-2">
      <input
        type="checkbox"
        name="remember"
        value="1"
        defaultChecked
        className="size-5 accent-[var(--color-brand-500)]"
      />
      <span className="text-body-s font-bold text-[var(--color-ink)] lg:text-body-l">
        {label}
      </span>
    </label>
  );
}

/** «أو» between the code path and the other ways in: a rule, the word, a rule. */
export function AuthOr({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex w-full items-center gap-2.5 text-caption font-medium text-[var(--color-ink-subtle)] lg:text-body-l lg:font-semibold">
      <span aria-hidden className="h-px flex-1 bg-[var(--color-line)]" />
      {children}
      <span aria-hidden className="h-px flex-1 bg-[var(--color-line)]" />
    </p>
  );
}

/**
 * «المتابعة بحساب Apple / Google» — full-width, labelled, equal buttons
 * («Auth Mobile»: they replace the 28px circles, hard to spot and to tell
 * apart). Plain links to the hand-off, drawn only for a provider the API says
 * is configured.
 */
export function SocialButtons({
  locale,
  providers,
  next,
}: {
  locale: Locale;
  providers: { apple?: boolean; google?: boolean };
  next: string;
}) {
  const m = messagesFor(locale);
  const shown = (["apple", "google"] as const).filter((provider) => providers[provider]);
  if (shown.length === 0) return null;

  return (
    <>
      {shown.map((provider) => (
        <a
          key={provider}
          href={`/auth/start/${provider}?${new URLSearchParams({ locale, next: next || `/${locale}/account` })}`}
          className={`flex h-[52px] w-full items-center justify-center gap-2.5 whitespace-nowrap rounded-[12px] text-body-m font-bold focus-visible:outline lg:text-body-l focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] ${
            provider === "apple"
              ? "bg-[var(--color-ink)] text-[var(--background)]"
              : "bg-[var(--background)] text-[var(--color-ink)] shadow-[inset_0_0_0_1px_var(--color-line)]"
          }`}
        >
          <span
            aria-hidden
            className="block size-5 bg-current [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]"
            style={{ maskImage: `url(/brand/icon-social-${provider}.svg)`, WebkitMaskImage: `url(/brand/icon-social-${provider}.svg)` }}
          />
          {provider === "apple" ? m.account.signInWithApple : m.account.signInWithGoogle}
        </a>
      ))}
    </>
  );
}

/**
 * The code: one 56-tall field, the digits large and spaced, LTR everywhere,
 * the number pad, and `one-time-code` so the phone offers the code from the
 * message it just received.
 */
export function CodeInput({ label }: { label: string }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="sr-only">{label}</span>
      <input
        name="code"
        type="text"
        dir="ltr"
        required
        autoComplete="one-time-code"
        inputMode="numeric"
        maxLength={8}
        autoFocus
        placeholder="••••••"
        className="h-14 w-full rounded-[12px] bg-[var(--color-field)] px-3.5 text-center text-display font-bold tracking-[0.5em] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-subtle)] focus:shadow-[inset_0_0_0_2px_var(--color-brand-500)]"
      />
    </label>
  );
}
