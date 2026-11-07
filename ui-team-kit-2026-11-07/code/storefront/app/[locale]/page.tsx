import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { degradedHomeCopy, HomePage } from "@/components/home/HomePage";
import { JsonLd } from "@/components/seo/JsonLd";
import { publishedHomeLayout } from "@/lib/home/layout";
import { isLocale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { graph, organizationNode, websiteNode } from "@/lib/seo/schema";
import { pageMetadata } from "@/lib/seo/metadata";
import { storeSettings } from "@/lib/content/settings";

/**
 * The home page — laid out from the dashboard's Home page screen once staff
 * publish a layout (ADR 0026), and the standard page until they do. What is
 * drawn, and in what order, is `components/home/HomePage.tsx` and
 * `lib/home/sections.ts`.
 */
export async function generateMetadata(props: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await props.params;
  if (!isLocale(locale)) return {};
  const m = messagesFor(locale);
  // The owner's home title (2026-10-10), whole — the layout's "%s · ChargerQuick"
  // would repeat the brand. Its own description (Bing, 2026-11-01): the
  // tagline was 29 characters and shared with every page without one.
  return pageMetadata({ locale, path: "", title: m.seo.homeTitle, absoluteTitle: true, description: m.seo.homeDescription });
}

/** The store's public profiles — only those staff have actually filled in. */
async function socialProfiles(locale: "ar" | "en"): Promise<string[]> {
  const settings = await storeSettings(locale).catch(() => {
    degradedHomeCopy();
    return null;
  });
  const general = (settings as { data?: { general?: Record<string, unknown> } } | null)?.data?.general ?? {};
  return Object.entries(general)
    .filter(([key, value]) => key.startsWith("social_") && typeof value === "string" && value.startsWith("https://"))
    .map(([, value]) => value as string);
}

export default async function HomeRoute(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const m = messagesFor(locale);
  const [blocks, sameAs] = await Promise.all([publishedHomeLayout(locale, degradedHomeCopy), socialProfiles(locale)]);

  const structured = graph([
    organizationNode({ name: m.common.storeName, logo: "/brand/logo-chargerquick.svg", sameAs }),
    websiteNode({ locale, name: m.common.storeName }),
  ]);

  return (
    <>
      <JsonLd data={structured} />
      <HomePage locale={locale} blocks={blocks} />
    </>
  );
}
