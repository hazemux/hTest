import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * «الخطوة 2 من 3» over the add-email flow's pages (Claude Design canvas «Add
 * email flow», 2026-10-27): a line of text for screen readers and a bar per
 * step, the ones done in brand blue. Three steps when the API asked for a
 * step-up, two when it did not — the count is what this customer really has.
 */
export function AddEmailStepper({ locale, step, total }: { locale: Locale; step: number; total: number }) {
  const label = messagesFor(locale)
    .account.addEmailStep.replace("{n}", step.toLocaleString(locale === "ar" ? "ar-EG" : "en-US"))
    .replace("{total}", total.toLocaleString(locale === "ar" ? "ar-EG" : "en-US"));

  return (
    <div className="mb-5 flex flex-col gap-2">
      <span className="text-caption font-semibold text-[var(--color-ink-muted)] lg:text-body-s">{label}</span>
      <div aria-hidden className="flex gap-1.5">
        {Array.from({ length: total }, (_, index) => (
          <span key={index} className={`h-1 flex-1 rounded-[2px] ${index < step ? "bg-[var(--color-brand-500)]" : "bg-[var(--color-line)]"}`} />
        ))}
      </div>
    </div>
  );
}
