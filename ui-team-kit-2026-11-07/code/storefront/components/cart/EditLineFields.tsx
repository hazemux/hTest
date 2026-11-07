"use client";

import { useState } from "react";

import { CustomFields, type CategoryField } from "@/components/checkout/CustomFields";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { updateCartLineFields } from "@/lib/cart/actions";
import type { FieldValues } from "@/lib/fields/visible-when";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * «تعديل البيانات» — a basket line's details, edited in place (Figma
 * `6847:94526`, "Cart - Required Fields editing").
 *
 * THE PRODUCT PAGE'S OWN FIELD RENDERER (`CustomFields`), so a field reads,
 * validates and shows/hides (`visible_when`) exactly as it did when the line
 * was added. Posted to `updateCartLineFields` as `field_<key>` — the same
 * names `addToCart` reads — and the basket re-prices on the redirect, which is
 * where a value the category no longer accepts is named.
 *
 * Credentials are never among `fields` (`CartView.editable`): the basket does
 * not hold them, so it cannot offer to edit them.
 */
export function EditLineFields({
  locale,
  lineId,
  fields,
  initial,
}: {
  locale: Locale;
  lineId: string;
  fields: CategoryField[];
  initial: FieldValues;
}) {
  const m = messagesFor(locale);
  const [values, setValues] = useState<FieldValues>(initial);

  return (
    <form action={updateCartLineFields} className="flex w-full flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="line" value={lineId} />
      <CustomFields
        locale={locale}
        fields={fields}
        values={values}
        onChange={(key, value) => setValues((was) => ({ ...was, [key]: value }))}
        namePrefix="field_"
        idPrefix={`line-${lineId}-`}
      />
      {/* `6847:94526`: «حفظ التغيير», outlined in primary, 12px corners. */}
      <SubmitButton
        mode="lock"
        className="h-12 w-full rounded-[12px] border border-[var(--color-brand-500)] text-body-s font-bold leading-[1.5] text-[var(--color-brand-500)] transition hover:bg-[var(--color-primary-wash-lighter)]"
      >
        {m.cart.saveChanges}
      </SubmitButton>
    </form>
  );
}
