"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode, type SubmitEvent } from "react";

import { FILE_OUTCOMES, type ProofOutcome } from "@/lib/checkout/transfer-proof";

/**
 * The proof-of-transfer `<form>`, sent WITHOUT leaving the page.
 *
 * A plain multipart post is answered by a redirect, and the page it lands on
 * is a fresh one: every field the customer had typed — the transfer date, the
 * bank, the reference, the note — was gone after any failure, and they began
 * again. Posted in place, nothing is cleared: a refused FILE empties only the
 * file chooser, and anything else leaves the whole form exactly as it was.
 *
 * PROGRESSIVE ENHANCEMENT. Without JavaScript this is the plain form it always
 * was (the route redirects back, carrying the typed details in a short-lived
 * cookie — `lib/checkout/transfer-proof.ts`). With it, the same route answers
 * JSON; a send that worked REPLACES the page with its "sent" state, so the
 * proof's status is the server's, and Back does not return to the form.
 */
export function TransferProofForm({
  action,
  sentHref,
  maxBytes,
  messages,
  initialOutcome,
  sendingLabel,
  className,
  heading,
  children,
  submit,
  buttonClassName = "h-[52px] w-full rounded-[16px] bg-[var(--color-brand-500)] px-6 text-body-l font-bold text-[var(--color-on-primary)] transition hover:bg-[var(--color-primary-hover)] disabled:opacity-60 sm:w-auto",
}: {
  action: string;
  /** Where a successful send goes — the page itself, in its "sent" state. */
  sentHref: string;
  /** The largest file the API takes (`max_upload_bytes`); spares a doomed upload. */
  maxBytes?: number;
  messages: Record<ProofOutcome, string>;
  /** The outcome a plain post came back with (`?proof=`), if any. */
  initialOutcome?: ProofOutcome | null;
  sendingLabel: string;
  className?: string;
  heading?: ReactNode;
  children: ReactNode;
  /** The submit button's label. */
  submit: string;
  /** The submit button's look, where the page's own differs. */
  buttonClassName?: string;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<ProofOutcome | null>(initialOutcome ?? null);
  const [busy, setBusy] = useState(false);

  function clearFile(form: HTMLFormElement) {
    const input = form.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) return;
    input.value = "";
    // The chooser shows the picked file's name from its own change handler.
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    event.preventDefault();
    if (busy) return;

    const fields = new FormData(form);
    const file = form.querySelector<HTMLInputElement>('input[type="file"]')?.files?.[0];
    const found: ProofOutcome | null = !file || file.size === 0 ? "missing" : maxBytes && file.size > maxBytes ? "too_large" : null;
    if (found) {
      setOutcome(found);
      if (found === "too_large") clearFile(form);
      return;
    }

    setBusy(true);
    setOutcome(null);
    let answer: ProofOutcome = "failed";
    try {
      const response = await fetch(form.action, {
        method: "POST",
        body: fields,
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      const body = (await response.json().catch(() => null)) as { outcome?: ProofOutcome } | null;
      answer = body?.outcome && body.outcome in messages ? body.outcome : response.ok ? "sent" : "failed";
    } catch {
      answer = "failed";
    }

    if (answer === "sent") {
      router.replace(sentHref, { scroll: false });
      router.refresh();
      setOutcome("sent");
      setBusy(false);
      return;
    }

    setBusy(false);
    setOutcome(answer);
    if (FILE_OUTCOMES.includes(answer)) clearFile(form);
  }

  return (
    <form
      method="post"
      encType="multipart/form-data"
      action={action}
      onSubmit={onSubmit}
      aria-busy={busy || undefined}
      className={className}
    >
      {heading}
      {outcome ? (
        <p
          role={outcome === "sent" ? "status" : "alert"}
          className={`text-body-s font-semibold lg:text-body-l ${outcome === "sent" ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}
        >
          {messages[outcome]}
        </p>
      ) : null}
      {children}
      <button
        type="submit"
        disabled={busy}
        className={buttonClassName}
      >
        {busy ? sendingLabel : submit}
      </button>
    </form>
  );
}
