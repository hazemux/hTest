import Image from "next/image";
import Link from "next/link";

import { BannerSlider, type BannerFrame, type BannerSliderLabels } from "@/components/home/BannerSlider";
import { ThemeImage } from "@/components/home/ThemeImage";
import type { BannerSlot } from "@/lib/content/banners";

/**
 * A category page's promo plate — pure artwork, like every promo in the comps.
 *
 * WHAT FILLS IT, in order:
 *   1. the category's OWN banners (`category_page`, owner 2026-10-07 — staff
 *      add them on that category's screen; never a parent's): one is a linked
 *      plate, several are a slider in the same plate;
 *   2. else the category's own hero picture (`images.hero_desktop` /
 *      `hero_mobile`), which links nowhere;
 *   3. else nothing — the comps' empty gradient plate is a placeholder, not
 *      content.
 *
 * THE COMPS PUT IT IN TWO PLACES. Desktop draws it at the TOP of the page
 * (`6877:142149` 1200×248 on the index, `6877:140309` 1200×280 on the products
 * list); the phone draws it UNDER the tiles (`6904:22758` 316×124,
 * `6847:96404` / `6847:96405` 312×185). So a page renders this twice,
 * `where="top"` and `where="bottom"`, and each copy is `display:none` at the
 * other size — the image loads once per viewport and the link is in the tree
 * once. Neither copy is preloaded (`LCP_IMAGE`): a preload ignores
 * `display:none` and would fetch both. For the same reason a banner's two
 * theme pictures (`ThemeImage`, ADR 0046 §4) are lazy and never `lcp` here.
 */
export function CategoryBanner({
  slides = [],
  hero,
  where,
  shape,
  labels,
  className = "",
}: {
  /** The category's own published banners, each slide resolved for this reader. */
  slides?: readonly BannerSlot[];
  /** The category's own hero picture — the fallback, which links nowhere. */
  hero: { url: string; alt: string } | null;
  where: "top" | "bottom";
  /** `index` for the index, a choice and a leaf; `list` for the products list. */
  shape: "index" | "list";
  /** The slider's accessible names — needed only when there are several slides. */
  labels: BannerSliderLabels;
  /** Space around the plate — applied only when a plate is drawn, so nothing drawn takes no room. */
  className?: string;
}) {
  const aspect =
    where === "top"
      ? shape === "list"
        ? "aspect-[1200/280]"
        : "aspect-[1200/248]"
      : shape === "list"
        ? "aspect-[312/185]"
        : "aspect-[312/124]";
  const place = `${where === "top" ? "hidden lg:block" : "mt-6 lg:hidden"} ${className}`;

  if (slides.length > 1) {
    const frame: BannerFrame = {
      wrapper: `w-full ${place}`,
      rounded: "rounded-[10px]",
      aspect,
      sizes: where === "top" ? "1200px" : "100vw",
    };
    return <BannerSlider slides={[...slides]} labels={labels} frame={frame} className="" />;
  }

  const [only] = slides;
  const sizes = where === "top" ? "1200px" : "100vw";
  const size = `${place} rounded-[10px] ${aspect}`;

  if (!only) {
    // The category's own hero is not themed: one picture.
    if (!hero) return null;
    return (
      <div className={`relative w-full overflow-hidden ${size}`}>
        <Image src={hero.url} alt={hero.alt} fill sizes={sizes} className="object-cover" />
      </div>
    );
  }

  return (
    <Link
      href={only.href}
      {...(only.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      aria-label={only.headline || undefined}
      className={`relative block w-full overflow-hidden transition hover:brightness-95 ${size}`}
    >
      <ThemeImage images={only.images} sizes={sizes} />
    </Link>
  );
}
