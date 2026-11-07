import { CLARITY_MASK } from "@/lib/analytics/clarity";

/**
 * Masks everything inside it in Clarity's recordings (`lib/analytics/clarity.ts`).
 * `display: contents`, so it adds no box: the page lays out as if it were absent.
 */
export function ClarityMask({ children }: { children: React.ReactNode }) {
  return (
    <div {...CLARITY_MASK} className="contents">
      {children}
    </div>
  );
}
