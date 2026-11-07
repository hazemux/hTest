import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { getCatalogIndex, listMenus } from "@/lib/api/client";
import { CATALOG_REVALIDATE_SECONDS, CATALOG_TAG } from "@/lib/catalog/tags";
import { partnerCoupons } from "@/lib/content/partner-coupons";
import { sitemapEntries } from "@/lib/seo/sitemap-entries";

/**
 * /sitemap.xml — every indexable page in both languages, with hreflang
 * alternates and real lastmod dates (lib/seo/sitemap-entries.ts).
 *
 * Cached with the catalogue and dropped by the same `catalog.changed`
 * revalidation a price or product edit triggers, so a new product appears
 * here when it appears on the site.
 *
 * A FAILURE IS A FAILURE. If the API cannot answer, this errors rather than
 * serving an empty sitemap: an empty 200 would tell a search engine the site
 * has no pages.
 *
 * One file is enough: Google's limit is 50,000 URLs per sitemap and the
 * catalogue is about 2,250 on stage, 2026-10 (every visible product is
 * listed, both languages). Past ~40,000, split it with
 * `generateSitemaps` (whose `id` is a Promise in Next 16).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Per request, never at build: a build must not need the API up.
  await connection();
  const [index, codes, menus] = await Promise.all([
    // The whole catalogue in one read, rebuilt cold after every `catalog`
    // flush, and nothing a customer waits on — so far more than a page
    // read's 8 s (`lib/api/deadlines.ts`), or a large index fails the sitemap.
    getCatalogIndex({ next: { revalidate: CATALOG_REVALIDATE_SECONDS, tags: [CATALOG_TAG] }, deadlineMs: 30_000 }),
    // Never fails the sitemap: no answer lists the page as absent, the same
    // as no codes.
    partnerCoupons("ar"),
    // The content pages the menus link to. Never fails the sitemap either:
    // no answer lists the catalogue without them, as before.
    listMenus({ next: { revalidate: CATALOG_REVALIDATE_SECONDS, tags: ["menu"] } }).catch(() => null),
  ]);
  return sitemapEntries(index, { partnerCoupons: codes.length > 0, contentPages: menuPageSlugs(menus) });
}

/** Every `page` item's slug, in any menu (header or footer), once each. */
export function menuPageSlugs(menus: { data?: Record<string, unknown> } | null): string[] {
  const slugs = new Set<string>();
  for (const items of Object.values(menus?.data ?? {})) {
    if (!Array.isArray(items)) continue;
    for (const item of items as Array<{ type?: unknown; target?: unknown }>) {
      if (item?.type === "page" && typeof item.target === "string" && item.target !== "") slugs.add(item.target);
    }
  }
  return [...slugs];
}
