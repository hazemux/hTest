/**
 * The desktop dropdown's box, shared by the animated layer
 * (`RewardsPanelLayer`) and `PointsChip`'s static stand-in, so the two can
 * never differ — and kept out of the lazy chunk so importing it costs nothing.
 */
export const DROPDOWN_CLASSES = "absolute end-0 top-full z-40 flex flex-col items-end pt-2 ltr:origin-top-right rtl:origin-top-left";
export const DROPDOWN_PANEL_CLASSES = "h-[min(720px,calc(100dvh-160px))] w-[380px] max-w-[calc(100vw-2rem)]";

/** The pointer under the chip: a rotated square tucked under the panel's gradient header. */
export function DropdownPointer() {
  return <span aria-hidden className="-mb-2 me-6 size-4 rotate-45 rounded-[2px] bg-[var(--color-brand-600)]" />;
}
