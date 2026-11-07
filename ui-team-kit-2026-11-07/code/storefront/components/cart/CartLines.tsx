"use client";

import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { MotionScope } from "@/components/ui/motion/MotionScope";
import { Children, isValidElement } from "react";

import { useLeaving } from "@/components/ui/motion/Leaving";
import { useMotionTransition } from "@/lib/motion/useMotionTransition";

/**
 * The basket's lines, so a REMOVED one collapses instead of vanishing.
 *
 * The page stays a Server Component: it renders every row and hands them in
 * as keyed children (key = the line's id), and this only wraps each in a
 * list item that knows how to leave. A removal is still a plain form post
 * that redirects, and the new server HTML is the truth — a row the server no
 * longer sends is kept in the DOM just long enough to fold away (height and
 * opacity to 0), and meanwhile it is inert: it has already left, so nothing
 * in it can be focused or pressed again.
 *
 * `initial={false}`: the first render is the server's HTML, nothing animates
 * in. Nothing here enters — an undone removal simply appears with the page.
 * Keys are the stable line ids, never indexes, or a removal would collapse
 * the wrong row.
 */
export function CartLines({ children }: { children: React.ReactNode }) {
  return (
    <ul className="-mb-3 flex flex-col lg:mb-0">
      <MotionScope><AnimatePresence initial={false}>
        {Children.toArray(children).map((child) =>
          isValidElement(child) ? <CartLine key={child.key}>{child}</CartLine> : null,
        )}
      </AnimatePresence></MotionScope>
    </ul>
  );
}

/**
 * One row's wrapper. The 12px gap between rows is the row's own bottom
 * padding (not a flex gap) so it folds away WITH the row — a gap would hold
 * its 12px until the node is removed and then jump. The list's `-mb-3` takes
 * the last row's padding back out. On desktop the rows are a table's, each
 * with its own hairline, so there is no gap.
 *
 * Overflow is clipped only while leaving, so focus rings are never cut off
 * at rest.
 */
function CartLine({ children }: { children: React.ReactNode }) {
  const leaving = useLeaving();
  const transition = useMotionTransition("base");

  return (
    <m.li exit={{ height: 0, opacity: 0 }} transition={transition} inert={leaving} className={leaving ? "overflow-hidden" : undefined}>
      <div className="pb-3 lg:pb-0">{children}</div>
    </m.li>
  );
}
