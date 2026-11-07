"use client";

import { useEffect } from "react";

/**
 * A link to `#reviews` opens the reviews tab — on arrival (the «قيّم طلبك»
 * email, the form's own return) and in place, from the rating beside the
 * title («Product Page Mobile»). The tabs are radios and work without this;
 * it only picks the right one.
 */
export function OpenReviewsFromLink() {
  useEffect(() => {
    const open = () => {
      if (window.location.hash !== "#reviews") return;
      const tab = document.getElementById("product-tab-reviews");
      if (tab instanceof HTMLInputElement) {
        tab.checked = true;
        document.getElementById("reviews")?.scrollIntoView({ block: "start" });
      }
    };

    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);

  return null;
}
