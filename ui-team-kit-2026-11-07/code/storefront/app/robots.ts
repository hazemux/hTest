import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { absoluteUrl, isIndexable } from "@/lib/seo/site";

/**
 * Crawlers that collect pages to TRAIN AI models — kept out entirely (owner,
 * 2026-10-28). Each is a separate token from the same company's search or
 * assistant crawler, so Google Search, Bing, Apple and AI search answers
 * (OAI-SearchBot, ChatGPT-User, Claude-SearchBot, PerplexityBot) still read
 * the store: `Google-Extended` and `Applebot-Extended` only govern training
 * and never Googlebot or Applebot. Robots.txt is a request, not a wall —
 * Cloudflare's AI-training setting stays on "disallow", which only states it.
 */
export const AI_TRAINING_CRAWLERS = [
  "GPTBot",
  "ClaudeBot",
  "anthropic-ai",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "Bytespider",
  "meta-externalagent",
  "cohere-training-data-crawler",
  "Diffbot",
  "omgili",
] as const;

/**
 * /robots.txt (docs/seo/indexing-policy.md §Crawling).
 *
 * PRODUCTION: everything crawlable except the storefront's own route
 * handlers (`/api/`) and the partner-code visit redirect, which counts
 * every hit — a crawler following each card would inflate what staff read. Private pages — basket, account, checkout, orders — are
 * NOT disallowed here: they carry `X-Robots-Tag: noindex`, and a crawler that
 * may not fetch a page can never read its noindex, so blocking them would
 * keep any already-known URL in the index. AI-training crawlers are
 * disallowed everywhere (AI_TRAINING_CRAWLERS above).
 *
 * ANYWHERE ELSE (staging, previews): `Disallow: /`. Staging also sends
 * `X-Robots-Tag: noindex` from Caddy. Neither is access control; staging's
 * protection from the public is a separate decision.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  // Per request: SITE_URL / SEO_INDEXABLE are read from the running server's environment, not frozen at build time.
  await connection();
  if (!isIndexable()) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/", "/*/partner-coupons/*/visit"] },
      { userAgent: [...AI_TRAINING_CRAWLERS], disallow: "/" },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
