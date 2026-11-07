import { useSvgId } from "@/lib/loyalty/svg-id";

/**
 * The VIP crest (Claude Design «VIP Experience»): a crown over a medal that
 * carries the logo's bolt. Full colour from 40 px; below that use the mono
 * crest (`VipCrestMono`). The light band crosses it only from 72 px, and
 * only with motion (`.cq-vip-crest-sweep`, mirrored in Arabic; gone under
 * reduced motion).
 *
 * Drawn inline rather than as `<img src="/brand/vip-crest.svg">` because the
 * band is part of the drawing; the shipped file is the same artwork without
 * it. Ids come from `useId()` — the crest can sit on one page twice (the
 * hero and the welcome sheet) and a repeated gradient id paints from
 * whichever copy came first, hidden or not. Colours are the `--vip-crest-*`
 * tokens (`app/globals.css`).
 */
export function VipCrest({ size = 64, sweep = true, className }: { size?: number; sweep?: boolean; className?: string }) {
  const id = useSvgId("cqc");
  const ref = (name: string) => `url(#${id}-${name})`;
  const stop = (offset: string, token: string) => <stop offset={offset} style={{ stopColor: `var(${token})` }} />;

  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className={`block shrink-0 overflow-visible ${className ?? ""}`}>
      <defs>
        <linearGradient id={`${id}-medal`} x1="14" y1="18" x2="52" y2="60" gradientUnits="userSpaceOnUse">
          {stop("0", "--vip-crest-medal-1")}
          {stop(".55", "--vip-crest-medal-2")}
          {stop("1", "--vip-crest-medal-3")}
        </linearGradient>
        <linearGradient id={`${id}-gold`} x1="16" y1="4" x2="48" y2="60" gradientUnits="userSpaceOnUse">
          {stop("0", "--vip-crest-gold-1")}
          {stop(".35", "--vip-crest-gold-2")}
          {stop(".7", "--vip-crest-gold-3")}
          {stop("1", "--vip-crest-gold-4")}
        </linearGradient>
        <linearGradient id={`${id}-bt`} x1="0" y1="0" x2="0" y2="1">
          {stop("0", "--vip-crest-bolt-top-1")}
          {stop("1", "--vip-crest-bolt-top-2")}
        </linearGradient>
        <linearGradient id={`${id}-bl`} x1="0" y1="0" x2="0" y2="1">
          {stop("0", "--vip-crest-bolt-low-1")}
          {stop("1", "--vip-crest-bolt-low-2")}
        </linearGradient>
        <linearGradient id={`${id}-sw`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: "var(--vip-on-navy)", stopOpacity: 0 }} />
          <stop offset=".5" style={{ stopColor: "var(--vip-on-navy)", stopOpacity: 0.6 }} />
          <stop offset="1" style={{ stopColor: "var(--vip-on-navy)", stopOpacity: 0 }} />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          <circle cx="32" cy="38" r="21" />
        </clipPath>
      </defs>
      <path d="M17 19.5 19.6 7.2l6.6 5.6L32 4.4l5.8 8.4 6.6-5.6L47 19.5Z" fill={ref("gold")} />
      <circle cx="19.6" cy="6.6" r="1.9" fill={ref("gold")} />
      <circle cx="32" cy="3.6" r="2.1" fill={ref("gold")} />
      <circle cx="44.4" cy="6.6" r="1.9" fill={ref("gold")} />
      <circle cx="32" cy="38" r="23" fill={ref("gold")} />
      <circle cx="32" cy="38" r="21" fill={ref("medal")} />
      <g transform="translate(19.9 22.6) scale(.225)">
        <path d="M89.53 0C80 17 60.56 52.07 55.93 58.54h6.44L47.49 77.63h-7.16Z" fill={ref("bt")} />
        <path d="M62.37 58.54h32.15L18.25 137.25l33.64-59.62h-4.4Z" fill={ref("bl")} />
      </g>
      {sweep && size >= 72 ? (
        <g clipPath={ref("clip")}>
          <rect data-vip-sweep="" className="cq-vip-crest-sweep" x="10" y="14" width="12" height="48" fill={ref("sw")} />
        </g>
      ) : null}
    </svg>
  );
}

/**
 * The mono crest for 12–24 px — a mask over `currentColor`'s stand-in, the
 * element's background (`bg-…`), so it takes whatever colour the chip or
 * row gives it (gold on navy, brand blue on light).
 */
export function VipCrestMono({ className, style }: { className: string; style?: React.CSSProperties }) {
  return (
    <span
      aria-hidden
      style={style}
      className={`block shrink-0 [mask-image:url(/brand/vip-crest-mono.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] ${className}`}
    />
  );
}
