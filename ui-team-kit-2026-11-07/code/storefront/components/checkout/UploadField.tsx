"use client";

import { useState } from "react";

import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { CLARITY_MASK } from "@/lib/analytics/clarity";

/**
 * An `image`/`file` category field: the customer picks a file, it is uploaded
 * at once, and the field's VALUE becomes the reference the API issued
 * (contract v0.1.34) — never the file itself.
 *
 * THE FILE INPUT HAS NO `name`, so the bytes are never posted with the
 * surrounding form (into the basket cookie, or a Server Action with a 1 MB
 * cap). The hidden input carries the reference, which is what the order's
 * fields hold and what the API proves ownership of at placement.
 *
 * The owner token that proves the upload is THIS guest's never reaches this
 * component: `/api/uploads` keeps it in an HttpOnly cookie.
 */
export function UploadField({
  inputId,
  name,
  locale,
  accept,
  required,
  value,
  onChange,
  fieldKey,
}: {
  inputId: string;
  name: string;
  locale: Locale;
  accept?: string;
  required: boolean;
  value: string;
  onChange: (key: string, value: string) => void;
  fieldKey: string;
}) {
  const m = messagesFor(locale);
  const [state, setState] = useState<"idle" | "uploading" | "done" | "failed">(value ? "done" : "idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setState("uploading");
    setError(null);
    setFileName(file.name);

    const body = new FormData();
    body.set("file", file);

    try {
      const response = await fetch(`/api/uploads?locale=${locale}`, { method: "POST", body });
      const answer = (await response.json()) as { reference?: string; message?: string };

      if (!response.ok || !answer.reference) {
        setState("failed");
        setError(response.status === 413 ? m.upload.tooLarge : (answer.message ?? m.upload.failed));
        onChange(fieldKey, "");
        return;
      }

      onChange(fieldKey, answer.reference);
      setState("done");
    } catch {
      setState("failed");
      setError(m.upload.failed);
      onChange(fieldKey, "");
    }
  }

  return (
    <div {...CLARITY_MASK} className="flex flex-col gap-2">
      {/* THE BROWSER'S OWN FILE BUTTON SPEAKS THE BROWSER'S LANGUAGE — "Choose
          File / No file chosen" in English on an Arabic page. The input stays
          (focusable, labelled, what a screen reader announces) but is hidden
          visually; the label beside it is the control people see, in the
          page's words, and clicking a label opens its input's picker natively. */}
      <div className="flex items-center gap-3 has-[:focus-visible]:[&>label]:outline has-[:focus-visible]:[&>label]:outline-2 has-[:focus-visible]:[&>label]:outline-offset-2 has-[:focus-visible]:[&>label]:outline-[var(--color-primary)]">
        <input
          id={inputId}
          type="file"
          accept={accept ?? "image/jpeg,image/png,image/webp,application/pdf"}
          // Required only until a file has been accepted: after that the
          // reference below is the answer, and a browser re-demanding the file
          // input would block the submit of a field that is already filled.
          required={required && value === ""}
          aria-describedby={`${inputId}-status`}
          aria-invalid={state === "failed"}
          disabled={state === "uploading"}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
          className="sr-only"
        />
        <label
          htmlFor={inputId}
          aria-hidden
          className="cursor-pointer rounded-[12px] bg-[var(--color-chip)] px-4 py-2 text-body-s font-semibold text-[var(--color-ink)] transition hover:bg-[var(--color-action-disabled-bg)]"
        >
          {state === "done" ? m.upload.replace : m.upload.choose}
        </label>
      </div>
      <input type="hidden" name={name} value={value} />

      <p id={`${inputId}-status`} role="status" className="text-caption lg:text-body-s">
        {state === "uploading" ? (
          <span className="text-[var(--color-ink-muted)]">{m.upload.uploading}</span>
        ) : state === "done" ? (
          <span className="font-semibold text-[var(--color-success)]">
            {m.upload.done}
            {fileName ? <span dir="ltr"> — {fileName}</span> : null}
          </span>
        ) : state === "failed" ? (
          <span className="font-semibold text-[var(--color-danger)]">{error}</span>
        ) : (
          <span className="text-[var(--color-ink-muted)]">{m.upload.hint}</span>
        )}
      </p>
    </div>
  );
}
