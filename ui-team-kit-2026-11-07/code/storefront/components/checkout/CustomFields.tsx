"use client";

import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { MotionScope } from "@/components/ui/motion/MotionScope";
import { useLayoutEffect, useRef, useState, type ChangeEvent, type ReactNode, type SelectHTMLAttributes } from "react";

import type { components } from "@/lib/api/generated/v1.d.ts";
import { optionLabel, optionValue } from "@/lib/fields/options";
import { isFieldVisible, type FieldValues } from "@/lib/fields/visible-when";

import { UploadField } from "./UploadField";
import type { Locale } from "@/lib/i18n/locales";
import { FIELD_CONTROL_CLASS, FIELD_CONTROL_COMPACT_CLASS } from "@/components/ui/field-control";
import { LeavingFieldset } from "@/components/ui/motion/Leaving";
import { useMotionTransition } from "@/lib/motion/useMotionTransition";
import { CLARITY_MASK } from "@/lib/analytics/clarity";
import { ClarityMask } from "@/components/analytics/ClarityMask";

/**
 * Renders one CATEGORY's custom fields as form inputs.
 *
 * Fields live on the category, never the product (spec §4.1) — a buyer
 * fills in whatever `Category.fields` declares for whichever item they are
 * buying. Visibility is delegated to `isFieldVisible` (lib/fields/
 * visible-when.ts), which is a direct port of the server's own
 * `CustomFieldValidator::isVisible()`: a hidden field is not merely styled
 * away here, it is logically gone the moment its condition fails, so it
 * cannot end up in whatever the caller submits. It may still be in the DOM
 * for a short exit (height + opacity, HANDBOOK «Motion»), but only inside a
 * disabled, inert fieldset: excluded from the form's data and from
 * constraint validation, unreachable by focus or click.
 *
 * State is fully controlled by the caller (the checkout page) via
 * `values`/`onChange` — this component owns no state of its own, so it
 * stays a pure function of its props and is trivial to test in isolation.
 */

export type CategoryField = components["schemas"]["CategoryField"];
export type { CategoryFieldOption } from "@/lib/fields/options";

export interface CustomFieldsProps {
  locale: Locale;
  /** A single category's field definitions, in the order they should render. */
  fields: CategoryField[];
  /** Every field's current value, keyed by `key`. Controlled by the caller. */
  values: FieldValues;
  onChange: (key: string, value: string) => void;
  /**
   * Prefix for the submitted input `name`, never for the `values` key.
   *
   * The checkout page hands these straight to `createOrder` and wants the bare
   * key; the product page posts the same inputs to `addToCart`, which reads
   * `field_<key>` so that a category field called `quantity`, `slug` or
   * `locale` cannot collide with the cart form's own controls (see
   * `fieldsFrom` in lib/cart/actions.ts — the admin panel will eventually let
   * somebody name one exactly that).
   *
   * `values` and `onChange` stay keyed by the RAW key either way: a prefix that
   * leaked into state would break `visible_when`, whose conditions name fields
   * by the key the admin typed.
   */
  namePrefix?: string;
  /**
   * Prefix for the inputs' `id`s. Needed only when one page renders the same
   * category's fields more than once — the basket checkout asks for a login
   * per line — where two `id="field-account_password"` would point both
   * labels at the first input.
   */
  idPrefix?: string;
  /**
   * The small size — a field typed INSIDE a checkout line (a login's
   * password), under a 12px label, rather than a page's own field.
   */
  compact?: boolean;
  /**
   * Beside a field's label — the product page's «أين أجده؟» (v0.1.62).
   * Rendered in the label row, after the label.
   */
  labelAccessory?: (field: CategoryField) => ReactNode;
  /** Under a field's control — the product page's saved-ID chips. */
  afterControl?: (field: CategoryField) => ReactNode;
  /**
   * The line said under a field the browser refused to submit empty or
   * malformed — «أدخل رقم الايدي لإكمال الطلب.». The field is also outlined
   * until it changes. Without it, the browser's own bubble is all there is.
   */
  invalidText?: (field: CategoryField, label: string) => string;
}

