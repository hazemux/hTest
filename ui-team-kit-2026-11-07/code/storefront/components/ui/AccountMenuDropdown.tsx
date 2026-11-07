"use client";

import { AnimatePresence } from "motion/react";
import * as mo from "motion/react-m";
import { MotionScope } from "@/components/ui/motion/MotionScope";
import type { ReactNode } from "react";

import { useMotionTransition } from "@/lib/motion/useMotionTransition";

import { useLeaving } from "./motion/Leaving";

/**
 * THE ACCOUNT DROPDOWN'S ANIMATED LAYER — kept in its own module so that
 * `AccountMenu.tsx`, which the layout renders on every page, does not carry
 * Motion's render core in its static imports. `AccountMenu` loads this with
 * `React.lazy`, mounts it when the browser is idle (or on the trigger's first
 * hover/focus/touch) and keeps it mounted, because `AnimatePresence` has to
 * outlive the open menu for the exit to play. Until it arrives `AccountMenu`
 * draws the same box with a plain `<div>` and the same classes
 * (`StaticDropdown`) — keep the two in step.
 *
 * `initial={false}`: the first render is the final state, so the swap from
 * that copy to this one is not an animation.
 */
export default function AccountMenuDropdown({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <MotionScope><AnimatePresence initial={false}>{open ? <DropdownLayer key="dropdown">{children}</DropdownLayer> : null}</AnimatePresence></MotionScope>
  );
}

/**
 * The dropdown's box, as the one child `AnimatePresence` keeps mounted while
 * it leaves: it fades and drops 4 px in, and lifts back out. Vertical only —
 * the menu hangs under its trigger in both directions, so there is nothing
 * to mirror.
 *
 * A LEAVING MENU IS INERT (HANDBOOK «Motion», rule 8): it has already closed,
 * so its rows must take neither a tap nor focus while they fade. Closing does
 * not wait for this — `open` is already false.
 */
function DropdownLayer({ children }: { children: ReactNode }) {
  const leaving = useLeaving();
  const enter = useMotionTransition("base");
  const exit = useMotionTransition("exit");
  return (
    <mo.div
      inert={leaving}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0, transition: enter }}
      exit={{ opacity: 0, y: -4, transition: exit }}
      className="absolute top-full z-40 flex w-full flex-col items-center pt-2"
    >
      {children}
    </mo.div>
  );
}
