"use client";

import { useLayoutEffect } from "react";

import { THEME_COOKIE } from "@/lib/theme/theme";

/**
 * The theme for a page THEME_SCRIPT never ran on (ADR 0046 §4). The script
 * runs while the server's HTML is parsed, but a real 404 is an empty
 * `<html id="__next_error__">` shell painted on the client
 * (`app/[locale]/not-found.tsx`), and React never executes an inline
 * <script> it creates — so without this, a dark-theme visitor got a light
 * 404. React's StrictMode remount in development also drops the attribute
 * (preventing-flash-before-hydration.md).
 *
 * ONLY WHEN THE ATTRIBUTE IS MISSING: whatever is already on <html> — the
 * script's answer, or a toggle whose cookie the browser refused — stays.
 * Mounted once, in the root layout; before paint, so no flash.
 */
export function ThemeFromCookie(): null {
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (root.hasAttribute("data-theme")) return;
    const stored = document.cookie.match(new RegExp(`(?:^|; )${THEME_COOKIE}=([^;]*)`))?.[1];
    root.dataset.theme = stored === "dark" ? "dark" : "light";
  }, []);

  return null;
}
