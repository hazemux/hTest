import { connection, NextResponse } from "next/server";

import { isLocale } from "@/lib/i18n/locales";
import { REFERRAL_COOKIE, REFERRAL_COOKIE_OPTIONS, normaliseReferralCode } from "@/lib/loyalty/referral-cookie";

/**
 * A friend's invite link — `/{locale}/r/{code}` (ADR 0043 §7, §9).
 *
 * Stores the code in the HttpOnly `cq_ref` cookie (30 days, `SameSite=Lax`)
 * and sends the visitor to the public programme page, where signing up
 * carries it. A route handler, because a page cannot set a cookie. NOINDEX:
 * one URL per customer is not a page (the header is also set in
 * `next.config.ts`); the redirect is RELATIVE (behind Caddy `request.url` is
 * the internal host).
 *
 * A code that is not code-shaped is not stored — and the visitor lands in the
 * same place either way, so this answers nothing about which codes exist.
 */
export async function GET(_request: Request, context: { params: Promise<{ locale: string; code: string }> }): Promise<NextResponse> {
  // Per request: it sets the referral cookie from the link's code.
  await connection();
  const { locale: raw, code } = await context.params;
  const locale = isLocale(raw) ? raw : "ar";
  const response = new NextResponse(null, {
    status: 307,
    headers: { Location: `/${locale}/rewards`, "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
  const normalised = normaliseReferralCode(code);
  if (normalised) response.cookies.set(REFERRAL_COOKIE, normalised, REFERRAL_COOKIE_OPTIONS);
  return response;
}
