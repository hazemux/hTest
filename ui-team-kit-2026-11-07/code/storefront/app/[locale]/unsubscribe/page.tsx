import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { SubmitButton } from "@/components/ui/SubmitButton";
import { unsubscribeFromLink } from "@/lib/account/consent-actions";
import { isSignedIn } from "@/lib/account/session";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ t?: string | string[]; state?: string; channel?: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  // Never indexed — also by `X-Robots-Tag` (next.config.ts, PRIVATE_ROUTES).
  return isLocale(locale) ? { title: messagesFor(locale).unsubscribe.title, robots: { index: false, follow: false } } : {};
}

/**
 * «إيقاف التذكيرات والعروض» — where the link in a reminder or an offer lands
 * (contract v0.1.91; the owner, 2026-10-04 and 2026-10-18). The API writes
 * `/{ar|en}/unsubscribe?t=…` into every such message (`UnsubscribeLink`),
 * a customer's AND a guest's cart reminder (ADR 0039 §4).
 *
 * NO COMP for this screen: built to the design system, on the recovery
 * confirm page's own pattern (its heading, lead and primary button).
 *
 * NO SIGN-IN: someone who wants the messages to stop is never asked to log
 * in. The signed token names the person (or the guest's address) and the
 * channel, and can only ever STOP that channel.
 *
 * ONE BUTTON, NOT AN AUTOMATIC UNSUBSCRIBE. Mail scanners and link previews
 * open links; a page that unsubscribed on opening would unsubscribe people
 * who never asked. The page says what will happen, and the post does it.
 *
 * GUEST-SAFE ENDINGS. Whoever lands here may have no account — the
 * reminder went to the address a guest typed at checkout — so «done» and
 * «not valid» send only a signed-in visitor to Settings. Anyone else is told
 * they can opt in again at their next checkout, which is the one place a
 * guest gives that consent.
 *
 * The URL carries the token, so this route is a PRIVATE_ROUTE: noindex by
 * header and `same-origin` referrers. Not `no-referrer` — the button is a
 * Server Action, and under `no-referrer` the browser posts `Origin: null`
 * (HANDBOOK §2).
 */
export default async function UnsubscribePage(props: Props) {
  // Per request, always: the outcome is in the query and the session in a cookie.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const { t, state, channel } = await props.searchParams;
  const m = messagesFor(locale);
  const u = m.unsubscribe;
  const token = typeof t === "string" ? t : "";
  const view: "done" | "invalid" | "ask" = state === "done" ? "done" : state === "invalid" || token === "" ? "invalid" : "ask";
  const signedIn = view === "ask" ? false : await isSignedIn();

  return (
    <main className="mx-auto w-full max-w-[640px] flex-1 px-6 pb-16 pt-6 lg:pt-[70px]">
      <h1 className="text-heading-m font-bold leading-[1.4] text-[var(--color-ink)] lg:text-display">{u.title}</h1>

      {view === "ask" ? (
        <form action={unsubscribeFromLink} className="mt-2 flex flex-col gap-6">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="t" value={token} />
          <p className="text-body-m font-medium leading-[1.5] text-[var(--color-ink-muted)] lg:text-body-l">{u.ask}</p>
          {state === "retry" ? (
            <p role="alert" className="rounded-[10px] bg-[var(--color-error-subtlest)] px-3 py-2.5 text-caption font-bold text-[var(--color-danger)] lg:text-body-s">
              {u.retry}
            </p>
          ) : null}
          <SubmitButton className={PRIMARY}>{u.confirm}</SubmitButton>
        </form>
      ) : view === "done" ? (
        <>
          <p role="status" className="mt-2 text-body-m font-medium leading-[1.5] text-[var(--color-ink)] lg:text-body-l">
            {u.done.replace("{channel}", channelPhrase(locale, channel))}
          </p>
          <Ending locale={locale} signedIn={signedIn} signedInText={u.doneSignedIn} guest={{ text: u.doneGuest, href: `/${locale}`, label: u.toStore }} />
        </>
      ) : (
        <>
          <p role="alert" className="mt-2 text-body-m font-medium leading-[1.5] text-[var(--color-ink)] lg:text-body-l">
            {u.invalid}
          </p>
          <Ending
            locale={locale}
            signedIn={signedIn}
            signedInText={u.invalidSignedIn}
            guest={{ text: u.invalidGuest, href: `/${locale}/contact-us`, label: m.pages.contactUs }}
          />
        </>
      )}
    </main>
  );
}

/** «عبر واتساب» / "on WhatsApp" — the channel the API said it stopped. */
function channelPhrase(locale: Locale, channel: string | undefined): string {
  const u = messagesFor(locale).unsubscribe;
  return channel === "whatsapp" ? u.channelWhatsapp : channel === "email" ? u.channelEmail : channel === "push" ? u.channelPush : u.channelUnknown;
}

/** Settings for someone who has them; a guest never gets a link to Settings they do not have. */
function Ending({
  locale,
  signedIn,
  signedInText,
  guest,
}: {
  locale: Locale;
  signedIn: boolean;
  signedInText: string;
  guest: { text: string; href: string; label: string };
}) {
  const u = messagesFor(locale).unsubscribe;
  return (
    <>
      <p className="mt-2 text-body-s font-medium leading-[1.5] text-[var(--color-ink-muted)] lg:text-body-l">{signedIn ? signedInText : guest.text}</p>
      <Link href={signedIn ? `/${locale}/account/settings#marketing` : guest.href} className={`mt-6 inline-block ${PRIMARY_LINK}`}>
        {signedIn ? u.toSettings : guest.label}
      </Link>
    </>
  );
}

const PRIMARY =
  "h-[52px] w-full rounded-[12px] bg-[var(--color-brand-500)] px-4 text-body-m font-bold text-[var(--color-on-cta)] transition hover:bg-[var(--color-primary-hover)] active:scale-[0.99]";
const PRIMARY_LINK =
  "rounded-[12px] bg-[var(--color-brand-500)] px-6 py-3 text-body-m font-bold text-[var(--color-on-cta)] transition hover:bg-[var(--color-primary-hover)] active:scale-[0.99]";
