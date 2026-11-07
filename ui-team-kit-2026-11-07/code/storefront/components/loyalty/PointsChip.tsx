"use client";

import { lazy, Suspense, useEffect, useEffectEvent, useId, useRef, useState } from "react";

import { useIdlePreload } from "@/components/ui/motion/useIdlePreload";
import { messagesFor } from "@/lib/i18n/messages";
import { fill, formatPts, formatWorth } from "@/lib/loyalty/format";
import type { LoyaltyProgram } from "@/lib/loyalty/types";

import { DROPDOWN_CLASSES, DROPDOWN_PANEL_CLASSES, DropdownPointer } from "./dropdown";
import type { RewardsPanelProps } from "./panel/types";
import { Coin, Glyph } from "./parts";

/**
 * The panel and Motion live in their own chunk (`RewardsPanelLayer`). A chunk
 * that fails to load (a flaky connection, a tab left open across a deploy)
 * must not take the header down: the chip then opens the plain fallback box.
 */
const RewardsPanelLayer = lazy(() => import("./RewardsPanelLayer").catch(() => ({ default: PanelUnavailable })));

export type PointsChipProps = Omit<RewardsPanelProps, "onClose" | "layout" | "program"> & {
  /**
   * The programme, once the host has loaded it (it is fetched when the panel
   * is first wanted, never by the layout). Null until then: the chip still
   * draws — it needs only the wallet — and an opened panel waits in its
   * reserved box. `programFailed` turns that wait into «تعذّر التحميل».
   */
  program: LoyaltyProgram | null;
  programFailed?: boolean;
  /**
   * `desktop` — the header's pill with the money line, opening a dropdown
   * anchored to it; `compact` — the phone header's small pill, opening a
   * bottom sheet.
   */
  variant: "desktop" | "compact";
  /** Told when the panel opens, so the host can load the panel's lists. */
  onOpen?: () => void;
};

/**
 * THE HEADER'S POINTS CHIP (Claude Design `SiteHeader`, desktop and mobile).
 *
 * A MEMBER sees their available points (and, on desktop, what they are worth
 * in the visitor's currency); a GUEST sees what the programme is — never «0»,
 * which would read as a balance they have lost. The amber dot means points
 * expire soon, and appears only while expiry is actually enforced
 * (`features.expiry`): the UI never promises what the code does not do.
 *
 * KEYBOARD: Escape closes and returns focus to the chip; on desktop Tab stays
 * inside the open panel (a loop that includes the chip), and a click away
 * closes it without stealing focus — the same rules as `AccountMenu`. On the
 * phone the native `<dialog>` gives the focus trap, Escape and the inert page.
 */
