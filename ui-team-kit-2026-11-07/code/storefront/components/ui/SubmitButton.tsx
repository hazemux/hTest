"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

const SPINNER_DELAY_MS = 150;

type SubmitButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  /**
   * `lock` (default): every submit button of the form is disabled while its
   * action runs, so a second tap or Enter submits nothing.
   * `feedback`: the pending look only, the button stays live — for actions
   * whose repeats are MEANT to count (the basket stepper's ±1 per tap).
   */
  mode?: "lock" | "feedback";
};

/**
 * A server-action form's submit button that SAYS it is working (HANDBOOK
 * «Motion»). A plain `<button type="submit">` — `name`, `value`,
 * `formAction` and every other prop pass straight through, so the form
 * behaves exactly as before:
 *
 * - it is never disabled BEFORE the submit event: native validation runs
 *   first, and a refused submit never goes pending, so the button stays live
 *   for the retry; React reads the submitter's `name`/`value`/`formAction`
 *   at submit time, before anything is locked;
 * - only the button that submitted shows the spinner — it is told by the
 *   form's own `submit` event (`event.submitter`), which fires only once
 *   validation passed, and names the default button for Enter too;
 * - the spinner appears after 150 ms, over the label, so a quick action does
 *   not flicker and the button keeps its size;
 * - pending ends when the action settles — redirect, error or return — so a
 *   failure leaves it usable.
 *
 * Locking is feedback and a safeguard; the server's own rules stay the
 * protection against repeats.
 */
export function SubmitButton({ mode = "lock", disabled, className, children, ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const button = useRef<HTMLButtonElement>(null);
  // Which submit of this form was ours: every submit renumbers, and only one
  // whose submitter was THIS button is "ours". Set from the event, never
  // from an effect.
  const [submission, setSubmission] = useState({ count: 0, ours: false });
  const [spunFor, setSpunFor] = useState(-1);

  useEffect(() => {
    const form = button.current?.form;
    if (!form) return;
    const onSubmit = (event: SubmitEvent) =>
      setSubmission((previous) => ({ count: previous.count + 1, ours: event.submitter === button.current }));
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, []);

  const working = pending && submission.ours;

  useEffect(() => {
    if (!working) return;
    const count = submission.count;
    const timer = window.setTimeout(() => setSpunFor(count), SPINNER_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [working, submission.count]);

  const spinning = working && spunFor === submission.count;

  return (
    <button
      {...props}
      ref={button}
      type="submit"
      disabled={disabled || (mode === "lock" && pending)}
      aria-busy={working || undefined}
      data-spinning={spinning || undefined}
      className={`cq-submit ${className ?? ""}`}
    >
      {children}
    </button>
  );
}
