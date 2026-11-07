import Image from "next/image";
import type { ReactNode } from "react";

import { CURRENCY_ICON } from "@/lib/loyalty/currency-icon";

import { TIER_ARTWORK, TIER_GRADIENT } from "./art";
import { VipChip } from "./vip/VipChip";

/**
 * Small pieces every loyalty screen shares. Server-safe: no hooks, no browser
 * APIs, so a Server Component can render any of them.
 */

/**
 * A pack glyph painted as a mask, so it takes the colour class it is given in
 * both themes (the files are drawn in a fixed ink). `tone` is a Tailwind
 * background class — `bg-[var(--color-brand-500)]`, `bg-current`, …
 */
export function Glyph({ src, tone = "bg-current", className = "size-5" }: { src: string; tone?: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`block shrink-0 [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] ${tone} ${className}`}
      style={{ maskImage: `url(${src})`, WebkitMaskImage: `url(${src})` }}
    />
  );
}

/**
 * The design system's chevron (`icon-chevron-start`, drawn pointing left).
 * FORWARD points to the reading end — left in Arabic, right in English — and
 * BACK the other way. Mirrored by the `rtl:`/`ltr:` variants, never by a
 * locale check (HANDBOOK §4); `data-chevron` lets a test assert the side.
 */
export function Chevron({ to, className = "size-4", tone = "bg-[var(--color-ink-subtle)]" }: { to: "forward" | "back"; className?: string; tone?: string }) {
  return (
    <span
      aria-hidden
      data-chevron={to}
      className={`block shrink-0 [mask-image:url(/brand/icon-chevron-start.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:5px_10px] ${tone} ${to === "forward" ? "ltr:-scale-x-100" : "rtl:-scale-x-100"} ${className}`}
    />
  );
}

/** The loyalty coin — one file for every place points are shown. */
export function Coin({ size = 24, className }: { size?: number; className?: string }) {
  return <Image src={CURRENCY_ICON} alt="" aria-hidden width={size} height={size} unoptimized className={className ?? "shrink-0"} style={{ width: size, height: size }} />;
}

/** The raised white card the panel's sections sit on. */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col rounded-[16px] bg-[var(--color-surface-raised)] p-4 shadow-[0_0_12px_rgba(0,0,0,0.07)] ${className}`}>
      {children}
    </section>
  );
}

/**
 * A progress bar whose fill EASES when its value changes — a CSS transition on
 * the width, a state already on screen (HANDBOOK «Motion», rule 1). The first
 * paint is the final width.
 */
export function ProgressBar({ pct, fill = "bg-[image:var(--gradient-brand)]", className = "h-1.5", label }: { pct: number; fill?: string; className?: string; label?: string }) {
  const value = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <span
      role={label ? "progressbar" : undefined}
      aria-label={label}
      aria-valuenow={label ? value : undefined}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
      aria-hidden={label ? undefined : true}
      className={`flex overflow-hidden rounded-full bg-[var(--color-surface-subtle)] ${className}`}
    >
      <span
        className={`h-full rounded-full transition-[width] duration-[var(--cq-motion-slow)] ease-[var(--cq-ease-out)] ${fill}`}
        style={{ width: `${value}%` }}
      />
    </span>
  );
}

/**
 * A progress ring (perks, the current level). The arc starts at the top and
 * runs clockwise in English, counter-clockwise in Arabic — towards the
 * reading end — by mirroring the drawing with `rtl:`. The dash eases by CSS.
 */
export function Ring({ pct, size = 44, radius = 15, stroke = 3.5, children }: { pct: number; size?: number; radius?: number; stroke?: number; children?: ReactNode }) {
  const circumference = 2 * Math.PI * radius;
  const value = Math.max(0, Math.min(100, pct));
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg aria-hidden viewBox="0 0 36 36" width={size} height={size} data-ring="" className="absolute inset-0 rtl:-scale-x-100">
        <circle cx="18" cy="18" r={radius} fill="none" stroke="var(--color-surface-subtle)" strokeWidth={stroke} />
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          stroke="var(--color-brand-500)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(value * circumference) / 100} ${circumference}`}
          transform="rotate(-90 18 18)"
          className="transition-[stroke-dasharray] duration-[var(--cq-motion-slow)] ease-[var(--cq-ease-out)]"
        />
      </svg>
      {children}
    </span>
  );
}

/**
 * A level's mark. The design draws each level's own artwork
 * (`brand/tier-<code>.png`); until those files are in `public/brand/` the
 * mark is the design's own fallback — the level's gradient behind a star —
 * and no image is requested, so nothing 404s and nothing is invented.
 */
export function TierMark({ code, size = 52, dimmed = false }: { code: string; size?: number; dimmed?: boolean }) {
  const art = TIER_ARTWORK[code] ?? null;
  if (art) {
    return (
      <Image
        src={art}
        alt=""
        aria-hidden
        width={size}
        height={size}
        unoptimized
        className={`shrink-0 object-contain ${dimmed ? "opacity-60 grayscale-[0.6]" : ""}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      data-tier-mark={code}
      className={`grid shrink-0 place-items-center rounded-full ${TIER_GRADIENT[code] ?? TIER_GRADIENT.platinum} ${dimmed ? "opacity-60 grayscale-[0.6]" : ""}`}
      style={{ width: size, height: size }}
    >
      <Glyph src="/brand/icon-star-rate-filled.svg" tone="bg-[var(--color-on-primary)]" className="size-[45%]" />
    </span>
  );
}

/** A small rounded status pill. */
/**
 * ADR 0044 — «VIP» beside the tier, while the customer is inside a VIP
 * period (the server's `wallet.vip`, set only while VIP is on). A label, not
 * a control. The «VIP Experience» chip: navy, a gold hairline, the crest.
 */
export function VipBadge({ label }: { label: string }) {
  return (
    <span data-testid="vip-badge" className="inline-flex shrink-0">
      <VipChip label={label} />
    </span>
  );
}

export function Pill({ children, tone, className = "" }: { children: ReactNode; tone: string; className?: string }) {
  return <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-caption-xs font-extrabold ${tone} ${className}`}>{children}</span>;
}

/** A filter/tab chip in a row of them. */
export function ChipButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-caption font-bold transition-colors ${
        active ? "bg-[var(--color-brand-500)] text-[var(--color-on-primary)]" : "bg-[var(--color-chip)] text-[var(--color-ink-muted)]"
      }`}
    >
      {children}
    </button>
  );
}

/** Two-way segmented control (points | balance). */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: readonly { key: T; label: string }[]; onChange: (next: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex rounded-[30px] bg-[var(--color-primary-wash-lighter)] p-[3px]">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          role="tab"
          aria-selected={value === option.key}
          onClick={() => onChange(option.key)}
          className={`flex-1 rounded-[40px] px-4 py-2 text-center text-body-s font-bold transition-colors ${
            value === option.key ? "bg-[var(--color-brand-500)] text-[var(--color-on-cta)]" : "text-[var(--color-ink-muted)]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
