"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * A basket line's password: dots and a reveal button, so the customer can
 * check what they typed (owner, 2026-10-07 — this reverses the earlier
 * "never shown in the basket").
 *
 * THE VALUE IS NOT IN THE PAGE. This component is handed the line id, the
 * field's key and its label — never the value, because a Client Component's
 * props are serialised into the HTML. The value is fetched from our own
 * route (`/api/cart/lines/<line>/reveal`, same-origin, `no-store`) when the
 * customer taps, kept only in this component's state, and dropped on the
 * second tap. The dots are a FIXED row, so the page does not tell the
 * password's length either.
 *
 * Gone from the vault (two hours, or another device): «أكمل البيانات» back to
 * the product page, the one place details are typed.
 *
 * No eye glyph exists in the design file or `public/brand` (checked
 * 2026-10-07), and icons are never hand-drawn (ADR 0018), so the control is
 * the word «إظهار» / «إخفاء» until the Hicon «Show» icon is exported.
 */
const DOTS = "••••••••";

type State = { kind: "hidden" } | { kind: "loading" } | { kind: "shown"; value: string } | { kind: "gone" } | { kind: "failed" };

export function SecretFieldValue({
  lineId,
  fieldKey,
  label,
  completeHref,
  words,
}: {
  lineId: string;
  fieldKey: string;
  /** The field's label, for the button's accessible name. */
  label: string;
  /** The product page, opened on this line — where a lost value is typed again. */
  completeHref: string;
  words: { show: string; hide: string; hidden: string; gone: string; failed: string; complete: string };
}) {
  const [state, setState] = useState<State>({ kind: "hidden" });
  const shown = state.kind === "shown";

  async function toggle() {
    if (shown) {
      setState({ kind: "hidden" });
      return;
    }

    setState({ kind: "loading" });
    try {
      const response = await fetch(`/api/cart/lines/${encodeURIComponent(lineId)}/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: fieldKey }),
        cache: "no-store",
        credentials: "same-origin",
      });
      if (response.status === 404) {
        setState({ kind: "gone" });
        return;
      }
      const body = response.ok ? ((await response.json()) as { value?: unknown }) : null;
      setState(typeof body?.value === "string" ? { kind: "shown", value: body.value } : { kind: "failed" });
    } catch {
      setState({ kind: "failed" });
    }
  }

  if (state.kind === "gone") {
    return (
      <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
        <span className="font-medium text-[var(--color-ink-subtle)]">{words.gone}</span>
        <Link href={completeHref} className="font-bold text-[var(--color-brand-500)] underline-offset-4 hover:underline">
          {words.complete}
        </Link>
      </span>
    );
  }

  return (
    <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-2">
      {shown ? (
        <span dir="ltr" className="[overflow-wrap:anywhere]">
          {state.value}
        </span>
      ) : (
        <span dir="ltr" aria-label={words.hidden} className="tracking-[0.1em]">
          {DOTS}
        </span>
      )}
      <button
        type="button"
        onClick={toggle}
        disabled={state.kind === "loading"}
        aria-pressed={shown}
        aria-label={`${shown ? words.hide : words.show}: ${label}`}
        className="shrink-0 font-bold text-[var(--color-brand-500)] underline-offset-4 hover:underline disabled:opacity-55"
      >
        {shown ? words.hide : words.show}
      </button>
      {state.kind === "failed" ? (
        <span role="status" className="basis-full text-[var(--color-danger)]">
          {words.failed}
        </span>
      ) : null}
    </span>
  );
}
