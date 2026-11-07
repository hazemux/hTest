/**
 * «وفر ٪٥» — the discount badge, drawn only when the server said there is one.
 *
 * `pct` COMES FROM `savings_pct` (contract v0.1.30) AND IS NEVER COMPUTED HERE.
 * The storefront performs no arithmetic on money (HANDBOOK §1), and a
 * percentage is arithmetic on money: the two prices beside this badge are each
 * rounded onto the currency's own price ladder, so `(regular − price) /
 * regular` in JavaScript disagrees with what the server banded. Until v0.1.30
 * the field did not exist and this badge could not honestly be drawn — see the
 * comment in `ProductCard.tsx` that said exactly that.
 *
 * NULL AND ZERO BOTH MEAN "NO BADGE", and the server never sends zero. Guarding
 * on falsiness rather than on null keeps a future 0 — from a bad seed, a stale
 * cache, another client — from rendering "save 0%".
 */
export function SavingsBadge({
  pct,
  label,
  className = "",
}: {
  pct: number | null | undefined;
  /** The already-interpolated string, e.g. "وفر 5%" — this component has no dictionary. */
  label: string;
  className?: string;
}) {
  if (!pct) return null;

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-lg border border-[var(--color-danger)] px-2 py-1 text-body-s font-medium text-[var(--color-danger)] ${className}`}
    >
      {label}
    </span>
  );
}
