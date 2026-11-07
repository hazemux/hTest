import { Suspense } from "react";

import { TabBar } from "@/components/mobile/TabBar";
import { cartBadgeCount } from "@/components/cart/CartBadge";
import { isSignedIn } from "@/lib/account/session";
import type { Locale } from "@/lib/i18n/locales";

/**
 * The phone's tab bar, personal in exactly two facts — the basket count and
 * whether «حسابي» signs in — so the shared shell carries the bar without
 * them (the same box: no count, and the account link true for a guest and a
 * member alike) and the visitor's replaces it when the stream arrives
 * (ADR 0046 §2).
 *
 * BOTH FACTS ARE COOKIES, so this costs no request: the cart cookie, and
 * whether a session cookie is there (`isSignedIn`). A session the API would
 * refuse still links «حسابي» to the account, carrying the page — which sends
 * it through session-expired to sign in and back — while the header, which
 * asks `GET /me`, shows the guest's control; the bar never sends a member to
 * sign in.
 *
 * The bar's plate (an inline <svg>, 734 bytes) is drawn by the fallback and the
 * streamed bar alike, so it is in the HTML twice — as it already was with the
 * interim boundary before this one.
 */
export function TabBarForVisitor({ locale }: { locale: Locale }) {
  return (
    <Suspense fallback={<TabBar locale={locale} />}>
      <TabBarWithVisitor locale={locale} />
    </Suspense>
  );
}

async function TabBarWithVisitor({ locale }: { locale: Locale }) {
  const [count, signedIn] = await Promise.all([cartBadgeCount(), isSignedIn()]);
  return <TabBar locale={locale} cartCount={count} signedIn={signedIn} />;
}
