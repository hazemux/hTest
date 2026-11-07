import { NextResponse, type NextRequest } from "next/server";

import { recordPartnerCouponVisit } from "@/lib/api/client";
import { isPublicId } from "@/lib/api/public-id";
import { isSafeExternalUrl } from "@/lib/content/safe-external-url";
import { countryForVisitor } from "@/lib/currency/visitor";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/locales";

/**
 * "Visit store" for a partner code: count the visit, then send the customer
 * to the store — the link for their country when the partner has one.
 *
 * NOT AN OPEN REDIRECT. The only input is the coupon's PUBLIC id (a UUID,
 * ADR 0037 — anything else goes back to the list unasked); the destination
 * comes back from our API, which looked it up in our own table, and is
 * checked again here before it becomes a Location. No URL is read from the
 * query string, so this route cannot be pointed anywhere else.
 *
 * `noindex` and `no-store`: a counting redirect is not a page, and robots.ts
 * keeps crawlers out of it too — a bot following every card would inflate the
 * counts staff read.
 *
 * Any failure (unknown code, hidden since the page rendered, API down) goes
 * back to the list, RELATIVELY — an absolute URL built from `request.url` is
 * the internal listener's address behind the proxy.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: raw, id } = await context.params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const back = `/${locale}/partner-coupons`;
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

  if (!isPublicId(id)) {
    return new NextResponse(null, { status: 303, headers: { ...headers, Location: back } });
  }

  const country = await countryForVisitor().catch(() => "");

  try {
    const { url } = await recordPartnerCouponVisit(id, /^[A-Z]{2}$/.test(country) ? country : undefined);

    if (isSafeExternalUrl(url)) {
      return new NextResponse(null, { status: 302, headers: { ...headers, Location: url } });
    }
  } catch {
    // Fall through to the list.
  }

  return new NextResponse(null, { status: 303, headers: { ...headers, Location: back } });
}
