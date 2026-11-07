"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { CRISP_LOADER, chatAllowedOn, crispLanguage, crispMaySee, crispSetup, crispWebsiteId, liftOver } from "@/lib/support/crisp";

/** Crisp's command queue: a plain array until its script swaps in the real object. */
type CrispQueue = {
  push: (command: unknown[]) => unknown;
  get?: (key: string) => unknown;
  is?: (key: string) => unknown;
};

declare global {
  interface Window {
    $crisp?: CrispQueue;
    CRISP_WEBSITE_ID?: string;
    CRISP_RUNTIME_CONFIG?: { locale: string };
  }
}

/** The bars drawn across the bottom of the screen that the button must clear (`liftOver`). */
const BOTTOM_BARS = ".cq-tab-bar, [data-buy-bar], .cq-pay-bar, .cq-above-tabbar";
const GAP = 12;

function crisp(command: unknown[]) {
  window.$crisp?.push(command);
}

/** Registers the ONE handler for a Crisp event — a mount again must not stack a second one. */
function crispOn(event: string, handler: () => void) {
  crisp(["off", event]);
  crisp(["on", event, handler]);
}

function pageTheme(): "light" | "dark" {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function crispUnread(): number {
  const count = Number(window.$crisp?.get?.("chat:unread:count"));
  return Number.isFinite(count) && count > 0 ? count : 0;
}

/**
 * Keeps an order or account address from Crisp (`crispMaySee`). Crisp wraps
 * `history.pushState`/`replaceState` and, on the `crisp-pushstate` /
 * `crisp-replacestate` events it fires on `window` (client build 3215e23),
 * sends the new address to its servers. Registered on `window` BEFORE Crisp's
 * script loads, so it runs first and stops Crisp's own listener on a private
 * path; Crisp then still holds the last public page. If Crisp ever renames
 * those events this stops nothing — Crisp would report the path, never a token
 * (Crisp does not start on a token page).
 *
 * KNOWN GAP, accepted: Crisp's first report is sent when its client connects,
 * about a second after the idle start. A customer who opens an order page in
 * that second has that page's path sent once. A path, never a token — the
 * order page answers 404 without the customer's own cookie (HANDBOOK §2).
 */
function keepAddressFromCrisp(event: Event) {
  if (!crispMaySee(window.location.pathname)) event.stopImmediatePropagation();
}

/** Runs `start` once the page has loaded and the browser is idle; returns the cancel. */
function whenIdle(start: () => void): () => void {
  let cancel = () => {};
  const schedule = () => {
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(start, { timeout: 4000 });
      cancel = () => window.cancelIdleCallback(id);
    } else {
      const id = window.setTimeout(start, 1500);
      cancel = () => window.clearTimeout(id);
    }
  };
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
  return () => {
    window.removeEventListener("load", schedule);
    cancel();
  };
}

/**
 * «تحدث معنا» — Crisp live chat behind the store's own button (ADR 0019 Q47).
 * No comp draws it: built to the design system — the brand blue, the Hicon
 * Bold «Message 1» glyph (Figma 6669:12152), the reading side's end corner.
 *
 * OFF unless `NEXT_PUBLIC_CRISP_WEBSITE_ID` holds a website id
 * (`lib/support/crisp.ts`): then nothing renders and nothing loads.
 *
 * WHY OUR BUTTON AND NOT CRISP'S BUBBLE: Crisp's bubble takes its colour from
 * the workspace and has no offset, so it sat on the tab bar, the buy bar and
 * the pay bar at 360px. Crisp is told to stay hidden; this button shows its
 * window while it is open and hides it again when it closes. The window is
 * the store's blue (globals.css).
 *
 * - The window opens only on a tap here — never by itself on page load.
 * - Crisp's script loads once the page is idle, never on a no-chat page
 *   (`chatAllowedOn`), and its window hides if the customer reaches one.
 * - Crisp never starts on an order or account page, and is kept from
 *   learning one's address when the customer goes there in the app
 *   (`crispMaySee`, `keepAddressFromCrisp`); the chat stays usable there.
 * - The button appears only once Crisp's session has loaded — blocked by an
 *   extension or the network, the store shows no button that does nothing.
 * - An operator's reply while the window is closed shows as a count on it.
 * - It rises over whatever bar is drawn at the bottom (`liftOver`), and steps
 *   aside for the menu drawer and the 3-D Secure sheet (globals.css).
 * - It passes Crisp no name, email or phone.
 */
