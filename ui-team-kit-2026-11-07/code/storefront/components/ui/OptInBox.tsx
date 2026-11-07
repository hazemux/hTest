import type { InputHTMLAttributes } from "react";

/**
 * One «reminders and offers» opt-in box — the save-card checkbox's own look
 * (`PaymentSection`): the label at the start, the box at the end, so it
 * mirrors with the page's direction. UNTICKED until the customer ticks it
 * (ADR 0039 §4); nothing here ever defaults it on.
 *
 * Shared by the guest's checkout (a controlled box in a client form) and the
 * sign-up details step (a plain form field posted with JavaScript off), so
 * the two places that ask the same question look the same. Every input prop
 * passes through: `checked`/`onChange` there, `name`/`value` here.
 */
export function OptInBox({ label, ...input }: { label: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className">) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-[8px] bg-[var(--color-surface)] p-3">
      <span className="min-w-0 flex-1 text-caption font-bold leading-[1.5] text-[var(--color-ink)] lg:text-body-s">{label}</span>
      <input
        {...input}
        type="checkbox"
        className="grid size-6 shrink-0 cursor-pointer appearance-none place-items-center rounded-[8px] border border-[var(--color-brand-500)] bg-[var(--color-surface)] checked:bg-[var(--color-brand-500)] checked:[background-image:url(/brand/icon-check-white.svg)] checked:bg-center checked:bg-no-repeat"
      />
    </label>
  );
}
