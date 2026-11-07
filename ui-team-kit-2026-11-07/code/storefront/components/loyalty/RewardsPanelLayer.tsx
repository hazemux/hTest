"use client";

import { AnimatePresence } from "motion/react";
import * as mo from "motion/react-m";
import type { ReactNode } from "react";

import { useLeaving } from "@/components/ui/motion/Leaving";
import { MotionScope } from "@/components/ui/motion/MotionScope";
import { useMotionTransition } from "@/lib/motion/useMotionTransition";

import { DROPDOWN_CLASSES, DROPDOWN_PANEL_CLASSES, DropdownPointer } from "./dropdown";
import { RewardsPanel } from "./RewardsPanel";
import type { RewardsPanelProps } from "./panel/types";

/**
 * THE PANEL'S LAZY CHUNK. `PointsChip` sits in the header on every page, so
 * the panel's nine views and Motion's render core live here, behind
 * `React.lazy`, mounted when the browser is idle or on the chip's first
 * hover/focus/touch (`useIdlePreload`) — never in every page's first load.
 *
 * DROPDOWN (desktop): scales and fades from the chip's end edge, under a
 * pointer that sits beneath the chip. `AnimatePresence initial={false}`: the
 * first render is the final state. A leaving panel is `inert` — it has
 * already closed (HANDBOOK «Motion», rule 8).
 *
 * SHEET (phone): only the panel. The native `<dialog>` around it belongs to
 * `PointsChip`, and its rise and fall are CSS (`.cq-sheet`), like every sheet.
 */
export default function RewardsPanelLayer({ mode, open, session, panel }: { mode: "dropdown" | "sheet"; open: boolean; session: number; panel: Omit<RewardsPanelProps, "layout"> }): ReactNode {
  if (mode === "sheet") {
    // Mounted only once the sheet has been opened (`session` starts at 0):
    // the idle preload must download the chunk, not render a hidden panel
    // that asks for its lists before anyone opened it (ADR 0043 §9). Kept
    // after a close so the sheet's CSS exit still has content to carry.
    return session > 0 ? <RewardsPanel key={session} {...panel} layout="sheet" /> : null;
  }
  return (
    <MotionScope>
      <AnimatePresence initial={false}>
        {open ? (
          <DropdownBox key={session}>
            <RewardsPanel {...panel} layout="dropdown" />
          </DropdownBox>
        ) : null}
      </AnimatePresence>
    </MotionScope>
  );
}

function DropdownBox({ children }: { children: ReactNode }) {
  const leaving = useLeaving();
  const enter = useMotionTransition("base");
  const exit = useMotionTransition("exit");
  return (
    <mo.div
      inert={leaving}
      initial={{ opacity: 0, scale: 0.96, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0, transition: enter }}
      exit={{ opacity: 0, scale: 0.96, y: -4, transition: exit }}
      className={DROPDOWN_CLASSES}
    >
      <DropdownPointer />
      <div className={DROPDOWN_PANEL_CLASSES}>{children}</div>
    </mo.div>
  );
}
