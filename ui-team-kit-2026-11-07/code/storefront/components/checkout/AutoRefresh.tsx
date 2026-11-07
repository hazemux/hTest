"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Asks the server again, every few seconds, while a payment is being
 * confirmed — so «نتحقق من الدفع» turns into the answer without the customer
 * pressing anything. It re-reads the ORDER (the server page renders again);
 * nothing here decides an outcome. Stops after a couple of minutes: by then
 * the order's own page is the better place to wait, and it is one tap away.
 */
export function AutoRefresh({
  everySeconds = 5,
  forSeconds = 120,
  notice,
  stoppedNotice,
  refreshLabel,
}: {
  everySeconds?: number;
  forSeconds?: number;
  /** Said while it is still checking — «تتحدث هذه الصفحة تلقائياً». */
  notice?: string;
  /** Said once it has given up, so the page stops promising what it no longer does. */
  stoppedNotice?: string;
  /** The button that asks once more by hand. */
  refreshLabel?: string;
}) {
  const router = useRouter();
  const [stopped, setStopped] = useState(false);

  useEffect(() => {
    let left = Math.floor(forSeconds / everySeconds);
    const timer = window.setInterval(() => {
      left -= 1;
      if (left < 0) {
        window.clearInterval(timer);
        setStopped(true);
        return;
      }
      router.refresh();
    }, everySeconds * 1000);
    return () => window.clearInterval(timer);
  }, [router, everySeconds, forSeconds]);

  if (!notice) return null;

  return stopped ? (
    <p className="text-center text-caption text-[var(--color-ink-subtle)]">
      {stoppedNotice}{" "}
      <button type="button" onClick={() => router.refresh()} className="font-bold text-[var(--color-brand-500)] underline">
        {refreshLabel}
      </button>
    </p>
  ) : (
    <p className="text-center text-caption text-[var(--color-ink-subtle)]">{notice}</p>
  );
}
