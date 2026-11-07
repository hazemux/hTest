"use client";

import { useRouter } from "next/navigation";
import { use, useEffect } from "react";

import type { LegacyOption } from "@/lib/catalog/all-products";
import type { Locale } from "@/lib/i18n/locales";

/**
 * AN OLD `?option=slug:pack` LINK TO A LEAF opens the product it named, on
 * that pack. Until 2026-10-05 a leaf selling several products was one
 * purchase page, and shared or saved links name its options so.
 *
 * The one redirect done in the browser (plan D1): the category page is
 * shared by every visitor (ADR 0046 §2) and cannot read the query before it
 * answers, so this hop waits for it inside its own Suspense. Every other
 * category redirect depends on the path alone and stays a real 307/308.
 * Without JavaScript the same target is offered as a `<noscript>` meta
 * refresh in the server-rendered HTML, so a JS-off visitor or crawler lands
 * on the product too. The refresh holds the same relative path the hop
 * computes, built from the leaf's own product list and never from raw query
 * text (an unknown `?option=` renders nothing).
 *
 * `options` carries no money: keys, slugs and `?pack=` queries only,
 * computed on the server (`allProducts`).
 */
export function LegacyOptionRedirect({
  locale,
  options,
  searchParams,
}: {
  locale: Locale;
  options: readonly LegacyOption[];
  searchParams: Promise<{ option?: string | string[]; line?: string | string[] }>;
}) {
  const router = useRouter();
  const { option, line } = use(searchParams);
  const named = typeof option === "string" ? options.find((entry) => entry.key === option) : undefined;

  let href: string | null = null;
  if (named) {
    const query = new URLSearchParams(named.packQuery.slice(1));
    // A basket line being completed rides along, as it did on the server hop.
    // URLSearchParams percent-encodes it, so it cannot leave the query.
    if (typeof line === "string" && line !== "") query.set("line", line);
    href = `/${locale}/products/${encodeURIComponent(named.slug)}${query.size ? `?${query}` : ""}`;
  }

  useEffect(() => {
    if (href) router.replace(href);
  }, [href, router]);

  // React renders a `<noscript>`'s children on the server only (the client
  // skips them), and keeps a `<meta>` inside one in place instead of hoisting
  // it to the head. A browser with JavaScript off then honours the refresh.
  return href ? (
    <noscript>
      <meta httpEquiv="refresh" content={`0;url=${href}`} />
    </noscript>
  ) : null;
}
