"use client";

import { AnimatePresence } from "motion/react";
import * as mo from "motion/react-m";
import { MotionScope } from "@/components/ui/motion/MotionScope";
import { useState, type ReactNode, type Ref } from "react";

import { useMotionTransition } from "@/lib/motion/useMotionTransition";

import { useLeaving } from "./motion/Leaving";

/**
 * THE MOBILE DRAWER'S ANIMATED LAYER — the only part of the menu that needs
 * Motion, kept in its own module so that `MobileMenu.tsx` (which the layout
 * renders on EVERY page) does not carry Motion's render core in its static
 * imports. `MobileMenu` loads this with `React.lazy`, mounts it after
 * hydration when the browser is idle (or on the hamburger's first
 * hover/touch/focus), and keeps it mounted — `AnimatePresence` must outlive
 * the open drawer or the exit has nothing to play on.
 *
 * Until it arrives `MobileMenu` draws the same two layers with plain
 * elements and the same classes (`StaticDrawer`), so a tap never waits for
 * this chunk. Keep the two in step: the markup and classes here are the
 * contract the fallback copies.
 *
 * `AnimatePresence initial={false}`: the first render is the final state, so
 * the swap from the static copy to this one is not an animation.
 */
export default function MobileMenuDrawer({
  open,
  panelRef,
  panelId,
  label,
  onDismiss,
  children,
}: {
  open: boolean;
  panelRef: Ref<HTMLElement>;
  panelId: string;
  label: string;
  onDismiss: () => void;
  children: ReactNode;
}) {
  return (
    <MotionScope><AnimatePresence initial={false}>
      {open ? (
        <DrawerLayer key="drawer" panelRef={panelRef} panelId={panelId} label={label} onDismiss={onDismiss}>
          {children}
        </DrawerLayer>
      ) : null}
    </AnimatePresence></MotionScope>
  );
}

/**
 * THE DRAWER'S TWO LAYERS — the dimmed backdrop and the panel — as the one
 * child `AnimatePresence` keeps mounted while they leave.
 *
 * The panel slides from the INLINE-START edge, which is the right under
 * `dir=rtl`: a transform has no logical form, so the sign is read from the
 * document ONCE, when the drawer mounts, and kept for the exit (the page
 * cannot change language while a 120 ms exit runs, and the panel must leave
 * the way it came). The server never renders this — `open` starts false — so
 * reading the document in the initialiser is safe.
 *
 * A LEAVING DRAWER IS INERT (HANDBOOK «Motion», rule 8): the customer has
 * already closed it, so nothing in it may take focus or a tap while it fades
 * — least of all a row's link, which would navigate from a menu that is gone.
 * Closing never waits on the animation: `open` is already false.
 */
function DrawerLayer({
  panelRef,
  panelId,
  label,
  onDismiss,
  children,
}: {
  panelRef: Ref<HTMLElement>;
  panelId: string;
  label: string;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const leaving = useLeaving();
  const [offscreen] = useState(() => (document.documentElement.dir === "rtl" ? "100%" : "-100%"));
  const enter = useMotionTransition("slow");
  const exit = useMotionTransition("exit");

  return (
    <>
      {/* THE DISMISS AREA: a tap anywhere on it closes the drawer (the
          document-level pointerdown in `MobileMenu` does the work).
          `aria-hidden` and not focusable: Escape and the rows are the
          keyboard's way out. */}
      <mo.div
        aria-hidden
        inert={leaving}
        onClick={onDismiss}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: enter }}
        exit={{ opacity: 0, transition: exit }}
        className="fixed inset-0 z-[60] bg-[var(--color-backdrop)] backdrop-blur-[8px]"
      />

      <mo.nav
        ref={panelRef}
        id={panelId}
        aria-label={label}
        inert={leaving}
        initial={{ x: offscreen }}
        animate={{ x: 0, transition: enter }}
        exit={{ x: offscreen, transition: exit }}
        className="fixed bottom-0 start-0 top-0 z-[61] flex w-[300px] max-w-[calc(100vw-40px)] flex-col overflow-hidden rounded-e-[26px] bg-[var(--background)] text-[var(--color-ink)] shadow-xl"
      >
        {children}
      </mo.nav>
    </>
  );
}
