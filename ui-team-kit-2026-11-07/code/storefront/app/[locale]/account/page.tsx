import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AccountShell, vipEnabled } from "@/components/account/AccountShell";
import { AccountHome } from "@/components/account/AccountHome";
import { ProfileCard } from "@/components/account/ProfileCard";
import { getWallet } from "@/lib/api/client";
import { currencyForVisitor } from "@/lib/currency/visitor";
import { mapWallet } from "@/lib/loyalty/map";
import { avatarsForPage, placeForProfile } from "@/lib/account/profile-choices";
import { accountReturnPath } from "@/lib/account/auth-href";
import { requireCustomer } from "@/lib/account/guard";
import { saveState } from "@/lib/account/save-state";
import { isLocale } from "@/lib/i18n/locales";

/**
 * «حسابي».
 *
 * ON THE PHONE this is «Profile Mobile»'s account home (`AccountHome`): who
 * the customer is, their points, then a row per section, each opening its
 * own page. ON DESKTOP the menu is a
 * side column (`4317:16178`) and this page opens on «المعلومات الشخصية», as
 * the comp draws it. One route, because the header's account entry and the
 * tab bar's «حسابي» both land here.
 *
 * Every section reads the API with the customer's own session and nothing
 * else; a section that cannot be read says so rather than drawing zero.
 */
export default async function AccountPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ saved?: string; error?: string; next?: string }>;
}) {
  // Per request, always: this page is somebody's account.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  // A guest is sent on to sign in, and back to the page in `next` after it:
  // the tab bar's «حسابي» before it knows who is looking (`accountHref`).
  const { token, customer } = await requireCustomer(locale, accountReturnPath(locale, (await props.searchParams).next));
  // Independent of one another: the balance, the avatar choices and the city
  // list. Each already degrades on its own failure.
  const currency = await currencyForVisitor();
  const [wallet, avatars, place, vip] = await Promise.all([
    getWallet({ locale, bearerToken: token }, { currency })
      .then((answer) => mapWallet(answer, locale, customer.name))
      .catch(() => null),
    avatarsForPage(locale),
    placeForProfile(customer, locale),
    vipEnabled(locale),
  ]);

  return (
    <AccountShell
      locale={locale}
      active="personalInfo"
      phoneHome={<AccountHome locale={locale} customer={customer} wallet={wallet} vip={vip} />}
    >
      <ProfileCard
        locale={locale}
        customer={customer}
        state={saveState(await props.searchParams)}
        avatars={avatars}
        place={place}
      />
    </AccountShell>
  );
}
