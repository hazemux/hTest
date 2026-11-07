"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { takeAddedItem } from "@/lib/analytics/added-item";
import { trackProductAdded } from "@/lib/analytics/events";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { consumeFlash, dismissAlert, getActiveAlert, notify, subscribe } from "@/lib/notifications/client";
import { ALERTS, type AlertKey } from "@/lib/notifications/registry";

import { ALERT_ACTION_CLASS, AlertBar } from "./AlertBar";

/** How long a bar stays: a confirmation briefly, a warning long enough to read and act on. */
export const SUCCESS_MS = 4000;
export const ERROR_MS = 7000;
/**
 * A redirect often lands on another path a moment after the alert opens — that
 * navigation IS the alert's arrival, not the customer leaving. Within this
 * window a path change leaves the bar alone.
 */
export const NAVIGATION_GRACE_MS = 1500;

/** After a form is submitted, look for the flash cookie this often, this many times (~6 s). */
const FLASH_POLL_MS = 120;
const FLASH_POLL_TRIES = 50;

/** Side effects that belong to an alert having been SHOWN, by key. */
const ON_SHOWN: Partial<Record<AlertKey, () => void>> = {
  // Zaraz spec §3.1: the add happened on the request that redirected here. The
  // button left the item in sessionStorage; taking it spends it, so a second
  // run (React strict mode, a re-render) cannot fire the event twice.
  "cart.added": () => {
    const added = takeAddedItem();
    if (added) trackProductAdded(added);
  },
};

/**
 * Shows the alerts raised after a Server Action redirect (`flash(key)`) or in
 * the browser (`notify(key)`) — one bar at a time, fixed under the header row,
 * where an add button far down a long page can still be answered.
 *
 * MOUNTED OUTSIDE `SiteChrome`, which hides its children on phone checkout —
 * where «عليك اختيار طريقة الدفع» has to show.
 *
 * WHEN IT LOOKS FOR A FLASH: on load, on every path change, and for a few
 * seconds after any form is submitted. The last one is the same-page case: an
 * action that redirects back to the URL the customer is already on changes
 * neither the pathname nor the search params, so nothing else would notice.
 */
export function ToastHost({ locale }: { locale: Locale }) {
  return (
    <Suspense fallback={null}>
      <Host locale={locale} />
    </Suspense>
  );
}

function Host({ locale }: { locale: Locale }) {
  const m = messagesFor(locale);
  const pathname = usePathname();
  const params = useSearchParams();
  const active = useSyncExternalStore(subscribe, getActiveAlert, () => null);
  const [held, setHeld] = useState(false);
  const lastPath = useRef(pathname);

  // Arriving: a flash left by the request that brought the customer here. A
  // path change with no flash closes a bar the customer has had a moment with.
  useEffect(() => {
    const arrived = lastPath.current !== pathname;
    lastPath.current = pathname;

    const flashed = consumeFlash();
    if (flashed) {
      notify(flashed);
      return;
    }
    const current = getActiveAlert();
    if (arrived && current && Date.now() - current.shownAt > NAVIGATION_GRACE_MS) dismissAlert();
  }, [pathname]);

  // The same-page redirect: look for the cookie after any form is submitted.
  useEffect(() => {
    let timer: number | undefined;

    function watch(): void {
      window.clearInterval(timer);
      let tries = 0;
      timer = window.setInterval(() => {
        const key = consumeFlash();
        if (key) notify(key);
        if (key || ++tries >= FLASH_POLL_TRIES) window.clearInterval(timer);
      }, FLASH_POLL_MS);
    }

    document.addEventListener("submit", watch);
    return () => {
      document.removeEventListener("submit", watch);
      window.clearInterval(timer);
    };
  }, []);

  // «نبهني عند التوفير» from the resume PAGE, which cannot set a cookie while
  // it renders: it returns with `?stock_alert=1`, read once and spent.
  const resumed = params?.get("stock_alert") === "1";
  useEffect(() => {
    if (!resumed) return;
    notify("product.notifySet");
    const url = new URL(window.location.href);
    url.searchParams.delete("stock_alert");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [resumed]);

  const id = active?.id;
  const key = active?.key;
  const tone = key ? ALERTS[key].tone : null;

  useEffect(() => {
    if (key) ON_SHOWN[key]?.();
  }, [id, key]);

  // The bar's own timer, restarted by every new alert and while it is held.
  useEffect(() => {
    if (id === undefined || tone === null || held) return;
    const timer = window.setTimeout(dismissAlert, tone === "success" ? SUCCESS_MS : ERROR_MS);
    return () => window.clearTimeout(timer);
  }, [id, tone, held]);

  if (!active) return null;
  const alert = ALERTS[active.key];

  return (
    <div
      className="fixed inset-x-6 top-[88px] z-[55] lg:top-6"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <AlertBar key={active.id} tone={alert.tone} icon={alert.icon} role={alert.role} text={alert.text(m)} className="shadow-sm">
        <button type="button" onClick={dismissAlert} className={ALERT_ACTION_CLASS}>
          {m.catalog.close}
        </button>
      </AlertBar>
    </div>
  );
}
