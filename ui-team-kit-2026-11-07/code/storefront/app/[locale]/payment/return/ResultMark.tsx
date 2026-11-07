/**
 * The 84px disc at the head of the payment result, and what sits in it.
 *
 * THE DRAWING TICK IS FOR `done` ONLY, and `done` is only ever the captured
 * outcome — the page passes it from the one branch that runs when the server
 * read `payment_state: captured`. So the tick exists nowhere a failed,
 * expired, unfinished or confirming payment could show it, and a re-render by
 * `AutoRefresh` that turns «confirming» into «paid» draws it then, because
 * the server chose that branch. No success animation before the server says
 * so (HANDBOOK «Motion» rule 6). Every other outcome keeps its flat mask icon
 * and spinner exactly as before.
 *
 * The tick is a stroked path with `pathLength="1"` so `.cq-tick-draw` can
 * draw it once; under reduced motion it is simply drawn complete.
 */
export type ResultTone = "done" | "failed" | "pending";

export function ResultMark({ tone }: { tone: ResultTone }) {
  const wash =
    tone === "done" ? "bg-[var(--color-success-subtlest)]" : tone === "failed" ? "bg-[var(--color-error-subtlest)]" : "bg-[var(--color-info-wash)]";
  const ink = "bg-[var(--color-danger)]";
  const icon = "/brand/icon-order-failed.svg";

  return (
    <span aria-hidden className={`grid size-[84px] place-items-center rounded-full ${wash}`}>
      {tone === "pending" ? (
        <span className="size-10 rounded-full border-4 border-[var(--color-info)] border-t-transparent motion-safe:animate-spin" />
      ) : tone === "done" ? (
        // The comp's mark (`/brand/icon-tick-circle.svg`): a filled success
        // disc with the tick CUT OUT of it. Redrawn as the disc plus a tick
        // stroked in the wash behind it, so once drawn it reads the same.
        <svg viewBox="0 0 24 24" fill="none" className="block size-[42px]">
          <circle cx="12" cy="12" r="10" style={{ fill: "var(--color-success)" }} />
          <path
            className="cq-tick-draw"
            pathLength="1"
            d="M7 11.8 8.9 13.9C9.6 14.7 10.2 15 10.75 15S11.9 14.7 12.6 13.9L17 9"
            style={{ stroke: "var(--color-success-subtlest)" }}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <span
          className={`block size-[42px] ${ink} [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]`}
          style={{ maskImage: `url(${icon})`, WebkitMaskImage: `url(${icon})` }}
        />
      )}
    </span>
  );
}
