/**
 * The comps' text input (`6883:31202` «رقم ال ID»): 53 tall on desktop, 46 on
 * the phone, radius 12, the 22% grey hairline on the 6% grey fill,
 * placeholder in Body/SemiBold 14. The mobile sign-in comps draw it at 12; it
 * stays 14 because it is what the customer reads while typing, and a smaller
 * field font only makes iOS's zoom-on-focus jump further.
 *
 * ITS OWN PLAIN MODULE ON PURPOSE. It used to live in `CustomFields.tsx`, a
 * `"use client"` module — and a server component importing a value from a
 * client module receives a client REFERENCE, not the string. Every server
 * page that used it rendered its inputs with a function's source as the
 * class: no border, no fill, no height.
 */
export const FIELD_CONTROL_CLASS =
  "h-[46px] w-full rounded-[12px] border border-[var(--color-input-border)] bg-[var(--color-field)] px-4 text-body-s font-semibold placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-primary)] lg:h-[53px]";

/**
 * The same input, inside a checkout line («Checkout Mobile», 2026-09-30): the
 * account password typed under the product it logs into — 44 tall, radius
 * 10, the line hairline on the page's own ground, 13px.
 */
export const FIELD_CONTROL_COMPACT_CLASS =
  "h-11 w-full rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-body-s text-[var(--color-ink)] placeholder:text-[var(--color-ink-subtle)] focus:border-[var(--color-primary)]";
