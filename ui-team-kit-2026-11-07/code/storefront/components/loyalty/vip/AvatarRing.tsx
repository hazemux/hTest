import { useSvgId } from "@/lib/loyalty/svg-id";

import { VipCrestMono } from "./VipCrest";

/**
 * The customer's avatar in its loyalty frame (Claude Design «VIP
 * Experience», frames 10a–10e): a metal ring per tier — bronze, silver,
 * gold, platinum — and, for a VIP member, the brand halo outside it and the
 * crest badge at the ring's top END (top-left in Arabic, top-right in
 * English: `inset-inline-end`, never a direction prop).
 *
 * - Sizes 32 · 40 · 56 · 96, the geometry the canvas draws (ring width
 *   8/7/6/5 on a 100 grid). From 56 the badge is a «VIP» pill, below it a
 *   crest dot; the gold sparkle shows from 40.
 * - The tile shape (23 % corners — the store's character tile, the one the
 *   drawer and the account page draw) or a circle for round places.
 * - No character chosen: the full ChargerQuick mark on the brand wash.
 * - A tier this build has no metal for (staff may add levels) or no tier at
 *   all: no ring — the plain avatar, and the halo still says VIP.
 *
 * Motion is CSS only and never on text: the sheen travels the frame
 * (`.cq-vip-sheen`, the other way in Arabic), platinum cross-fades a second
 * pearl, gold sparkles, the halo breathes; under reduced motion the frame is
 * still and the halo fixed at half. Gradient ids are per instance
 * (`useSvgId`): the header, the drawer and the account menu can all draw one.
 */
export type AvatarRingSize = 32 | 40 | 56 | 96;

const TIERS = ["bronze", "silver", "gold", "platinum"] as const;
type Metal = (typeof TIERS)[number];

/** Ring width on the 100 grid, per rendered size. */
const STROKE: Record<AvatarRingSize, number> = { 32: 8, 40: 7, 56: 6, 96: 5 };
/** Seconds for the sheen to travel the frame, and the sheen's opacity. */
const SHEEN: Record<Metal, [number, number]> = { bronze: [14, 0.45], silver: [9, 1], gold: [8, 0.9], platinum: [12, 0.8] };
/** Badge: height, pill font size, crest size, inline padding (px). */
const BADGE: Record<AvatarRingSize, [number, number, number, number]> = { 96: [24, 12, 13, 8], 56: [18, 10, 10, 5], 40: [17, 0, 11, 0], 32: [15, 0, 10, 0] };
/** Gradient stop offsets; the colours are `--vip-ring-<metal>-1…5`. */
const OFFSETS: Record<Metal, string[]> = {
  bronze: ["0", ".3", ".5", ".75", "1"],
  silver: ["0", ".3", ".55", ".8", "1"],
  gold: ["0", ".3", ".5", ".75", "1"],
  platinum: ["0", ".25", ".5", ".75", "1"],
};
/** Platinum's second pearl: the same five colours, the other diagonal and order. */
const PEARL_B: [string, number][] = [["0", 5], [".3", 4], [".55", 2], [".8", 3], ["1", 1]];

export function metalOf(tier: string | null | undefined): Metal | null {
  return (TIERS as readonly string[]).includes(tier ?? "") ? (tier as Metal) : null;
}

