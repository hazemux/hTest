/**
 * The plate a product or category shows while it has no artwork.
 *
 * The catalogue arrived from JoyGames without images (owner decision:
 * they will be redesigned), so for a while most tiles are empty. An empty
 * grey square reads as a broken page; a blank brand-blue square reads as a
 * button that does nothing. A large initial on a soft gradient reads as a
 * card that simply has no picture yet — and it tells the two "PUBG" tiles
 * apart from the two "Yalla" tiles at a glance.
 *
 * ONE TREATMENT, DELIBERATELY QUIET. An earlier pass gave the mobile home a
 * saturated `brand-500` plate because that is what the comp's tile wells are
 * filled with — but in the comp every well is covered by artwork, so the fill
 * is never actually seen. With 482 imported products carrying no art, that
 * choice turned the home page into a wall of solid blue squares: the loudest
 * thing on the screen was the data we are missing. A pale wash lets the tiles
 * that DO have art lead, which is the comp's actual composition.
 *
 * The wash is built from `brand-50`/`brand-100`, so the dark theme moves it
 * with the rest of the ramp rather than needing a second rule here.
 *
 * Purely decorative: the name is already the tile's caption.
 */
export function ArtworkPlaceholder({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  const initial = firstGrapheme(name);

  return (
    <span
      aria-hidden
      className={`absolute inset-0 flex select-none items-center justify-center bg-[linear-gradient(135deg,var(--color-brand-50),var(--color-brand-100))] text-[var(--color-brand-500)] ${className}`}
    >
      <span className="text-[28px] font-bold leading-none sm:text-[36px] lg:text-[44px]">{initial}</span>
    </span>
  );
}

function firstGrapheme(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") return "";

  // A grapheme, not a UTF-16 unit: an Arabic letter with a mark, or an
  // emoji, must not be cut in half.
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(trimmed);
    for (const segment of segments) return segment.segment.toUpperCase();
  }

  return trimmed.charAt(0).toUpperCase();
}
