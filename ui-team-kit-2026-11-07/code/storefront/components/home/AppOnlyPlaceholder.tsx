import type { AppOnlyBlock } from "@/lib/home/sections";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * A block only the customer app draws, standing in for it on the dashboard's
 * APP preview (Plan 4b) — so staff see where it sits and, for the quick
 * actions, what they built. The live site never renders this: `layoutSections`
 * produces it only for that preview.
 */
export function AppOnlyPlaceholder({ locale, block, labels }: { locale: Locale; block: AppOnlyBlock; labels: readonly string[] }) {
  const m = messagesFor(locale).home.appOnly;
  const title = block === "quick_actions" ? m.quickActions : block === "reorder" ? m.reorder : m.loyalty;

  return (
    <section
      className="mx-4 mt-6 rounded-[10px] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-chip)] p-4 text-center"
      aria-label={title}
    >
      <p className="text-body-s font-semibold text-[var(--color-ink-subtle)]">{title}</p>
      {labels.length > 0 ? (
        <ul className="mt-3 flex flex-wrap justify-center gap-2">
          {labels.map((label, index) => (
            <li key={`${index}-${label}`} className="rounded-full bg-[var(--color-surface-subtle)] px-3 py-1 text-body-s text-[var(--color-ink)]">
              {label}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
