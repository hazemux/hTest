/**
 * The basket and checkout's shared look (2026-09-28 redesign), as plain class
 * strings so the basket page — a Server Component with no client code — and
 * the client checkout forms draw the same pieces.
 *
 * ONE RADIUS SCALE: 16 for containers (the summary, the method list's
 * panels), 12 for controls (buttons, inputs, method rows, thumbnails), full
 * for pills and the stepper. ONE ACCENT: the brand blue; red only for errors
 * and removal, green only for an applied code. Every colour is a token, so
 * light and dark come from `globals.css`.
 */

/**
 * The pay button's own look, on the basket and the checkouts: words at the
 * start, the server's total at the end, 52 tall.
 *
 * `--color-on-cta` is `Text/Neutral/subtlest` — white on the light blue, dark
 * ink on the lifted dark-theme blue (#0991dc), where white would fall short of
 * 4.5:1. Locked, it keeps readable ink on the grey rather than white on grey.
 */
export const CTA_BUTTON =
  "flex h-[52px] w-full items-center justify-between gap-3 rounded-[12px] bg-[var(--color-brand-500)] px-4 text-body-m font-bold text-[var(--color-on-cta)] shadow-sm transition duration-200 " +
  "hover:bg-[var(--color-primary-hover)] active:scale-[0.99] " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] " +
  // No hover or press on a locked button: it takes no pointer at all.
  "disabled:pointer-events-none disabled:bg-[var(--color-button-disabled)] disabled:text-[var(--color-ink-muted)] disabled:shadow-none";

/**
 * The checkouts' pay bar («Checkout Mobile», 2026-09-30): on the phone, where
 * the checkout has no tab bar, the ONE button sits fixed at the very bottom
 * on the page's own ground, a hairline above it, 12 / 24 / 20 around it plus
 * the home indicator's inset. From `lg` it is an ordinary block at the end of
 * the summary column. `cq-pay-bar`: the chat button rises over it
 * (`SupportChat`).
 */
export const PAY_BAR =
  "cq-pay-bar flex flex-col gap-2 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:bg-[var(--background)] " +
  "max-lg:px-6 max-lg:pt-3 max-lg:pb-[calc(20px+env(safe-area-inset-bottom))] max-lg:shadow-[0_-1px_0_var(--color-bg-subtle)]";

/** Room under a checkout's content on the phone, so the fixed pay bar never covers its last line. */
export const PAY_BAR_CLEARANCE = "max-lg:pb-[calc(112px+env(safe-area-inset-bottom))]";

/** The same, for a pay bar that also carries the terms line under its button. */
export const PAY_BAR_LEGAL_CLEARANCE = "max-lg:pb-[calc(140px+env(safe-area-inset-bottom))]";

/** The summary card beside (desktop) or under (phone) the lines. */
export const SUMMARY_CARD =
  "flex flex-col gap-4 rounded-[16px] border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-4 lg:p-5";

/** A section heading inside the basket and checkout. */
export const SECTION_TITLE = "text-body-l font-bold leading-[1.4] text-[var(--color-ink)] lg:text-heading-m";

/**
 * A checkout section's heading — «المنتجات», «تفاصيل الفاتورة», «طريقة
 * الدفع»: ExtraBold 15 on the phone («Checkout Mobile»), Bold 18 from `lg`.
 */
export const CHECKOUT_HEADING = "text-body-m font-extrabold leading-[1.5] text-[var(--color-ink)] lg:text-heading-m lg:font-bold lg:leading-[1.4]";

/** Money: always LTR (set `dir` on the element), always tabular so columns of figures align. */
export const MONEY = "tabular-nums";
