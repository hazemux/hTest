import { VipCrestMono } from "./VipCrest";

/**
 * The VIP chip (Claude Design «VIP Experience», component sheet): navy fill,
 * a gold hairline and white words, so it reads the same on light, dark and
 * a Bronze frame. Gold is the stroke and the crest, never the text.
 *
 * `«VIP»` beside a name; `«×1.5 VIP»` beside points the VIP multiplier is in
 * — the multiplier is the SERVER's string (`points_vip_multiplier`, or the
 * programme's `vip.multiplier`), trimmed of trailing zeros, never computed.
 * The figure reads left to right in Arabic too (`bdi dir="ltr"`).
 */
export function VipChip({ multiplier, label, className }: { multiplier?: string | null; label?: string; className?: string }) {
  const factor = multiplier ? trimMultiplier(multiplier) : null;
  return (
    <span
      data-vip-chip={factor ? "boost" : "badge"}
      aria-label={label}
      className={`inline-flex h-5 shrink-0 items-center gap-[3px] whitespace-nowrap rounded-full bg-[var(--vip-navy)] px-1.5 text-caption-xs font-extrabold leading-none text-[var(--vip-on-navy)] shadow-[inset_0_0_0_1px_var(--vip-gold)] ${className ?? ""}`}
    >
      <VipCrestMono className="size-3 bg-[var(--vip-gold)]" />
      <bdi dir="ltr">{factor ? `×${factor} VIP` : "VIP"}</bdi>
    </span>
  );
}

/** «1.50» → «1.5», «2.00» → «2»: the server's string, only its trailing zeros dropped. */
export function trimMultiplier(multiplier: string): string {
  return multiplier.includes(".") ? multiplier.replace(/\.?0+$/, "") : multiplier;
}

/**
 * «×1.5» as one left-to-right run inside a sentence (LRI … PDI): in Arabic
 * the bare «×1.5» reorders to «1.5×». For copy; the chip uses `<bdi>`.
 */
const LRI = String.fromCodePoint(0x2066);
const PDI = String.fromCodePoint(0x2069);

export function factorText(multiplier: string): string {
  return `${LRI}×${trimMultiplier(multiplier)}${PDI}`;
}
