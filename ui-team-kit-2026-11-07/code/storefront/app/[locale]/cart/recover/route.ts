import { NextResponse, type NextRequest } from "next/server";

import { isRecoveryToken, RECOVER_COOKIE, RECOVER_MAX_AGE_SECONDS } from "@/lib/cart/recover-link";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/locales";

/**
 * A recovery link — `/{locale}/cart/recover?t=…` (ADR 0039 §5).
 *
 * THIS GET DOES NOTHING BUT MOVE THE TOKEN. Mail scanners and link previews
 * open every link in a message; if opening one restored, counted or sent
 * anything, a scanner would. So it only puts `t` in a short HttpOnly cookie
 * and sends the browser to a page whose URL carries nothing — the token is
 * then never in a URL Zaraz, the history or a Referer can see. The confirm
 * page reads it; restoring is a POST from there.
 *
 * A RELATIVE Location, as `/payment/complete` does: behind the proxy,
 * `request.url` is the internal listener's address, and a redirect there
 * loses the cookie just set. `no-referrer` here (and in `next.config.ts`,
 * whose header wins): this URL holds the token.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await context.params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const token = request.nextUrl.searchParams.get("t");

  const response = new NextResponse(null, {
    status: 303,
    headers: {
      Location: `/${locale}/cart/recover/confirm`,
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });

  if (isRecoveryToken(token)) {
    response.cookies.set(RECOVER_COOKIE, token, {
      path: "/",
      maxAge: RECOVER_MAX_AGE_SECONDS,
      httpOnly: true,
      secure: true,
      // Lax: the link is opened from a mail app or WhatsApp — a cross-site
      // navigation a Strict cookie would not survive.
      sameSite: "lax",
    });
  } else {
    // No usable token: an OLDER link's must not answer for this one.
    response.cookies.delete(RECOVER_COOKIE);
  }

  return response;
}
