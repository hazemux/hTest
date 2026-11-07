"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { reviewPromptShown } from "@/lib/reviews/rate-order";

import { RateOrderSheet, type RatedProduct } from "./RateOrderSheet";

/** Asked once per browser visit; the server decides once per ORDER. */
const ASKED_KEY = "cq_review_prompt_asked";

/** Where a sheet would interrupt something more important than a review. */
const QUIET = /\/(cart|checkout|payment|order-status|orders|account\/sign-in|account\/sign-up|preview)(\/|$)/;

type Prompt = { order_id: string; reward_points: number; product: RatedProduct | null };

/**
 * The light reminder (ADR 0042, owner 2026-10-07): a customer who has not
 * rated a delivered order is asked ONCE, on a later visit, with the same
 * sheet as the order page (Figma «Order details Second Login pop up»,
 * `7610:9690`). The moment it opens the server stamps the order as asked, on
 * every device; closing it is the end of it.
 *
 * Mounted in the layout for every page, so it does nothing until after
 * hydration and asks at most once per visit (`sessionStorage`) — a guest's
 * answer is a 204 from `/api/account/review-prompt`, and so is "nothing to
 * ask". Never over the basket, checkout, payment or an order page.
 */
export function ReviewPromptHost({ locale, signedIn }: { locale: Locale; signedIn: boolean }) {
  const pathname = usePathname() ?? "";
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!signedIn || QUIET.test(pathname)) return;
    try {
      if (window.sessionStorage.getItem(ASKED_KEY)) return;
      window.sessionStorage.setItem(ASKED_KEY, "1");
    } catch {
      // Storage refused (private mode): ask anyway — the server still asks once per order.
    }

    // NOT aborted when the page changes: the visit is marked as asked above,
    // so a request cancelled by a quick navigation would lose the reminder.
    // The host lives in the layout and outlives every page it waits on.
    fetch(`/api/account/review-prompt?locale=${locale}`, { cache: "no-store" })
      .then((response) => (response.status === 200 ? (response.json() as Promise<Prompt>) : null))
      .then((found) => {
        if (!found?.order_id) return;
        setPrompt(found);
        setOpen(true);
        void reviewPromptShown(found.order_id, locale);
      })
      .catch(() => undefined);
    // Re-checked on navigation — a customer who signs in mid-visit is asked on
    // the next page — but `sessionStorage` keeps it to one request per visit.
  }, [signedIn, pathname, locale]);

  if (!prompt) return null;

  return (
    <RateOrderSheet
      locale={locale}
      orderId={prompt.order_id}
      title={messagesFor(locale).orderReview.titleOrder.replace("{id}", prompt.order_id)}
      rewardPoints={prompt.reward_points}
      product={prompt.product}
      open={open}
      onClose={() => setOpen(false)}
    />
  );
}
