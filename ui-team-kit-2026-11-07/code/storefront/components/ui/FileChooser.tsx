"use client";

import { useState } from "react";

/**
 * A file input that speaks the page's language, for a PLAIN form post.
 *
 * The browser's own button says "Choose File / No file chosen" in the
 * browser's language — English on an Arabic page. The input stays (focusable,
 * submitted, announced) but is hidden visually, and a label is the visible
 * control. Before hydration it is exactly that: a label that opens the
 * picker. Once hydrated it also shows WHICH file was picked, which the native
 * control would have said and the label alone cannot.
 */
export function FileChooser({
  id,
  name,
  accept,
  required,
  chooseLabel,
}: {
  id: string;
  name: string;
  accept: string;
  required?: boolean;
  chooseLabel: string;
}) {
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-3 has-[:focus-visible]:[&>label]:outline has-[:focus-visible]:[&>label]:outline-2 has-[:focus-visible]:[&>label]:outline-offset-2 has-[:focus-visible]:[&>label]:outline-[var(--color-primary)]">
      <input
        id={id}
        type="file"
        name={name}
        required={required}
        accept={accept}
        onChange={(event) => setPicked(event.target.files?.[0]?.name ?? null)}
        className="sr-only"
      />
      <label
        htmlFor={id}
        aria-hidden
        className="inline-block cursor-pointer rounded-[12px] bg-[var(--color-chip)] px-4 py-2 text-body-s font-semibold text-[var(--color-ink)]"
      >
        {chooseLabel}
      </label>
      {picked ? (
        <span dir="ltr" className="min-w-0 truncate text-body-s text-[var(--color-ink-muted)]">
          {picked}
        </span>
      ) : null}
    </div>
  );
}