export function PointsChip(props: PointsChipProps) {
  const { locale, viewer, program, variant, onOpen } = props;
  const m = messagesFor(locale);
  const t = m.loyalty;
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  const [everOpened, setEverOpened] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const panelId = useId();
  const { mounted, arm } = useIdlePreload(open);
  const sheet = variant === "compact";

  const wallet = viewer.kind === "member" ? viewer.wallet : null;
  // `expiring_soon` is null unless expiry is ENFORCED (the API decides), so
  // the dot can never promise a lapse the code does not carry out.
  const expiring = Boolean(wallet?.points.expiringSoon);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (sheet) {
      const element = dialog.current;
      if (element?.open) {
        if (typeof element.close === "function") element.close();
        else element.removeAttribute("open");
      }
    }
    if (returnFocus) trigger.current?.focus();
  }

  function toggle() {
    if (open) {
      close(false);
      return;
    }
    setSession((value) => value + 1);
    setEverOpened(true);
    setOpen(true);
    onOpen?.();
    if (sheet) {
      const element = dialog.current;
      if (element && !element.open) {
        if (typeof element.showModal === "function") element.showModal();
        else element.setAttribute("open", "");
      }
    }
  }

  // The DESKTOP dropdown's listeners — see `AccountMenu` for why they sit on
  // the document (Safari does not focus a clicked button).
  const closeFromKeyboard = useEffectEvent(() => close(true));
  useEffect(() => {
    if (!open || sheet) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeFromKeyboard();
        return;
      }
      if (event.key !== "Tab") return;
      const root = wrapper.current;
      if (!root) return;
      const focusable = Array.from(root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')).filter(
        (element) => !element.closest("[inert]"),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (!root.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, sheet]);

  const panel = { ...props, onClose: () => close(true) };
  const waiting = props.programFailed ? t.panel.unavailable : t.panel.loading;
  const label = wallet
    ? `${t.pointsTitle}: ${fill(t.ptsAmount, { pts: formatPts(locale, wallet.points.available) })}${expiring ? ` · ${t.chip.expiring}` : ""}`
    : t.chip.open;

  const chip = sheet ? (
    <>
      <Coin size={16} />
      {/* `cq-chip-label`: hidden on the phone's purchase pages, where the
          header also holds the basket (globals.css) — the coin alone, its
          figure in the button's accessible name, so the row never overflows. */}
      <span dir={wallet ? "ltr" : undefined} className="cq-chip-label text-body-s font-bold">
        {wallet ? formatPts(locale, wallet.points.available) : t.chip.guestShort}
      </span>
      {expiring ? <span aria-hidden data-expiring="" className="size-1.5 rounded-full bg-[var(--color-warning)]" /> : null}
    </>
  ) : (
    <>
      <Coin size={20} />
      <span className="flex flex-col text-start leading-[1.15]">
        <span dir={wallet ? "ltr" : undefined} className="text-start text-heading-l font-semibold">
          {wallet ? formatPts(locale, wallet.points.available) : t.chip.guestMain}
        </span>
        <span className="text-caption-xs font-bold text-[var(--color-ink-muted)]">
          {wallet ? formatWorth(locale, wallet.points.availableValue) : t.chip.guestSub}
        </span>
      </span>
      {expiring ? <span aria-hidden data-expiring="" title={t.chip.expiring} className="size-2 rounded-full bg-[var(--color-warning)]" /> : null}
      <Glyph src="/brand/icon-chevron-down.svg" className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
    </>
  );

  const layer = (layerOpen: boolean) =>
    program && (mounted || everOpened) ? (
      <Suspense fallback={layerOpen ? <StaticPanel sheet={sheet} loading={waiting} /> : null}>
        <RewardsPanelLayer mode={sheet ? "sheet" : "dropdown"} open={layerOpen} session={session} panel={{ ...panel, program }} />
      </Suspense>
    ) : layerOpen ? (
      <StaticPanel sheet={sheet} loading={waiting} />
    ) : null;

  return (
    <div ref={wrapper} className="relative shrink-0">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        aria-label={label}
        onClick={toggle}
        onPointerEnter={arm}
        onTouchStart={arm}
        onFocus={arm}
        className={`flex items-center rounded-[8px] bg-[var(--color-brand-wash)] text-[var(--color-brand-500)] transition-shadow ${
          sheet ? "h-9 gap-1 px-2" : "gap-1.5 px-2.5 py-2"
        } ${open ? "shadow-[0_0_0_2px_var(--color-brand-500)]" : ""}`}
      >
        {chip}
      </button>

      {sheet ? (
        <dialog
          ref={dialog}
          id={panelId}
          aria-label={t.pointsTitle}
          onClose={() => {
            setOpen(false);
            trigger.current?.focus();
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) close(true);
          }}
          className="cq-sheet fixed inset-x-0 bottom-0 z-[70] m-0 mt-auto h-[88dvh] max-h-[88dvh] w-full max-w-none overflow-hidden rounded-t-[16px] bg-transparent p-0 text-[var(--color-ink)] backdrop:bg-[var(--color-backdrop)]"
        >
          {layer(open)}
        </dialog>
      ) : (
        <div id={panelId}>{layer(open)}</div>
      )}
    </div>
  );
}

/**
 * The panel before its chunk has arrived: a reserved box the size of the real
 * one (`data-cq-fallback`, HANDBOOK §8), so the chip answers at once. No
 * animation; the real panel replaces it in place.
 */
function StaticPanel({ sheet, loading }: { sheet: boolean; loading: string }) {
  const box = (
    <div data-cq-fallback="" className={`grid h-full w-full place-items-center bg-[var(--color-surface)] ${sheet ? "rounded-t-[16px]" : "rounded-[16px] shadow-[0_8px_24px_rgba(0,0,0,0.12)]"}`}>
      <span role="status" className="text-body-s font-semibold text-[var(--color-ink-subtle)]">
        {loading}
      </span>
    </div>
  );
  if (sheet) return box;
  return (
    <div className={DROPDOWN_CLASSES}>
      <DropdownPointer />
      <div className={DROPDOWN_PANEL_CLASSES}>{box}</div>
    </div>
  );
}

/**
 * What the layer is when its chunk could not be loaded: nothing. A box that
 * said «loading» for ever would be a lie; the wallet page still has it all.
 */
function PanelUnavailable(): null {
  return null;
}