export function AvatarRing({
  size,
  tier,
  vip = false,
  src,
  label,
  shape = "tile",
  className,
}: {
  size: AvatarRingSize;
  /** The wallet's tier CODE (`bronze` … `platinum`); anything else draws no ring. */
  tier: string | null | undefined;
  vip?: boolean;
  /** The customer's chosen character (`GET /me` avatar), or none. */
  src?: string | null;
  /** The accessible name («أحمد · ذهبي · VIP»); without one the picture is decorative. */
  label?: string;
  shape?: "tile" | "circle";
  className?: string;
}) {
  const id = useSvgId("cqr");
  const metal = metalOf(tier);
  const sw = STROKE[size];
  const tile = shape === "tile";
  const outer = vip ? 45.5 : 49;
  const ringR = outer - sw / 2;
  const avatarR = ringR - sw / 2 - (size >= 56 ? 2 : 1.5);
  const corner = (r: number) => (tile ? Number((r * 0.46).toFixed(2)) : r);
  const haloR = 48.4;
  const inset = Number(((size * (50 - avatarR)) / 100).toFixed(2));
  const big = size >= 56;
  const [badgeH, badgeFont, badgeIcon, badgePad] = BADGE[size];
  const [traceSeconds, sheenOpacity] = metal ? SHEEN[metal] : [8, 0];
  const ring = { x: 50 - ringR, size: ringR * 2, rx: corner(ringR) };
  const halo = { x: 50 - haloR, size: haloR * 2, rx: corner(haloR) };
  const stop = (offset: string, token: string) => <stop key={offset} offset={offset} style={{ stopColor: `var(${token})` }} />;

  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-avatar-ring={metal ?? "none"}
      data-vip={vip ? "" : undefined}
      className={`relative inline-block shrink-0 align-middle ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden className="absolute inset-0 overflow-visible">
        <defs>
          {metal ? (
            <linearGradient id={`${id}-m`} x1="0" y1="0" x2="1" y2="1">
              {OFFSETS[metal].map((offset, i) => stop(offset, `--vip-ring-${metal}-${i + 1}`))}
            </linearGradient>
          ) : null}
          {metal === "platinum" ? (
            <linearGradient id={`${id}-p`} x1="1" y1="0" x2="0" y2="1">
              {PEARL_B.map(([offset, n]) => stop(offset, `--vip-ring-platinum-${n}`))}
            </linearGradient>
          ) : null}
          {vip ? (
            <linearGradient id={`${id}-h`} x1="0" y1="1" x2="1" y2="0">
              {stop("0", "--vip-blue")}
              {stop(".6", "--vip-sky")}
              {stop("1", "--vip-gold")}
            </linearGradient>
          ) : null}
        </defs>

        {vip ? (
          <>
            <rect className="cq-vip-glow" data-vip-halo="" x={halo.x} y={halo.x} width={halo.size} height={halo.size} rx={halo.rx} fill="none" style={{ stroke: "var(--vip-sky)" }} strokeWidth="3.6" />
            <rect x={halo.x} y={halo.x} width={halo.size} height={halo.size} rx={halo.rx} fill="none" stroke={`url(#${id}-h)`} strokeWidth={size <= 40 ? 2.4 : 1.8} />
          </>
        ) : null}

        {metal ? (
          <>
            <rect x={ring.x} y={ring.x} width={ring.size} height={ring.size} rx={ring.rx} fill="none" stroke={`url(#${id}-m)`} strokeWidth={sw} />
            {metal === "platinum" ? (
              <rect className="cq-vip-iri" x={ring.x} y={ring.x} width={ring.size} height={ring.size} rx={ring.rx} fill="none" stroke={`url(#${id}-p)`} strokeWidth={sw} />
            ) : null}
            <g style={{ opacity: sheenOpacity, ["--cq-vip-trace" as string]: `${traceSeconds}s` }}>
              <rect className="cq-vip-sheen" x={ring.x} y={ring.x} width={ring.size} height={ring.size} rx={ring.rx} fill="none" style={{ stroke: "var(--vip-ring-sheen)" }} strokeOpacity=".35" strokeWidth={sw} strokeLinecap="round" pathLength={100} strokeDasharray="16 84" />
              <rect className="cq-vip-sheen" x={ring.x} y={ring.x} width={ring.size} height={ring.size} rx={ring.rx} fill="none" style={{ stroke: "var(--vip-ring-sheen)" }} strokeOpacity=".7" strokeWidth={Math.max(2, sw / 2)} strokeLinecap="round" pathLength={100} strokeDasharray="6 94" strokeDashoffset="-5" />
            </g>
            {metal === "gold" && size >= 40 ? (
              <>
                {/* Top-START corner: top-left in English, top-right in Arabic. */}
                <path className="cq-vip-sparkle rtl:hidden" d="M16 6l1.8 6.2 6.2 1.8-6.2 1.8L16 22l-1.8-6.2-6.2-1.8 6.2-1.8Z" style={{ fill: "var(--vip-ring-sheen)" }} />
                <path className="cq-vip-sparkle ltr:hidden" d="M84 6l1.8 6.2 6.2 1.8-6.2 1.8L84 22l-1.8-6.2-6.2-1.8 6.2-1.8Z" style={{ fill: "var(--vip-ring-sheen)" }} />
              </>
            ) : null}
          </>
        ) : null}
      </svg>

      <span
        className="absolute grid place-items-center overflow-hidden bg-[var(--color-primary-wash-lighter)]"
        style={{ inset, borderRadius: tile ? "23%" : "9999px" }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- a staff-uploaded character at a few dozen pixels; the callers already drew it unoptimised
          <img src={src} alt="" className="absolute inset-0 block size-full object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- the brand mark, a static SVG
          <img src="/brand/logo-chargerquick-mark.svg" alt="" data-avatar-fallback="" className="absolute inset-[17%] block size-[66%] object-contain" />
        )}
      </span>

      {vip && big ? (
        <span
          data-vip-badge="pill"
          className="absolute box-border flex items-center gap-0.5 rounded-full bg-[var(--vip-navy)] font-extrabold leading-none text-[var(--vip-on-navy)] shadow-[0_0_0_1.5px_var(--vip-gold),0_2px_6px_rgba(14,27,35,0.35)]"
          style={{ top: -Math.round(badgeH * 0.25), insetInlineEnd: -Math.round(size * 0.08), height: badgeH, paddingInline: badgePad, fontSize: badgeFont }}
        >
          <VipCrestMono className="bg-[var(--vip-gold)]" style={{ width: badgeIcon, height: badgeIcon }} />
          <span>VIP</span>
        </span>
      ) : null}
      {vip && !big ? (
        <span
          data-vip-badge="dot"
          className="absolute grid place-items-center rounded-full bg-[var(--vip-navy)] shadow-[0_0_0_1.5px_var(--vip-gold)]"
          style={{ top: -3, insetInlineEnd: -3, width: badgeH, height: badgeH }}
        >
          <VipCrestMono className="bg-[var(--vip-gold)]" style={{ width: badgeIcon, height: badgeIcon }} />
        </span>
      ) : null}
    </span>
  );
}
