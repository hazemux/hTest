"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { CustomFields, type CategoryField } from "@/components/checkout/CustomFields";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { newAttemptKey } from "@/lib/checkout/attempt-key";
import type { Locale } from "@/lib/i18n/locales";
import { correctOrderFields } from "@/lib/orders/correct-fields";
import { CORRECTION_FIELD_PREFIX, NO_REFUSAL, type CorrectionState } from "@/lib/orders/field-correction";

/** What each refusal says; `required` is the line under an empty field, `{field}` its label. */
export type CorrectionMessages = {
  submit: string;
  required: string;
  unchanged: string;
  invalid: string;
  failed: string;
  /** The one correction was spent (another tab, another device) — support from here. */
  used: string;
  unavailable: string;
};

/**
 * «أرسل التصحيح» — the customer's ONE correction of the player details a
 * rejected order was refused for (ADR 0019 Q20). The fields start with what
 * was rejected, so the customer sees what to change; the SERVER refuses the
 * same value again (`fields_unchanged`) and a second correction altogether
 * (`field_correction_used`) — this form only carries the typing across and
 * says the refusal where it belongs, without clearing what was typed.
 *
 * A sent correction leaves for the order page (the action redirects, and the
 * alert bar says it). An order that is no longer the customer's to correct
 * re-reads itself, so the page swaps the form for the way to support.
 */
export function FieldCorrectionForm({
  locale,
  orderId,
  fields,
  initialValues,
  messages,
}: {
  locale: Locale;
  orderId: string;
  fields: CategoryField[];
  /** What the order holds now — the value that was rejected. */
  initialValues: Record<string, string>;
  messages: CorrectionMessages;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<CorrectionState, FormData>(correctOrderFields, NO_REFUSAL);
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  // One key per form, minted in the BROWSER (`lib/checkout/attempt-key.ts`): a
  // double press replays the first answer instead of asking the API twice.
  // The server's render and the browser's mint different keys; either is a
  // valid one, and the DOM's is what is submitted.
  const [attempt] = useState(newAttemptKey);

  const outcome = state.outcome;
  const spent = outcome === "used" || outcome === "unavailable";
  useEffect(() => {
    if (spent) router.refresh();
  }, [spent, router, state]);

  const firstKey = fields[0]?.key;
  const fieldError = outcome === "unchanged" ? messages.unchanged : outcome === "invalid" ? messages.invalid : null;
  const notice = outcome === "failed" ? messages.failed : outcome === "used" ? messages.used : outcome === "unavailable" ? messages.unavailable : null;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="order" value={orderId} />
      <input type="hidden" name="attempt" value={attempt} suppressHydrationWarning />
      <CustomFields
        locale={locale}
        fields={fields}
        values={values}
        onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
        namePrefix={CORRECTION_FIELD_PREFIX}
        idPrefix="correct-"
        invalidText={(_, label) => messages.required.replace("{field}", label)}
        afterControl={(field) =>
          fieldError && field.key === firstKey ? (
            <p role="alert" className="text-caption font-semibold text-[var(--color-danger)] lg:text-body-s">
              {fieldError}
            </p>
          ) : null
        }
      />
      {notice ? (
        <p role="alert" className="text-body-s font-bold text-[var(--color-danger)]">
          {notice}
        </p>
      ) : null}
      <SubmitButton className="flex h-12 w-full items-center justify-center rounded-[12px] bg-[var(--color-brand-500)] px-4 text-body-s font-bold text-[var(--color-on-cta)] hover:bg-[var(--color-primary-hover)]">
        {messages.submit}
      </SubmitButton>
    </form>
  );
}