/**
 * Field types whose value is inherently left-to-right regardless of the
 * page's own direction — a numeric ID, an email address, a credential, an
 * ISO date/time. The page sets `dir` on `<html>`; this is the one
 * deliberate per-input exception. A PUBG player ID is declared
 * `type: "number"` (see database/seeders/DemoCatalogSeeder.php) and reads as
 * plain digits — under `dir="rtl"` those digits visually reorder, and the
 * customer ends up typing something that looks wrong on their own screen.
 */
const LTR_FIELD_TYPES = new Set<CategoryField["type"]>([
  "number",
  "email",
  "secret",
  "date",
  "time",
]);

/**
 * The one input skin, shared by every control type here.
 *
 * IT USED TO BE NOTHING AT ALL. Tailwind's preflight resets `border-width` to
 * 0 on every element, so an `<input>` with no classes renders as an invisible
 * box: the label and the hint were on screen with a blank gap between them, and
 * the customer had no way to tell there was a field to type in. The `select`
 * case carried its own styles and looked fine, which is why this survived — one
 * control type out of nine was visible.
 *
 * Values read from the comps (Figma 6847:97199): a 6% grey fill, the shared
 * hairline, 12px corners and a 44px control height.
 */
// Re-exported for the client components that already import it from here;
// server code must import `@/components/ui/field-control` (see there).
export { FIELD_CONTROL_CLASS };

/** Parses a multiselect's stored comma-joined string back into its choices. */
function splitChoices(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v !== "");
}

export function CustomFields({
  locale,
  fields,
  values,
  onChange,
  namePrefix = "",
  idPrefix = "",
  compact = false,
  labelAccessory,
  afterControl,
  invalidText,
}: CustomFieldsProps) {
  const visible = fields.filter((field) => isFieldVisible(field.visible_when ?? null, values));
  // Keys the browser refused on the last submit; a change clears its own.
  const [invalid, setInvalid] = useState<ReadonlySet<string>>(new Set());
  const root = useRef<HTMLDivElement>(null);
  const transition = useMotionTransition("base");

  // Re-runs only when a field enters or leaves, never on typing.
  const visibleSignature = visible.map((field) => field.key).join("\u0000");

  // A field that hides takes the focus with it — the browser would drop it
  // on <body>, so a keyboard customer would lose their place. Put it back on
  // the control that hid the field (its `visible_when.field`), else the
  // form's first usable field. Only when focus WAS inside the field that left;
  // nothing here ever takes focus on its own.
  useLayoutEffect(() => {
    const container = root.current;
    const active = container?.ownerDocument.activeElement;
    if (!container || !(active instanceof HTMLElement)) return;
    const owner = active.closest<HTMLElement>("[data-field-key]");
    if (!owner || !container.contains(owner)) return;
    const leftKey = owner.dataset.fieldKey;
    if (leftKey === undefined || visibleSignature.split("\u0000").includes(leftKey)) return;

    const controllerKey = fields.find((field) => field.key === leftKey)?.visible_when?.field;
    const controller =
      controllerKey !== undefined && visibleSignature.split("\u0000").includes(controllerKey)
        ? container.ownerDocument.getElementById(`${idPrefix}field-${controllerKey}`)
        : null;
    // A multiselect's id sits on its group; the first checkbox is what takes focus.
    const target =
      firstFocusable(controller) ?? firstFocusable(active.closest("form") ?? container);
    target?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `fields` and `idPrefix` do not change which field left
  }, [visibleSignature]);

  return (
    <div ref={root} className="flex flex-col">
      {/* initial={false}: the server's HTML is the final state — only a change
          the customer makes animates. Each field carries its own top gap
          INSIDE the animated box, so a leaving field takes its gap with it
          instead of leaving a jump behind. */}
      <MotionScope><AnimatePresence initial={false}>
        {visible.map((field) => (
          <m.div
            key={field.key}
            data-field-key={field.key}
            className="group/field"
            initial={{ height: 0, opacity: 0, overflow: "hidden" }}
            animate={{ height: "auto", opacity: 1, overflow: "hidden", transitionEnd: { overflow: "visible" } }}
            exit={{ height: 0, opacity: 0, overflow: "hidden" }}
            transition={transition}
          >
            <div className={compact ? "pt-3 group-first/field:pt-0" : "pt-4 group-first/field:pt-0"}>
              <LeavingFieldset>
                <CustomField
                  locale={locale}
                  field={field}
                  values={values}
                  onChange={onChange}
                  namePrefix={namePrefix}
                  idPrefix={idPrefix}
                  compact={compact}
                  accessory={labelAccessory?.(field)}
                  after={afterControl?.(field)}
                  invalidText={invalidText}
                  invalid={invalid.has(field.key)}
                  onInvalidChange={(isInvalid) =>
                    setInvalid((current) => {
                      if (current.has(field.key) === isInvalid) return current;
                      const next = new Set(current);
                      if (isInvalid) next.add(field.key);
                      else next.delete(field.key);
                      return next;
                    })
                  }
                />
              </LeavingFieldset>
            </div>
          </m.div>
        ))}
      </AnimatePresence></MotionScope>
    </div>
  );
}

