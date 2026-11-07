"use client";

/**
 * A guest's «مشكلة في طلب؟» — the order number typed, WhatsApp opened with
 * the report sentence and that number ready.
 *
 * A PLAIN GET FORM TO WHATSAPP: without a script the chat opens with what was
 * typed; with one, the typed number is wrapped in the same sentence the order
 * page sends (`orderStatus.reportMessage`).
 */
export function ReportOrderForm({
  whatsapp,
  message,
  label,
  button,
}: {
  /** Digits only. */
  whatsapp: string;
  /** «مرحباً، لدي مشكلة في الطلب رقم {id}». */
  message: string;
  label: string;
  button: string;
}) {
  return (
    <form
      action={`https://wa.me/${whatsapp}`}
      method="get"
      target="_blank"
      onSubmit={(event) => {
        const field = event.currentTarget.elements.namedItem("text") as HTMLInputElement | null;
        if (field && field.value.trim() !== "") field.value = message.replace("{id}", field.value.trim());
      }}
      className="flex gap-2"
    >
      <label className="sr-only" htmlFor="report-order">
        {label}
      </label>
      <input
        id="report-order"
        name="text"
        dir="ltr"
        required
        maxLength={24}
        placeholder="CQ-100044"
        autoComplete="off"
        className="h-12 w-0 min-w-0 flex-1 rounded-[12px] bg-[var(--color-chip)] px-3.5 text-body-s font-bold text-[var(--color-ink)] outline-none placeholder:font-normal placeholder:text-[var(--color-ink-subtle)] focus:shadow-[inset_0_0_0_2px_var(--color-brand-500)]"
      />
      <button type="submit" className="h-12 shrink-0 rounded-[12px] bg-[var(--color-brand-500)] px-4 text-body-s font-bold text-[var(--color-on-cta)] hover:bg-[var(--color-primary-hover)]">
        {button}
      </button>
    </form>
  );
}
