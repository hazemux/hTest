import { AddEmailPromptHost } from "@/components/account/AddEmailPromptHost";
import { WelcomeBackHost } from "@/components/account/WelcomeBackHost";
import { TierUpHost } from "@/components/loyalty/TierUpHost";
import { ReviewPromptHost } from "@/components/reviews/ReviewPromptHost";
import { headerViewer } from "@/lib/account/header-viewer";
import { celebrationsEnabled } from "@/lib/celebrate/once";
import type { Locale } from "@/lib/i18n/locales";

/**
 * «قيم طلبك», «وصلت إلى مستوى …», «أهلاً بعودتك» and «أضف بريدك الإلكتروني» — only for a signed-in visitor, decided
 * per request (ADR 0046 §2). The layout renders this inside its own Suspense
 * with no fallback: neither host draws anything until it has asked.
 *
 *  - The review prompt (ADR 0042) asks once per order, after hydration, and
 *    only for a signed-in customer — a guest makes no request.
 *  - The tier-up toast mounts only when the wallet says something is unread;
 *    its inbox is asked for after hydration, never by the server.
 */
export async function SignedInHosts({ locale }: { locale: Locale }) {
  const viewer = await headerViewer(locale);
  return (
    <>
      <ReviewPromptHost locale={locale} signedIn={viewer.signedIn} />
      <WelcomeBackHost locale={locale} signedIn={viewer.signedIn} />
      <AddEmailPromptHost locale={locale} needsEmail={viewer.needsEmail} rewardPts={viewer.emailRewardPts} />
      {viewer.unreadNotifications > 0 ? (
        <TierUpHost
          locale={locale}
          currency={viewer.currency}
          unread={viewer.unreadNotifications}
          benefitsHref={`/${locale}/account/points`}
          coin={celebrationsEnabled()}
        />
      ) : null}
    </>
  );
}
