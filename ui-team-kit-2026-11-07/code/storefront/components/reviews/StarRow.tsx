/**
 * Five stars, the first `rating` lit — the review cards' `Stars` row. Drawn
 * as masks of `icon-star-small.svg` so the colour is a token (light and dark):
 * `gold` on the product page (Figma 7513:30944), `ink` on the home page's
 * cards (6847:98003). The stars are the picture; the label is the fact, so
 * assistive tech hears «4 من 5 نجوم» once instead of five images.
 */
export function StarRow({
  rating,
  label,
  size = "sm",
  tone = "gold",
}: {
  rating: number;
  label: string;
  /** xs = 8px (home phone), sm = 12px. */
  size?: "xs" | "sm";
  tone?: "gold" | "ink";
}) {
  const box = size === "xs" ? "size-2 lg:size-3" : "size-3";
  const lit = tone === "gold" ? "bg-[var(--color-warning)]" : "bg-[var(--color-ink)]";

  return (
    <span role="img" aria-label={label} className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          aria-hidden
          className={`block shrink-0 ${box} ${n <= rating ? lit : "bg-[var(--color-line)]"} [mask-image:url(/brand/icon-star-small.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]`}
        />
      ))}
    </span>
  );
}
