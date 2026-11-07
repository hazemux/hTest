import Link from "next/link";
import type { ReactNode } from "react";

import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * A checkout's title — on the phone as «Checkout Mobile» (2026-09-30) draws
 * it: the site's navbar is gone (`SiteChrome`), and a 64-tall bar holds only
 * the way back and the title, pinned while the page scrolls. From `lg` the
 * site header is back and the title is an ordinary page heading.
 *
 * `backHref` is where the customer came from — the basket, or the product —
 * a real link, so it works before any script has loaded. `end` is a page's own
 * button at the far edge of the phone bar (the order's invoice, «Order Details
 * Mobile»).
 */
export function CheckoutHeader({
  locale,
  title,
  backHref,
  end,
  phoneOnly = false,
}: {
  locale: Locale;
  title: string;
  backHref: string;
  end?: ReactNode;
  /** Draw no heading from `lg` — the page has its own there. */
  phoneOnly?: boolean;
}) {
  const m = messagesFor(locale);

  return (
    <>
      <header className="sticky top-0 z-20 -mx-6 flex h-16 items-center gap-2 bg-[var(--background)] px-4 lg:hidden">
        <Link href={backHref} aria-label={m.checkout.back} className="grid size-10 shrink-0 place-items-center rounded-[12px]">
          {/* The chevron points left as drawn: back in English, mirrored for Arabic. */}
          <span
            aria-hidden
            className="block size-6 bg-[var(--color-ink)] [mask-image:url(/brand/icon-chevron-start.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:5.5px_11.5px] rtl:-scale-x-100"
          />
        </Link>
        <h1 className="flex-1 text-heading-m font-bold leading-[1.4] text-[var(--color-ink)]">{title}</h1>
        {end}
      </header>
      {phoneOnly ? null : <h1 className="mb-8 hidden text-display font-bold leading-[1.4] text-[var(--color-ink)] lg:block">{title}</h1>}
    </>
  );
}
