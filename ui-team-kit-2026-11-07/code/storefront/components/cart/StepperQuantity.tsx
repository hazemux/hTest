"use client";

import { useFormStatus } from "react-dom";

/**
 * The basket stepper's number. It lives INSIDE the stepper's form so
 * `useFormStatus` can tell it the tap is still being saved: it dims while the
 * server works and comes back at full strength with the new figure when the
 * redirect lands. Feedback only — the buttons beside it stay live, because a
 * second quick tap is a second `±1` on purpose (`lib/cart/actions.ts`).
 *
 * The `aria-live` stays on the number: a pressed button reloads the page, and
 * a screen reader otherwise announces nothing about what changed.
 */
export function StepperQuantity({ className = "", children }: { className?: string; children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <span aria-live="polite" className={`${className} transition-opacity ${pending ? "opacity-50" : ""}`}>
      {children}
    </span>
  );
}
