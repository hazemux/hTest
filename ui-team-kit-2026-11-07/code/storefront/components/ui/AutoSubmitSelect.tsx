"use client";

import { useRef } from "react";

/**
 * A `<select>` that submits its form the moment the customer chooses.
 *
 * PROGRESSIVE ENHANCEMENT, not a rewrite. The switcher is still a plain
 * `<form>` posting to `/api/preferences`; this only adds an `onChange` that
 * calls `requestSubmit()`. With JavaScript unavailable — a throttled 3G
 * connection mid-load, or before hydration — the form still works, because
 * the Apply button is still there.
 *
 * The button hides itself only once this component has hydrated (`js-ready`
 * on the wrapper), so it is never hidden from someone who would need it. The
 * old markup carried a comment claiming exactly this behaviour while nothing
 * implemented it: the customer had to pick a currency AND click Apply, and
 * clicking Apply is the step people forget.
 *
 * `requestSubmit()` rather than `submit()`: the former runs validation and
 * fires the submit event, so the form behaves as if a human pressed the
 * button. `submit()` bypasses both.
 */
export function AutoSubmitSelect({
  id,
  name,
  defaultValue,
  options,
  labels,
  className,
}: {
  id: string;
  name: string;
  defaultValue: string;
  options: readonly string[];
  /**
   * What each option READS as, when its value is not already the label.
   *
   * A currency's option text is its code and needs no translation; a
   * country's is a name in the customer's language while its value stays an
   * ISO code, because a cookie holding "الإمارات" would break the moment
   * somebody switched to English. Optional, so the currency switcher is
   * untouched.
   */
  labels?: Record<string, string>;
  className?: string;
}) {
  const ref = useRef<HTMLSelectElement>(null);

  return (
    <select
      ref={ref}
      id={id}
      name={name}
      defaultValue={defaultValue}
      className={className}
      onChange={() => ref.current?.form?.requestSubmit()}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {labels?.[option] ?? option}
        </option>
      ))}
    </select>
  );
}
