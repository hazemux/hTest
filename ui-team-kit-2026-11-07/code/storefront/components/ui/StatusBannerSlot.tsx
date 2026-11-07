import { AlertBar, ALERT_ACTION_CLASS } from "@/components/ui/AlertBar";
import { StatusBannerClose } from "@/components/ui/StatusBannerClose";
import { storeSettings } from "@/lib/content/settings";
import { statusBannerFor, statusBannerHideRule, statusBannerScript } from "@/lib/content/status-banner";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { STATUS_BANNER } from "@/lib/notifications/registry";

/**
 * THE STATUS BANNER at the top of every page (owner, 2026-10-13): the incident
 * notice staff switch on from Settings › Status banner — «الدفع بالبطاقة متوقف
 * مؤقتاً». It closes nothing; the store works as it does without it.
 *
 * SHARED, IN THE SHELL (ADR 0046). Read from the store settings — the
 * footer's own shared entry (`storeSettings`, tag `settings`), so no extra API
 * call — and drawn outside any Suspense, in the page's flow: a page with no
 * banner draws nothing at all, and a page with one has it from the first byte,
 * so nothing moves either way. It reads no cookie, header or clock; the
 * visitor's «×» and the banner's end are applied in the browser
 * (`statusBannerScript` before paint, `StatusBannerClose` after hydration).
 *
 * MOUNTED OUTSIDE `SiteChrome` — which hides the header on phone checkout and
 * the sign-in pages — because a card-payment notice matters most at checkout.
 *
 * HOW FAST IT MOVES. A switch-on, switch-off or edit sends `settings.changed`
 * and the store's pages are rebuilt within seconds; without that event (the
 * webhook relay down) the settings read's own five-minute window
 * (`SETTINGS_NEXT`) is the backstop. An END TIME sends no event: the API
 * stops serving the banner at that moment, and a page drawn before it is
 * hidden on arrival by the browser, until the next rebuild drops it.
 *
 * A SLOW OR FAILED READ IS NO BANNER. The read races its deadline
 * (`lib/api/deadlines.ts`) and a failure is caught here — never a broken page.
 */
export async function StatusBannerSlot({ locale }: { locale: Locale }) {
  const banner = statusBannerFor(await storeSettings(locale).catch(() => null), locale);
  if (banner === null) return null;

  const m = messagesFor(locale);
  const kind = STATUS_BANNER[banner.severity];
  const script = statusBannerScript(banner);
  const rule = statusBannerHideRule(banner.fingerprint);

  return (
    <>
      {rule ? <style>{rule}</style> : null}
      {/* Before the banner, so a banner this visitor closed (or one already
          past its end) is hidden before it paints. */}
      {script ? <script dangerouslySetInnerHTML={{ __html: script }} /> : null}
      <section aria-label={m.nav.statusBanner} data-status-banner={banner.fingerprint} className="px-4 py-2 lg:px-6">
        <AlertBar tone={kind.tone} icon={kind.icon} role={kind.role} text={banner.text}>
          <span className="flex shrink-0 items-center gap-1">
            {banner.link ? (
              <a href={banner.link} className={ALERT_ACTION_CLASS}>
                {m.nav.statusBannerDetails}
              </a>
            ) : null}
            <StatusBannerClose fingerprint={banner.fingerprint} expiresAt={banner.expiresAt} label={m.nav.dismissStatusBanner} />
          </span>
        </AlertBar>
      </section>
    </>
  );
}
