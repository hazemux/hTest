import type { MetadataRoute } from "next";

import { messagesFor } from "@/lib/i18n/messages";

/**
 * The web app manifest (`/manifest.webmanifest`, Next's file convention): the
 * store on a phone's home screen under its Arabic name, opening on the Arabic
 * store in its own window. Arabic is the source language (HANDBOOK §4), so
 * the manifest is too: `lang`/`dir` say so, the way the root `<html>` does.
 *
 * No service worker and nothing offline: this only names and dresses the
 * shortcut. The theme colour is the light theme's `--color-brand-500`.
 */
export default function manifest(): MetadataRoute.Manifest {
  const m = messagesFor("ar");
  return {
    name: m.common.storeName,
    short_name: m.common.storeName,
    description: m.common.tagline,
    lang: "ar",
    dir: "rtl",
    start_url: "/ar",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#007bbf",
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any", purpose: "any" },
      { src: "/apple-icon.png", type: "image/png", sizes: "180x180" },
    ],
  };
}