/**
 * The first control inside `scope` (or `scope` itself) a customer can focus:
 * a real input, select or textarea — not a hidden one, not disabled, not in a
 * disabled fieldset, not inside anything inert (a field still fading out).
 */
function firstFocusable(scope: Element | null): HTMLElement | null {
  if (!scope) return null;
  const candidates = scope.matches("input, select, textarea")
    ? [scope]
    : Array.from(scope.querySelectorAll("input, select, textarea"));
  for (const candidate of candidates) {
    if (!(candidate instanceof HTMLElement)) continue;
    if (candidate instanceof HTMLInputElement && candidate.type === "hidden") continue;
    if (candidate.matches(":disabled") || candidate.closest("[inert], [hidden]")) continue;
    return candidate;
  }
  return null;
}

function CustomField({
  locale,
  field,
  values,
  onChange,
  namePrefix,
  idPrefix,
  compact,
  accessory,
  after,
  invalidText,
  invalid,
  onInvalidChange,
}: {
  locale: Locale;
  field: CategoryField;
  values: FieldValues;
  onChange: (key: string, value: string) => void;
  namePrefix: string;
  idPrefix: string;
  compact: boolean;
  accessory?: ReactNode;
  after?: ReactNode;
  invalidText?: (field: CategoryField, label: string) => string;
  invalid: boolean;
  onInvalidChange: (invalid: boolean) => void;
}) {
  const inputId = `${idPrefix}field-${field.key}`;
  // `multiselect` renders a group of checkboxes, not one labelable control,
  // so its label is referenced by `aria-labelledby` (a plain <label htmlFor>
  // pointing at a <div> is not something browsers associate) while every
  // other type keeps the ordinary `htmlFor` association.
  const labelId = `${inputId}-label`;
  // `label` is REQUIRED by the contract and absent from real data: the seeded
  // PUBG category returns { key, type, required } with no label at all, and
  // reading `.label[locale]` on it threw, taking the whole checkout page down
  // with a 500. Trusting a contract's `required` about data the admin can save
  // without is how a green build meets a broken page.
  //
  // The key is a poor label — a customer should not read "player_id" — so this
  // is a floor, not a fix. The fix is labelling the field in the admin.
  const label = field.label?.[locale] || field.label?.en || field.key;
  const hint = field.hint?.[locale];
  const dir = LTR_FIELD_TYPES.has(field.type) ? "ltr" : undefined;
  const value = values[field.key] ?? "";

  return (
    <div className={`flex flex-col ${compact ? "gap-1.5" : "gap-2 lg:gap-3"}`}>
      <div className="flex items-center justify-between gap-2">
      <label
        id={labelId}
        htmlFor={field.type === "multiselect" ? undefined : inputId}
        className={
          compact
            ? "text-caption leading-5 text-[var(--color-ink-subtle)] lg:text-body-s"
            : "text-body-s font-semibold leading-[1.5] lg:text-heading-m"
        }
      >
        {label}
        {field.required ? (
          <span aria-hidden="true" className="text-[var(--color-danger)]">
            {" "}
            *
          </span>
        ) : null}
      </label>
      {accessory}
      </div>

      <FieldControl
        inputId={inputId}
        labelId={labelId}
        locale={locale}
        field={field}
        dir={dir}
        value={value}
        onChange={(key, next) => {
          if (invalid) onInvalidChange(false);
          onChange(key, next);
        }}
        namePrefix={namePrefix}
        compact={compact}
        invalid={invalid}
        onInvalid={invalidText ? () => onInvalidChange(true) : undefined}
        errorId={invalidText ? `${inputId}-error` : undefined}
      />

      {invalid && invalidText ? (
        <p id={`${inputId}-error`} role="alert" className="cq-enter text-caption font-semibold text-[var(--color-danger)] lg:text-body-s">
          {invalidText(field, label)}
        </p>
      ) : null}

      {hint ? <p className="text-caption opacity-70 lg:text-body-s">{hint}</p> : null}
      {after ? <ClarityMask>{after}</ClarityMask> : null}
    </div>
  );
}

