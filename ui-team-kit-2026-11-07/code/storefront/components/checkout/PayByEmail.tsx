import Image from "next/image";

import { CopyButton } from "@/components/checkout/CopyButton";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * Australia's PayID and Canada's Interac e-Transfer (v0.1.148): an email the
 * customer's own bank pays to, a second way to pay the SAME account as the
 * bank details shown under it. Drawn first because it is the quicker one —
 * the customer types an email instead of four codes.
 *
 * No comp exists for it; built to the transfer page's own card and row
 * styles. Renders nothing for an account with neither (every other currency).
 */
export function PayByEmail({
  locale,
  accountName,
  payid,
  interacEmail,
  reference = "order",
}: {
  locale: Locale;
  /** What the customer quotes in an Interac message: the order number, or a top-up's reference. */
  reference?: "order" | "topUp";
  /** The beneficiary the customer's bank should show for the email. */
  accountName?: string | null;
  payid?: string | null;
  interacEmail?: string | null;
}) {
  const m = messagesFor(locale);
  const t = m.transfer.payByEmail;
  const option = payid
    ? { kind: "payid" as const, email: payid, title: t.payidTitle, help: t.payidHelp }
    : interacEmail
      ? {
          kind: "interac" as const,
          email: interacEmail,
          title: t.interacTitle,
          help: t.interacHelp.replace("{reference}", reference === "topUp" ? t.referenceTopUp : t.referenceOrder),
        }
      : null;

  if (!option) return null;

  return (
    <section className="space-y-3 rounded-[16px] border-2 border-[var(--color-brand-500)] bg-[var(--color-surface)] p-4 lg:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-heading-m lg:text-heading-l font-bold text-[var(--color-ink)]">
          {option.kind === "payid" ? withPayIdMark(option.title) : option.title}
        </h2>
        {option.kind === "payid" ? <PayIdMark /> : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-divider)] pb-3">
        <span className="text-body-s lg:text-body-l text-[var(--color-ink-muted)]">{t.email}</span>
        <span className="flex min-w-0 items-center gap-2">
          <span dir="ltr" className="break-all font-semibold text-[var(--color-ink)]">
            {option.email}
          </span>
          <CopyButton value={option.email} label={m.transfer.copy} copiedLabel={m.transfer.copied} accessibleName={`${m.transfer.copy} ${t.email}`} />
        </span>
      </div>
      <p className="text-body-s lg:text-body-l text-[var(--color-ink)]">{withName(option.help, accountName)}</p>
      {/* The trade mark footnote PayID's guidelines make mandatory wherever it is named. */}
      {option.kind === "payid" ? <p className="text-caption text-[var(--color-ink-muted)]">{t.payidTrademark}</p> : null}
    </section>
  );
}

/**
 * The official PayID brandmark (AP+ brand portal, 2026-10-30), unaltered: the
 * black mark on the light theme, the white one on the dark — the guidelines'
 * two versions — at their 42px digital minimum height. Decorative: the
 * heading beside it already says PayID.
 *
 * Interac's e-Transfer mark is only issued through its brand centre (a
 * merchant login), so Canada's block names Interac in words until one is.
 */
function PayIdMark() {
  return (
    <span className="shrink-0">
      <Image src="/brand/payid-mark.svg" width={76} height={42} alt="" aria-hidden unoptimized className="cq-light-theme-only h-[42px] w-auto" />
      <Image src="/brand/payid-mark-dark.svg" width={76} height={42} alt="" aria-hidden unoptimized className="cq-dark-theme-only h-[42px] w-auto" />
    </span>
  );
}

/**
 * PayID's brand rules: ® on the first, most prominent mention, in superscript.
 * «PayID®» is isolated left-to-right so an Arabic heading does not paint the
 * ® on the wrong side of the word («®PayID»).
 */
function withPayIdMark(title: string) {
  const [before, after] = title.split("PayID");
  if (after === undefined) return title;

  return (
    <>
      {before}
      <bdi dir="ltr">
        PayID<sup>®</sup>
      </bdi>
      {after}
    </>
  );
}

/** `{name}` in the help text, isolated so an Arabic sentence does not reorder a Latin name. */
function withName(text: string, name?: string | null) {
  const [before, after] = text.split("{name}");
  if (after === undefined) return text;

  return (
    <>
      {before}
      <bdi dir="ltr" className="font-semibold">
        {name}
      </bdi>
      {after}
    </>
  );
}
