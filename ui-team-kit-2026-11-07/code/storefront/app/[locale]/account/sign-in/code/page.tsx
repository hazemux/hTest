import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { AuthShell, AuthSubmit, CodeInput } from "@/components/account/AuthShell";
import { DeviceSignalField } from "@/components/account/DeviceSignalField";
import { finishOtpSignIn, resendOtp } from "@/lib/account/actions";
import { readPendingOtp } from "@/lib/account/pending-otp";
import { isLocale } from "@/lib/i18n/locales";
import { isInternalPath } from "@/lib/navigation/internal-path";
import { messagesFor } from "@/lib/i18n/messages";
import { SubmitButton } from "@/components/ui/SubmitButton";

/**
 * Step two of the OTP sign-in — Figma `6507:14486` ("رمز التأكيد"): heading,
 * a line saying where the code went, the code, a resend link, one button.
 *
 * ONE FIELD, NOT THE COMP'S FIVE BOXES, and this is a deliberate deviation with
 * two reasons. The comp draws five per-digit boxes; the API issues SIX digits
 * (`config('otp.code_length')`), so the drawn control cannot hold a real code.
 * And per-digit boxes need JavaScript to auto-advance and to accept a PASTE —
 * which is the actual flow here, since the code arrives in WhatsApp and gets
 * copied. Without JS a paste fills only the first box. One field with
 * `autocomplete="one-time-code"` accepts the paste, lets iOS and Android
 * autofill it from the notification, and works with scripting off.
 *
 * THE NUMBER IS NOT ON THIS PAGE, in the URL or in a hidden field. It is in the
 * HttpOnly cookie step one set (`lib/account/pending-otp.ts`), and the action
 * reads it from there. A phone number in a query string ends up in browser
 * history, access logs and the `Referer` of every outbound link.
 *
 * Reaching this URL without having asked for a code sends the customer back to
 * step one rather than showing an input that cannot possibly work.
 *
 * The screen looks identical whether or not that number belongs to an existing
 * customer — `POST /auth/otp/request` answers 204 either way on purpose, and
 * step one never inspects the response, so there is nothing here that could
 * confirm an account exists.
 */
export default async function OtpCodePage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; next?: string; remember?: string; sent?: string; flow?: string }>;
}) {
  // Per request, always: a step of signing in, signing up or resetting a password; its state is in cookies and the query.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const { error, next, remember, sent, flow } = await props.searchParams;
  const m = messagesFor(locale);

  // The same step serves signing in and signing up (the comp draws one code
  // screen); this only decides where "change number" leads back to.
  const start = flow === "sign-up" ? "sign-up" : "sign-in";

  const pending = await readPendingOtp();
  if (!pending) redirect(`/${locale}/account/${start}?error=challenge_expired`);

  // Same rule as the action that receives it — a hidden input is a thing a
  // customer (or a crafted link) can edit, so both ends check.
  const back = isInternalPath(next) ? next : "";

  // Carried through the steps so "remember me", ticked on step one where the
  // comp draws it, still decides the cookie minted here — and so a failed
  // code still leads back to the screen the customer started on.
  const carriedFields = (
    <>
      {remember === "1" ? <input type="hidden" name="remember" value="1" /> : null}
      {start === "sign-up" ? <input type="hidden" name="flow" value="sign-up" /> : null}
    </>
  );

  const startHref = `/${locale}/account/${start}${back ? `?next=${encodeURIComponent(back)}` : ""}`;

  return (
    <AuthShell
      locale={locale}
      active={null}
      backHref={startHref}
      title={m.account.codeTitle}
      // The number the code went to (the challenge cookie — this browser's
      // own), so a customer who mistyped it sees so before waiting.
      lead={
        <>
          {m.account.codeSentTo}{" "}
          <bdi dir="ltr" className="font-bold text-[var(--color-ink)]">
            {pending}
          </bdi>{" "}
          ·{" "}
          <Link href={startHref} className="font-bold text-[var(--color-brand-500)]">
            {m.account.changeNumber}
          </Link>
        </>
      }
      error={error}
    >
      {sent === "1" && !error ? (
        <p role="status" className="mb-4 rounded-[10px] bg-[var(--color-primary-wash-lighter)] px-3 py-2.5 text-body-s font-semibold text-[var(--color-brand-500)] lg:text-body-l">
          {m.account.codeResent}
        </p>
      ) : null}

      <form action={finishOtpSignIn} className="flex flex-col gap-5">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="next" value={back} />
        <DeviceSignalField />
        {carriedFields}

        <CodeInput label={m.account.code} />

        <AuthSubmit>{m.account.verifyCode}</AuthSubmit>
      </form>

      {/* «لم تتلقَ الرمز؟ إعادة إرسال الرمز». A POST, because it sends a
          WhatsApp message — a GET link would let a prefetcher fire it. */}
      <form action={resendOtp} className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="next" value={back} />
        <DeviceSignalField />
        {carriedFields}
        <span className="text-body-s font-semibold text-[var(--color-ink-subtle)] lg:text-body-l">{m.account.noCode}</span>
        <SubmitButton className="text-body-s font-bold text-[var(--color-brand-500)] lg:text-body-l">
          {m.account.resendCode}
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