/**
 * A select that keeps a choice made BEFORE it hydrated.
 *
 * The product page's purchase panel streams in its own Suspense boundary
 * (ADR 0046 §2), so it can be on screen — and usable — a moment before React
 * hydrates it. React replays no `change` for a select picked in that moment,
 * and its next render puts the controlled value (still "") back: the
 * customer's «البريد الإلكتروني» showed and then vanished, and the fields it
 * reveals never appeared (e2e motion.spec, 2026-10-11). On mount — the
 * hydration commit, before any re-render — a DOM value the state does not
 * hold yet is handed to `onPick` as if it had just been chosen.
 */
function ChoiceSelect({
  base,
  value,
  onPick,
  children,
}: {
  base: SelectHTMLAttributes<HTMLSelectElement>;
  value: string;
  onPick: (value: string) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLSelectElement>(null);
  useLayoutEffect(() => {
    const picked = ref.current?.value;
    if (picked && picked !== value) onPick(picked);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only: afterwards every pick arrives through onChange
  }, []);
  return (
    <select {...base} ref={ref} value={value} onChange={(e) => onPick(e.target.value)}>
      {children}
    </select>
  );
}

function FieldControl({
  inputId,
  labelId,
  locale,
  field,
  dir,
  value,
  onChange,
  namePrefix,
  compact,
  invalid = false,
  onInvalid,
  errorId,
}: {
  inputId: string;
  labelId: string;
  locale: Locale;
  field: CategoryField;
  dir: "ltr" | undefined;
  value: string;
  onChange: (key: string, value: string) => void;
  namePrefix: string;
  compact: boolean;
  invalid?: boolean;
  /** The browser refused this control on submit (`invalid` event). */
  onInvalid?: () => void;
  errorId?: string;
}) {
  const submittedName = `${namePrefix}${field.key}`;
  // What the customer types is theirs: masked in Clarity (`lib/analytics/clarity.ts`).
  const base = {
    id: inputId,
    ...CLARITY_MASK,
    name: submittedName,
    required: field.required,
    pattern: field.validation_regex,
    dir,
    className: `${compact ? FIELD_CONTROL_COMPACT_CLASS : FIELD_CONTROL_CLASS} ${invalid ? "!border-[var(--color-danger)] ring-1 ring-[var(--color-danger)]" : ""}`,
    "aria-invalid": invalid || undefined,
    "aria-describedby": invalid ? errorId : undefined,
    // The browser's own check (required, pattern) fires this before it
    // refuses the submit — the product page outlines the field and says why,
    // instead of the order failing later at checkout.
    onInvalid: onInvalid
      ? () => {
          onInvalid();
        }
      : undefined,
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => onChange(field.key, e.target.value);

  // `secret` implies sensitivity even when `sensitive` was left false, and a
  // field marked `sensitive` on any other type gets the same treatment —
  // matches `CustomFieldValidator`'s `$type === 'secret' || $definition
  // ['sensitive']`. SET-ONLY (ADR 0011): deliberately uncontrolled — no
  // `value`/`defaultValue` — so a credential already held in `values` (e.g.
  // a prior submission) can never render back into the input.
  if (field.sensitive || field.type === "secret") {
    return (
      <input {...base} type="password" autoComplete="off" onChange={handleChange} />
    );
  }

  switch (field.type) {
    case "select":
      return (
        <ChoiceSelect base={base} value={value} onPick={(next) => onChange(field.key, next)}>
          {/* Blank and unselectable: forces an explicit choice rather than
              silently defaulting to the first declared option, which would
              submit a value the customer never actually picked. */}
          <option value="" disabled hidden />
          {(field.options ?? []).map((option, index) => {
            const v = optionValue(option);
            if (v === null) return null;
            return (
              <option key={v || index} value={v}>
                {optionLabel(option, locale)}
              </option>
            );
          })}
        </ChoiceSelect>
      );

    case "multiselect": {
      const chosen = new Set(splitChoices(value));
      return (
        <div id={inputId} role="group" aria-labelledby={labelId} className="flex flex-col gap-1">
          {(field.options ?? []).map((option, index) => {
            const v = optionValue(option);
            if (v === null) return null;
            const checked = chosen.has(v);
            return (
              <label key={v || index} className="flex items-center gap-2 text-body-s lg:text-body-l">
                <input
                  type="checkbox"
                  name={submittedName}
                  // What a form post sends for a ticked box — without it the
                  // browser posts "on", which no option is.
                  value={v}
                  checked={checked}
                  onChange={(e) => {
                    const next = new Set(chosen);
                    if (e.target.checked) next.add(v);
                    else next.delete(v);
                    // Comma-joined, matching `CustomFieldValidator::
                    // splitChoices()` on the way back in.
                    onChange(field.key, Array.from(next).join(","));
                  }}
                />
                {optionLabel(option, locale)}
              </label>
            );
          })}
        </div>
      );
    }

    case "image":
    case "file":
      // The value is a REFERENCE from `POST /uploads`, never the file
      // (contract v0.1.34) — see `UploadField` for how the two are kept apart.
      return (
        <UploadField
          inputId={inputId}
          name={submittedName}
          locale={locale}
          accept={field.type === "image" ? "image/jpeg,image/png,image/webp" : undefined}
          required={field.required}
          value={value}
          fieldKey={field.key}
          onChange={onChange}
        />
      );

    case "date":
      return <input {...base} type="date" value={value} onChange={handleChange} />;

    case "time":
      return <input {...base} type="time" value={value} onChange={handleChange} />;

    case "email":
      return <input {...base} type="email" value={value} onChange={handleChange} />;

    case "number":
      // `text` + `inputMode`, not a native `type="number"`: a number input
      // silently drops a leading zero, and a player ID is an opaque string
      // that happens to be digits, not a quantity to do arithmetic on.
      return <input {...base} type="text" inputMode="numeric" value={value} onChange={handleChange} />;

    case "text":
    default:
      return <input {...base} type="text" value={value} onChange={handleChange} />;
  }
}
