import Image from "next/image";

import { LCP_IMAGE } from "@/lib/brand/image-priority";
import type { ResolvedBannerImage } from "@/lib/content/banner-image";

/**
 * A banner picture in both themes (ADR 0046 §4). The server does not know
 * the theme, so both artworks are in the HTML and `cq-light-theme-only` /
 * `cq-dark-theme-only` (globals.css) hide one. Both LAZY: a browser does not
 * fetch a lazy image that is `display:none`, so only the visible artwork
 * downloads; `fetchPriority="high"` still puts the LCP one first (next/image
 * docs, ThemeImage). One upload for both themes is ONE image, which may be
 * preloaded like any LCP (`LCP_IMAGE`, HANDBOOK §7.5).
 *
 * NEVER a preload or an eager load for a pair: a preload ignores
 * `display:none`, so a dark-theme visitor would download both artworks.
 */
export function ThemeImage({
  images,
  sizes,
  className = "object-cover",
  lcp = false,
}: {
  images: { light: ResolvedBannerImage; dark: ResolvedBannerImage };
  sizes: string;
  className?: string;
  /** The page's LCP picture — only a top banner's first slide. */
  lcp?: boolean;
}) {
  if (images.light.url === images.dark.url) {
    return <Image src={images.light.url} alt={images.light.alt} fill sizes={sizes} className={className} {...(lcp ? LCP_IMAGE : {})} />;
  }
  const highFetch = lcp ? { fetchPriority: "high" as const } : {};
  return (
    <>
      <Image src={images.light.url} alt={images.light.alt} fill sizes={sizes} loading="lazy" className={`cq-light-theme-only ${className}`} {...highFetch} />
      <Image src={images.dark.url} alt={images.dark.alt} fill sizes={sizes} loading="lazy" className={`cq-dark-theme-only ${className}`} {...highFetch} />
    </>
  );
}
