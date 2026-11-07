"use client";

import { useIsPresent } from "motion/react";

/**
 * True while this element is only still in the DOM for its exit animation —
 * it has ALREADY left logically. Spread `inert={leaving}` on it: no focus,
 * no clicks, nothing for a screen reader (HANDBOOK «Motion», rule 8).
 * Outside `AnimatePresence` it is always false.
 */
export function useLeaving(): boolean {
  return !useIsPresent();
}

/**
 * Wrap form controls that can leave inside a form that STAYS (a customer
 * field hidden by `visible_when`). Always rendered — switching to a fieldset
 * only on exit would change the element type and remount the input — and
 * disabled + inert the moment the field leaves: a disabled fieldset's
 * controls are not submitted and are barred from constraint validation, so a
 * hidden field can never post its value or block the submit while it fades.
 * The fieldset's own browser styles are reset so it draws nothing.
 */
export function LeavingFieldset({ className, children }: { className?: string; children: React.ReactNode }) {
  const leaving = useLeaving();
  return (
    <fieldset
      disabled={leaving}
      inert={leaving}
      className={`m-0 min-w-0 border-0 p-0 ${className ?? ""}`}
    >
      {children}
    </fieldset>
  );
}
