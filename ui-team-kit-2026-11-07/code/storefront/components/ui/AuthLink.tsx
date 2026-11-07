"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { authHref } from "@/lib/account/auth-href";
import type { Locale } from "@/lib/i18n/locales";

type Props = {
  locale: Locale;
  kind: "sign-in" | "sign-up";
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
};

/**
 * A link to sign in (or up) that brings the customer BACK to the page they
 * were on. Read from the live URL, as `ReturnPathInput` reads it: the chrome
 * lives in the layout, which does not re-render on a client navigation, so a
 * path passed down as a prop is the page the customer LANDED on. The query
 * comes in a Suspense boundary; until it resolves the path alone is used.
 */
export function AuthLink(props: Props) {
  return (
    <Suspense fallback={<PathOnlyLink {...props} />}>
      <LiveAuthLink {...props} />
    </Suspense>
  );
}

function PathOnlyLink({ locale, kind, className, onClick, children }: Props) {
  const pathname = usePathname();
  return (
    <Link href={authHref(locale, kind, pathname)} onClick={onClick} className={className}>
      {children}
    </Link>
  );
}

function LiveAuthLink({ locale, kind, className, onClick, children }: Props) {
  const pathname = usePathname();
  const params = new URLSearchParams(useSearchParams()?.toString());
  // One-off notices describe the moment, not the page.
  for (const key of ["added", "stock_alert", "saved", "error"]) params.delete(key);
  const query = params.toString();
  const here = pathname ? `${pathname}${query ? `?${query}` : ""}` : null;

  return (
    <Link href={authHref(locale, kind, here)} onClick={onClick} className={className}>
      {children}
    </Link>
  );
}
