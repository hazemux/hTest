import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AccountShell } from "@/components/account/AccountShell";
import { PasskeyButton } from "@/components/account/PasskeyButton";
import { requireCustomer } from "@/lib/account/guard";
import { removePasskeyAction } from "@/lib/account/passkey-actions";
import { listMyPasskeys } from "@/lib/api/client";
import { isLocale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { formatStoreDateTime } from "@/lib/i18n/time";
import { SubmitButton } from "@/components/ui/SubmitButton";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ added?: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  return isLocale(locale) ? { title: messagesFor(locale).account.passkeys } : {};
}

/**
 * «مفاتيح المرور» (v0.1.61): the customer's passkeys — add one (a step-up
 * code first, then the device's own prompt), see when each was last used,
 * remove one. No Figma comp: the security list's rows and the account frame.
 */
export default async function PasskeysPage(props: Props) {
  // Per request, always: this page is somebody's account.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const m = messagesFor(locale);
  const { token } = await requireCustomer(locale, `/${locale}/account/settings/security/passkeys`);
  // Removed by PUBLIC id (ADR 0037); a passkey that arrives without one is
  // listed without the control that could not name it.
  const passkeys = await listMyPasskeys({ locale, bearerToken: token }).then((r) => r.data).catch(() => null);
  const { added } = await props.searchParams;
  // The device is read from the list, never from the address, so a link cannot
  // put its own words in the confirmation.
  const newest = passkeys?.reduce<(typeof passkeys)[number] | null>(
    (latest, passkey) => (!latest || (passkey.created_at ?? "") > (latest.created_at ?? "") ? passkey : latest),
    null,
  );

  return (
    <AccountShell locale={locale} active="settings">
      <div className="flex flex-col gap-5 lg:max-w-[560px]">
        <h2 className="text-body-l font-semibold leading-[1.5] text-[var(--color-ink)] lg:text-heading-l lg:font-bold">{m.account.passkeys}</h2>
        <p className="text-body-s leading-[1.5] text-[var(--color-ink-muted)] lg:text-body-l">{m.account.passkeysLead}</p>

        {added === "1" ? (
          <p role="status" className="cq-notice-auto rounded-[12px] bg-[var(--color-success-wash)] px-4 py-3 text-body-s font-semibold text-[var(--color-success)] lg:text-body-l">
            {newest?.name ? m.account.passkeyAddedOn.replace("{device}", newest.name) : m.account.passkeyAdded}
          </p>
        ) : null}

        {passkeys === null ? (
          <p className="text-body-s text-[var(--color-ink-subtle)] lg:text-body-l">{m.account.sectionUnavailable}</p>
        ) : passkeys.length === 0 ? (
          <p className="text-body-s text-[var(--color-ink-subtle)] lg:text-body-l">{m.account.passkeyNone}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {passkeys.map((passkey) => (
              <li key={passkey.public_id ?? `${passkey.name}:${passkey.created_at ?? ""}`} className="flex items-center justify-between gap-3 rounded-[12px] border border-[var(--color-line)] p-4">
                <div className="flex flex-col gap-1">
                  <span className="text-body-m font-semibold text-[var(--color-ink)] lg:text-body-l">{passkey.name}</span>
                  <span className="text-caption text-[var(--color-ink-subtle)] lg:text-body-s">
                    {passkey.last_used_at
                      ? m.account.passkeyLastUsed.replace("{date}", formatStoreDateTime(locale, passkey.last_used_at))
                      : m.account.passkeyNeverUsed}
                    {passkey.synced ? ` · ${m.account.passkeySynced}` : ""}
                  </span>
                </div>
                {passkey.public_id ? (
                  <form action={removePasskeyAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="passkey_id" value={passkey.public_id} />
                    <SubmitButton className="text-body-s font-semibold text-[var(--color-error)] lg:text-body-l">
                      {m.account.passkeyRemove}
                    </SubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <PasskeyButton
          mode="add"
          locale={locale}
          label={m.account.passkeyAdd}
          failedLabel={m.account.passkeyFailed}
          deviceName={locale === "ar" ? "مفتاح مرور" : "Passkey"}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-[var(--color-brand-500)] text-body-m font-bold lg:text-body-l text-[var(--color-on-primary)] transition hover:bg-[var(--color-primary-hover)] lg:max-w-[420px]"
        />
      </div>
    </AccountShell>
  );
}
