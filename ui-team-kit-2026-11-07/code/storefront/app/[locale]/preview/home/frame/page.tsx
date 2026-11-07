import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { HomePage } from "@/components/home/HomePage";
import { ApiError, previewHomeLayout } from "@/lib/api/client";
import { isLocale } from "@/lib/i18n/locales";

/**
 * THE PAGE INSIDE THE APP PREVIEW'S PHONE FRAME (Plan 4b, R15/R16): the app
 * surface's saved draft, bare. The outer page (`../page.tsx`) holds this in a
 * same-origin iframe, so the viewport breakpoints see a phone's width.
 *
 * A path of its own, not a query switch on the outer page, so the layout's
 * `SiteChrome` can leave the website's announcement bar, header, footer and
 * tab bar out of it by path (`STANDALONE`) — the app has none of those. The
 * token is checked here too: forged or expired is a 404, exactly as on the
 * outer page. Never indexed, never cached; `next.config.ts` marks the path
 * private and lets only our own origin frame it.
 *
 * DRAWN AS THE APP SEES THE CATALOGUE (ruling R19): the draft is read with
 * `X-Client-Platform` (`previewHomeLayout`'s `surface: "app"`), and
 * `HomePage`'s `appPreview` joins the rows against the category tree read
 * the same way (`lib/home/app-preview-reads.ts`) — so with the Exclusive list
 * on, app-only rows show and web-only ones drop, exactly as in the app.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function HomePreviewFrameRoute(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const [{ locale }, { token }] = await Promise.all([props.params, props.searchParams]);
  if (!isLocale(locale) || typeof token !== "string" || token === "") notFound();

  let blocks;
  try {
    blocks = (await previewHomeLayout(token, { locale, surface: "app" })).data.blocks;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return <HomePage locale={locale} blocks={blocks} appPreview />;
}
