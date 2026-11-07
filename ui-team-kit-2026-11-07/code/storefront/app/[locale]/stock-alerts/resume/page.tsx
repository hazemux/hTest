import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { readSessionToken } from "@/lib/account/session";
import { ApiError, addStockAlert } from "@/lib/api/client";
import { isPublicId } from "@/lib/api/public-id";
import { addedReturnPath } from "@/lib/cart/added-return-path";
import { addEmailForStockAlertPath } from "@/lib/stock-alerts/after-email";
import { isLocale } from "@/lib/i18n/locales";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ product?: string; pack?: string; back?: string }>;
};

/**
 * «نبهني عند التوفير» for a GUEST, finished after sign-in (the owner,
 * 2026-09-30). The button's action sends a guest — or a customer whose session
 * expired — to sign in with THIS address as `next`; arriving here signed in,
 * the alert is set and the customer lands back on the product with the comp's
 * «سنرسل لك ايميل» bar. One tap, not two.
 *
 * A PAGE THAT ONLY REDIRECTS, not a Route Handler: sign-in finishes with a
 * client-side navigation, and the router follows a page's `redirect()` —
 * address bar included — where a Route Handler's 303 left the URL on this
 * address and the confirmation bar never opened.
 *
 * A GET THAT WRITES, so it is fenced:
 *  - Idempotent: the API's PUT waits once however often this runs.
 *  - Only on a same-site arrival (`Sec-Fetch-Site: same-origin`, or `none`
 *    for a typed address). A link on another site cannot quietly sign a
 *    customer up to emails — it just lands on the product, unchanged.
 *  - `back` is vetted like «أضف للسلة»'s: a path of this site, this locale.
 */
export default async function ResumeStockAlertPage(props: Props): Promise<never> {
  // Per request: reads the visitor's session and the link's query.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const { product, pack, back: rawBack } = await props.searchParams;
  // `?pack=` — the one pack waited for (owner, 2026-10-07); anything that is
  // not a public id is no pack.
  const packId = isPublicId(pack) ? pack : null;
  // `?product=` is the product's PUBLIC id (ADR 0037).
  const productId = product;
  const flagged = addedReturnPath(locale, rawBack, "stock_alert");
  if (!flagged || !isPublicId(productId)) redirect(`/${locale}`);
  const back = flagged.replace(/([?&])stock_alert=1(&|$)/, (_m, lead: string, tail: string) => (tail ? lead : "")).replace(/\?$/, "");

  const site = (await headers()).get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") redirect(back);

  const self = `/${locale}/stock-alerts/resume?${new URLSearchParams({ product: productId, ...(packId ? { pack: packId } : {}), back })}`;
  const signIn = `/${locale}/account/sign-in?next=${encodeURIComponent(self)}`;

  const token = await readSessionToken();
  if (!token) redirect(signIn);

  let target = flagged;
  try {
    await addStockAlert(productId, { locale, bearerToken: token, packPublicId: packId });
  } catch (error) {
    const fields = error instanceof ApiError && error.status === 422 ? (error.body?.errors ?? {}) : {};
    // An expired session signs in again and comes back here. No email to
    // send it to: add one, and come back here once it is proved. In stock after all, or gone: the page shows the
    // truth — the buttons, or nothing to wait for.
    target = error instanceof ApiError && error.status === 401 ? signIn : "email" in fields ? addEmailForStockAlertPath(locale, self) : back;
  }

  redirect(target);
}
