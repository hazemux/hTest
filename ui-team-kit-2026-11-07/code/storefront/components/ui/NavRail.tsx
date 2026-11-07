"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isCurrentTab } from "@/lib/catalog/nav-tab";
import type { Locale } from "@/lib/i18n/locales";

export interface RailItem {
  key: string;
  href: string;
  label: string;
  icon: string | null;
  /** Opens in a new tab: a link that actually leaves the store. */
  leaves: boolean;
}

/**
 * The header's tab rail — Figma "Navbar" (`6883:34451` and its per-page
 * instances): a pill bar in the rail wash, the current tab a pill of the same
 * wash with its label and glyph in primary.
 *
 * A CLIENT COMPONENT FOR ONE REASON: which tab is current. The rail is drawn
 * by the locale LAYOUT, and an App Router layout does not re-render when the
 * customer navigates — it read the path once, on the page they landed on. So
 * the old server-rendered rail kept «الرئيسية» lit after the customer had
 * moved to «شحن الالعاب», and lit nothing after they came back home from a
 * category they had loaded directly. `usePathname()` follows every navigation
 * and is right on the first paint too, since it is rendered on the server with
 * the request's path.
 *
 * The rows themselves still come from the admin's menu (fetched by
 * `SiteHeader`), and the "is this the page we are on" rule is still
 * `isCurrentTab` — a category tab stays lit on every page beneath it, because
 * category URLs carry their whole chain from the root.
 */
export function NavRail({ locale, items }: { locale: Locale; items: readonly RailItem[] }) {
  const path = usePathname() ?? `/${locale}`;

  return (
    // `6883:34451`: 24px under the row, 56 tall — 8px padding, 24 on the
    // leading side — on the comp's own rail wash, 85px corners.
    <nav className="mt-6 hidden items-center justify-between rounded-[85px] bg-[var(--color-rail)] py-2 ps-2 pe-6 lg:flex">
      {items.map((item) => {
        const current = isCurrentTab(path, item.href, locale);

        return (
          <Link
            key={item.key}
            href={item.href}
            {...(item.leaves ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            /* The one thing a screen reader cannot get from a filled pill. */
            aria-current={current ? "page" : undefined}
            // Body/Regular-L (16/1.5). The CURRENT tab (`I6883:34451;4317:44844`)
            // lays the rail's own wash over itself, 8px padding and 52px
            // corners, with the label in primary.
            className={`flex shrink-0 items-center gap-2 rounded-[52px] text-body-l leading-[1.5] transition ${
              current
                ? "gap-1 bg-[var(--color-rail)] p-2 text-[var(--color-brand-500)]"
                : "text-[var(--color-ink)] hover:text-[var(--color-brand-500)]"
            }`}
          >
            <span>{item.label}</span>
            {/* A MASK in the label's colour, not an <img>: the glyphs are drawn
                in #212121, which vanished on the dark theme's rail. The current
                tab wears the pack's Bold weight, the others its Outline
                (ADR 0018) — two files, neither a recolour of the other. */}
            {item.icon ? (
              <span
                aria-hidden
                className="block size-6 shrink-0 bg-current [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]"
                style={{
                  maskImage: `url(/brand/icon-nav-${item.icon}${current ? "-active" : ""}.svg)`,
                  WebkitMaskImage: `url(/brand/icon-nav-${item.icon}${current ? "-active" : ""}.svg)`,
                }}
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
