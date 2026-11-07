import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { CartBump } from "@/components/cart/CartBump";
import { cartCount, readCart } from "@/lib/cart/cart";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * THE BASKET'S COUNT IS THE VISITOR'S (ADR 0046 §2). It comes from the cart
 * COOKIE — no request — but a cookie is still one person's, so every basket
 * that shows it (the header's two, the buy bar's) is its own Suspense
 * boundary. The shared shell carries the same link with no count; the
 * visitor's replaces it when the stream arrives.
 *
 * The fallback's count is `null`, "not known yet", not «0»: it draws exactly
 * what an empty basket draws, and `CartBump` leaves it out of the bump
 * comparison, so the real count landing is not mistaken for a line just
 * added.
 */
export async function cartBadgeCount(): Promise<number> {
  return cartCount(await readCart());
}

type CartLinkVariant = "phone" | "desktop" | "buy-bar";

/** The header's basket — `phone` beside the pill on buy-bar pages, `desktop` in row one. */
export function HeaderCartLink({ locale, variant }: { locale: Locale; variant: "phone" | "desktop" }) {
  return (
    <Suspense fallback={<CartLinkView locale={locale} variant={variant} count={null} />}>
      <CartLinkForVisitor locale={locale} variant={variant} />
    </Suspense>
  );
}

/** The buy bar's basket, the 48 square before «أضف للسلة» (`ProductPurchase`'s `basket`). */
export function BuyBarCartLink({ locale }: { locale: Locale }) {
  return (
    <Suspense fallback={<CartLinkView locale={locale} variant="buy-bar" count={null} />}>
      <CartLinkForVisitor locale={locale} variant="buy-bar" />
    </Suspense>
  );
}

async function CartLinkForVisitor({ locale, variant }: { locale: Locale; variant: CartLinkVariant }) {
  return <CartLinkView locale={locale} variant={variant} count={await cartBadgeCount()} />;
}

/**
 * One markup for the fallback and the streamed link, so the box is the same.
 * `count` null (the shell) and 0 (an empty basket) draw the same thing.
 */
export function CartLinkView({ locale, variant, count }: { locale: Locale; variant: CartLinkVariant; count: number | null }) {
  const m = messagesFor(locale);

  if (variant === "buy-bar") {
    return (
      <a
        href={`/${locale}/cart`}
        aria-label={count ? `${m.nav.cart} (${count})` : m.nav.cart}
        className="relative grid size-12 shrink-0 place-items-center rounded-[12px] bg-[var(--color-chip)] text-[var(--color-ink)] transition hover:bg-[var(--color-primary-wash-lighter)]"
      >
        <CartBump count={count}>
          <span aria-hidden className="block size-[22px] bg-current [mask-image:url(/brand/icon-cart.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
          {count ? (
            <span
              dir="ltr"
              aria-hidden
              className="absolute -end-1.5 -top-1.5 h-[18px] min-w-[18px] rounded-full bg-[var(--color-danger)] px-[5px] text-center text-caption-xs font-bold leading-[18px] text-[var(--color-on-primary)] shadow-[0_0_0_2px_var(--background)]"
            >
              {count}
            </span>
          ) : null}
        </CartBump>
      </a>
    );
  }

  if (variant === "phone") {
    return (
      <Link
        href={`/${locale}/cart`}
        aria-label={m.nav.cart}
        className="cq-header-cart relative hidden size-[38px] place-items-center rounded-[12px] bg-[var(--color-chip)]"
      >
        <CartBump count={count}>
          <span aria-hidden className="block size-5 bg-[var(--color-ink)] [mask-image:url(/brand/icon-cart.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
        </CartBump>
        {count ? (
          <span
            dir="ltr"
            aria-label={m.cart.itemCount}
            className="absolute -end-1 -top-1 h-[18px] min-w-[18px] rounded-full bg-[var(--color-danger)] px-[5px] text-center text-caption-xs font-bold leading-[18px] text-[var(--color-on-primary)] shadow-[0_0_0_2px_var(--background)]"
          >
            {count}
          </span>
        ) : null}
      </Link>
    );
  }

  return (
    <Link
      href={`/${locale}/cart`}
      className="hidden shrink-0 items-center gap-2 text-heading-m font-normal text-[var(--color-brand-500)] lg:flex"
    >
      {m.nav.cart}
      {count ? (
        // The digits run LTR even on the Arabic page, for the same reason
        // the points balance does.
        <span
          dir="ltr"
          aria-label={m.cart.itemCount}
          className="min-w-[24px] rounded-full bg-[var(--color-brand-500)] px-1.5 text-center text-body-s font-semibold leading-[24px] text-[var(--color-on-primary)]"
        >
          {count}
        </span>
      ) : null}
      <CartBump count={count}>
        <Image src="/brand/icon-cart.svg" alt="" width={24} height={24} aria-hidden />
      </CartBump>
    </Link>
  );
}