export function SupportChat({ locale }: { locale: Locale }) {
  const websiteId = crispWebsiteId();
  const path = usePathname() ?? `/${locale}`;
  const allowed = chatAllowedOn(path);
  const mayStart = crispMaySee(path);
  // Mounted again after Crisp started (its script swapped in the real
  // object), the session is there already — it will not announce it twice.
  const [ready, setReady] = useState(() => typeof window !== "undefined" && typeof window.$crisp?.is === "function");
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(() => (typeof window !== "undefined" ? crispUnread() : 0));
  // Set by a tap on the button: the ONLY way the window shows (below).
  const asked = useRef(false);
  const spot = useRef<HTMLDivElement>(null);
  const lift = useLift(spot, ready && allowed && !open);
  const m = messagesFor(locale);

  useEffect(() => {
    if (!websiteId || !allowed) return;

    const listen = () => {
      crispOn("session:loaded", () => {
        setReady(true);
        setUnread(crispUnread());
        // Opened by Crisp before anyone tapped (restored from an earlier page).
        if (window.$crisp?.is?.("chat:opened") && !asked.current) crisp(["do", "chat:close"]);
      });
      // THE WINDOW OPENS ONLY ON A TAP. Crisp opens it by itself too — the
      // workspace's welcome message did, full screen over the whole store on
      // a phone, the moment the page loaded. Such an opening is closed again
      // at once (still hidden, nothing drew); the customer sees the welcome
      // when they tap. Only a real reply (`message:received`) counts.
      crispOn("chat:opened", () => {
        if (!asked.current) {
          crisp(["do", "chat:close"]);
          return;
        }
        crisp(["do", "chat:show"]);
        setOpen(true);
        setUnread(0);
      });
      crispOn("chat:closed", () => {
        asked.current = false;
        crisp(["do", "chat:hide"]);
        setOpen(false);
      });
      crispOn("message:received", () => {
        if (window.$crisp?.is?.("chat:opened")) return;
        setUnread((count) => Math.max(count + 1, crispUnread()));
      });
    };

    // Already started (this component mounted again): take the events over,
    // in this page's language.
    if (window.$crisp) {
      for (const command of crispLanguage(locale)) crisp(command);
      listen();
      return;
    }

    // Never STARTED on an order or account page: Crisp would send its address.
    if (!mayStart) return;

    return whenIdle(() => {
      window.addEventListener("crisp-pushstate", keepAddressFromCrisp, true);
      window.addEventListener("crisp-replacestate", keepAddressFromCrisp, true);
      window.$crisp = [] as unknown[];
      window.CRISP_WEBSITE_ID = websiteId;
      window.CRISP_RUNTIME_CONFIG = { locale };
      for (const command of crispSetup(locale, pageTheme())) crisp(command);
      listen();
      const script = document.createElement("script");
      script.src = CRISP_LOADER;
      script.async = true;
      document.head.appendChild(script);
    });
  }, [websiteId, allowed, mayStart, locale]);

  // A no-chat page reached in the app (the payment pages): the window goes.
  useEffect(() => {
    if (allowed || !window.$crisp) return;
    crisp(["do", "chat:close"]);
    crisp(["do", "chat:hide"]);
  }, [allowed]);

  // The window follows the store's theme toggle.
  useEffect(() => {
    if (!ready) return;
    const observer = new MutationObserver(() => crisp(["config", "color:mode", [pageTheme()]]));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [ready]);

  if (!websiteId || !ready || !allowed || open) return null;

  const label = unread > 0 ? m.supportChat.openUnread.replace("{count}", String(unread)) : m.supportChat.open;

  return (
    <div ref={spot} className="cq-chat-spot pointer-events-none fixed bottom-[calc(16px+env(safe-area-inset-bottom))] end-4 z-40 size-12 lg:bottom-6 lg:end-6 lg:size-14">
      <button
        type="button"
        aria-label={label}
        title={m.supportChat.open}
        onClick={() => {
          asked.current = true;
          crisp(["do", "chat:show"]);
          crisp(["do", "chat:open"]);
        }}
        style={lift ? { translate: `0 -${lift}px` } : undefined}
        className="cq-chat-button pointer-events-auto relative grid size-full place-items-center rounded-full bg-[var(--color-primary)] text-[var(--color-on-primary)] shadow-[0_4px_16px_rgba(0,0,0,0.18)] transition-[translate,background-color] duration-300 ease-out hover:bg-[var(--color-primary-hover)] motion-reduce:transition-none"
      >
        <span aria-hidden className="block size-6 bg-current [mask-image:url(/brand/icon-chat.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
        {unread > 0 ? (
          <span
            dir="ltr"
            aria-hidden
            className="absolute -end-1 -top-1 h-[18px] min-w-[18px] rounded-full bg-[var(--color-danger)] px-[5px] text-center text-caption-xs font-bold leading-[18px] text-[var(--color-on-primary)] shadow-[0_0_0_2px_var(--background)]"
          >
            {unread}
          </span>
        ) : null}
      </button>
    </div>
  );
}

/**
 * Keeps the button clear of the bars at the bottom of the screen: measures
 * its corner (`spot`, where CSS puts it) against every bar drawn there and
 * lifts the button by what overlaps (`liftOver`). Re-measured when a bar
 * appears, changes size or moves — a page change, a line added to the pay
 * bar, the tab bar sliding away, the basket's pay area pinning on scroll.
 * Batched on a short timer rather than an animation frame: a page that is
 * not on screen (a background tab) runs no frames, and the first one queued
 * there would hold every later measure back.
 */
function useLift(spot: React.RefObject<HTMLDivElement | null>, active: boolean): number {
  const [by, setBy] = useState(0);

  useEffect(() => {
    if (!active) return;
    let timer = 0;
    const watched = new Set<Element>();
    const resized = typeof ResizeObserver === "function" ? new ResizeObserver(() => schedule()) : null;

    function measure() {
      timer = 0;
      const corner = spot.current;
      if (!corner) return;
      const bars = Array.from(document.querySelectorAll(BOTTOM_BARS));
      for (const bar of bars) {
        if (watched.has(bar)) continue;
        watched.add(bar);
        resized?.observe(bar);
      }
      setBy(liftOver(corner.getBoundingClientRect(), bars.map((bar) => bar.getBoundingClientRect()), GAP));
    }
    function schedule() {
      if (!timer) timer = window.setTimeout(measure, 16);
    }

    const changed = new MutationObserver(schedule);
    changed.observe(document.body, { childList: true, subtree: true });
    changed.observe(document.documentElement, { attributes: true, attributeFilter: ["data-tabbar", "style"] });
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    document.addEventListener("transitionend", schedule);
    schedule();

    return () => {
      if (timer) window.clearTimeout(timer);
      changed.disconnect();
      resized?.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("transitionend", schedule);
    };
  }, [spot, active]);

  return active ? by : 0;
}
