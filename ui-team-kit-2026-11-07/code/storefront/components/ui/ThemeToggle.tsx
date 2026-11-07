"use client";

import { useSyncExternalStore } from "react";

import { SwitchThumb, switchTrackClass } from "@/components/ui/Switch";
import { switchThemeThroughPortal } from "@/lib/portal/theme";
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE, paintThemeColor } from "@/lib/theme/theme";

/**
 * Switches the store between the light and dark comps.
 *
 * TWO WRITES, AND BOTH ARE NEEDED. The attribute on `<html>` is what the
 * stylesheet reads, so setting it repaints the page instantly — no round
 * trip, which is what a theme switch should feel like; every banner already
 * carries both artworks (`ThemeImage`), so the art switches with it. The
 * cookie is what `THEME_SCRIPT` (`lib/theme/script.ts`) reads before the
 * first paint of the NEXT page. Nothing on the server reads the theme any
 * more (ADR 0046 §4), so there is no refresh.
 *
 * SUBSCRIBED TO THE ATTRIBUTE, not mirroring it into state. The theme
 * script sets `data-theme` from the cookie, so the attribute is correct
 * before React runs and is the one source of truth; `useSyncExternalStore` reads it
 * where React can track it, and the `MutationObserver` means a second copy of
 * this control (the phone drawer and the desktop account menu both carry one)
 * follows along without either knowing about the other.
 */
export function ThemeToggle({
  labels,
  className = "",
}: {
  /**
   * Named for the mode the control switches TO, not the one it is in — a
   * button labelled with the state you are already in reads as a status line
   * and gets ignored.
   */
  labels: { dark: string; light: string };
  className?: string;
}) {
  const { dark, toggle } = useThemeToggle();

  return (
    <button type="button" onClick={(event) => toggle(event.currentTarget)} aria-pressed={dark} className={className}>
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        width={20}
        height={20}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-5 shrink-0"
      >
        {dark ? (
          // Sun — what the control switches TO from dark.
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          // Moon.
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        )}
      </svg>
      <span>{dark ? labels.light : labels.dark}</span>
    </button>
  );
}

/**
 * «الوضع الليلي» as a real switch (the drawer and the settings page, «Side
 * Menu Mobile» / «Settings Mobile», 2026-09-30): named for the dark mode and
 * checked while it is on — a switch says its state, where the button above
 * names what it switches TO. Same toggle, same cookie; the look is the
 * shared one (`components/ui/Switch.tsx`).
 */
export function ThemeSwitch({ label, className = "" }: { label: string; className?: string }) {
  const { dark, toggle } = useThemeToggle();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={label}
      onClick={(event) => toggle(event.currentTarget)}
      className={`${switchTrackClass(dark)} ${className}`}
    >
      <SwitchThumb on={dark} />
    </button>
  );
}

function useThemeToggle(): { dark: boolean; toggle: (from: Element | null) => void } {
  const dark = useSyncExternalStore(subscribe, isDark, serverIsDark);

  function toggle(from: Element | null) {
    // READ THE DOM, not `dark`. The subscription delivers on a microtask, so
    // between a click and the re-render this component's own value is one
    // step behind the attribute it is toggling — and two quick clicks would
    // both compute "dark" and the theme would stick.
    const next = isDark() ? "light" : "dark";

    // Through the language switch's portal when its flag is on (opening from
    // this switch); at once otherwise. The attribute is set either way.
    switchThemeThroughPortal(from, () => {
      document.documentElement.dataset.theme = next;
      paintThemeColor(next);
    });
    // `SameSite=Lax` because nothing cross-site should be choosing a theme,
    // and no `Secure` flag so it still works over plain http in development;
    // there is nothing in it worth protecting in transit.
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
  }

  return { dark, toggle };
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function isDark(): boolean {
  return document.documentElement.dataset.theme === "dark";
}

/**
 * The server renders the light label in the one case this is ever consulted:
 * a render where the DOM does not exist yet. The real answer is on `<html>`
 * by then, so the first client render reads it and the two agree.
 */
function serverIsDark(): boolean {
  return false;
}
