import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * «قريباً» over a screen that is drawn but not yet live (the owner,
 * 2026-09-30: the wallet top-up and VIP are shown, blurred, until they open).
 *
 * WHAT IS UNDERNEATH IS A PICTURE, NOT A FORM. `inert` takes it out of the tab
 * order and the accessibility tree, `aria-hidden` says so to older readers,
 * and callers pass markup with no action behind it — nothing on these pages
 * can start a payment or reach an endpoint. A screen reader hears the badge
 * and its line, and nothing else.
 */
export function ComingSoon({ locale, lead, children }: { locale: Locale; lead: string; children: React.ReactNode }) {
  const m = messagesFor(locale);

  return (
    <div className="relative isolate overflow-hidden rounded-[16px]">
      <div inert aria-hidden className="pointer-events-none select-none blur-[6px]">
        {children}
      </div>
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[var(--color-surface)]/40 p-6 text-center">
        <span className="rounded-[40px] px-6 py-2 text-heading-m font-bold text-[var(--color-on-primary)]" style={{ backgroundImage: "var(--gradient-toggle-active)" }}>
          {m.common.comingSoon}
        </span>
        <p className="max-w-[320px] text-body-s font-semibold lg:text-body-l leading-[1.5] text-[var(--color-ink)]">{lead}</p>
      </div>
    </div>
  );
}
