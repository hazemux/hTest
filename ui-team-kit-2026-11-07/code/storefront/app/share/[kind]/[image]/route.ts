import { getProductShell, listCategories } from "@/lib/catalog/queries";
import { productArtwork } from "@/lib/catalog/product-artwork";
import { categoryArt } from "@/lib/catalog/tree";
import { defaultShareCard, shareCard } from "@/lib/seo/share-card";
import { isShareKind, slugFromShareFile, type ShareKind } from "@/lib/seo/share-image";

/**
 * `/share/products/{slug}.png` and `/share/categories/{slug}.png` — the share
 * card of a product or a category: its catalogue art on the branded frame,
 * 1200 × 630 PNG (`lib/seo/share-image.ts`, `lib/seo/share-card.tsx`).
 *
 * WHERE IT LIVES: outside `/api/` (robots.txt disallows that on production,
 * and X will not fetch a picture robots.txt forbids) and with a dot in the
 * path, so `proxy.ts` never redirects it to a language.
 *
 * NEVER AN ERROR PAGE: a preview fetcher shown a 500 shows no picture at all.
 * A product or category with no art, or one that cannot be read right now,
 * answers the default card; only an address that names no card at all is a
 * 404. The art is read with the same shared, money-free reads the page makes
 * (`getProductShell`, `listCategories`), so nothing here reads the visitor.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string; image: string }> },
): Promise<Response> {
  const { kind, image } = await params;
  const slug = slugFromShareFile(image);
  if (!isShareKind(kind) || !slug) return new Response("Not found", { status: 404 });

  let artUrl: string | null;
  try {
    artUrl = await artFor(kind, slug);
  } catch {
    // The catalogue unreachable: the default card, kept by nobody.
    return png(await defaultShareCard(), "no-store", false);
  }
  if (!artUrl) return png(await defaultShareCard(), "public, max-age=3600", false);

  const card = await shareCard(artUrl);
  return png(card.png, card.framed ? "public, max-age=86400, stale-while-revalidate=604800" : "no-store", card.framed);
}

export { GET as HEAD };

async function artFor(kind: ShareKind, slug: string): Promise<string | null> {
  if (kind === "products") {
    const [product, categories] = await Promise.all([getProductShell(slug, { locale: "ar" }), listCategories({ locale: "ar" })]);
    return productArtwork(product, categories, "ar", slug)?.url ?? null;
  }
  const categories = await listCategories({ locale: "ar" });
  const category = categories.find((entry) => entry.slug === slug);
  return category ? (categoryArt(categories, category)?.url ?? null) : null;
}

/**
 * `X-CQ-Share-Card` says which card answered. A page only names this route
 * when its product or category HAS art, so `default` here means the art could
 * not be used — a media host outside `API_BASE_URL`/`MEDIA_BASE_URL`, a file
 * that is not PNG, JPEG or WebP, an unreachable one — which the picture
 * alone would hide (it is a valid PNG either way). `scripts/check-seo.mjs`
 * fails a release on it.
 */
function png(bytes: Uint8Array, cacheControl: string, framed: boolean): Response {
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": cacheControl,
      "X-CQ-Share-Card": framed ? "framed" : "default",
    },
  });
}
