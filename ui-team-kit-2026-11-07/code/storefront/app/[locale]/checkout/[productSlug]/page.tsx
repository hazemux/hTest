import { notFound, redirect } from "next/navigation";

import { isLocale } from "@/lib/i18n/locales";

/**
 * The old single-item checkout, now the product page.
 *
 * It asked for every one of the category's fields — the account password
 * included — on its own form. Since 2026-10-02 the product page is the ONE
 * place details are typed (owner), and «شراء سريع» there already goes through
 * the basket to its checkout (`buyNow`). Nothing in the store links here; an
 * old link or bookmark opens the product on the same package instead.
 */
export default async function CheckoutPage(props: {
  params: Promise<{ locale: string; productSlug: string }>;
  searchParams: Promise<{ pack?: string; region?: string }>;
}) {
  const { locale, productSlug } = await props.params;
  if (!isLocale(locale)) notFound();

  // Passed through as the product page reads them (`lib/catalog/pack-link.ts`):
  // `?pack=` and `?region=`, each only in a shape it could be. Anything else —
  // an old `?denomination=<id>` included — is dropped: the product opens on
  // its default pack.
  const { pack, region } = await props.searchParams;
  const query = new URLSearchParams();
  if (pack && /^[A-Za-z0-9._-]{1,64}$/.test(pack)) query.set("pack", pack);
  if (region && /^[a-z0-9-]{1,16}$/.test(region)) query.set("region", region);
  const tier = query.size > 0 ? `?${query.toString()}` : "";
  redirect(`/${locale}/products/${encodeURIComponent(productSlug)}${tier}`);
}
