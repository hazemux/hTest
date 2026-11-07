"use client";

import { useEffect } from "react";

import { MAX_VIEWED, parseViewed, VIEWED_COOKIE, withViewed } from "@/lib/catalog/viewed";

/**
 * Notes that the visitor opened this product, for «قد ينال إعجابك أيضاً».
 *
 * After render, in the browser: the page itself is rendered by the server and
 * may be served to anybody, so the write is this visitor's alone. Thirty days,
 * `SameSite=Lax`, the whole site. Renders nothing.
 */
export function RecordProductView({ slug }: { slug: string }) {
  useEffect(() => {
    const current = document.cookie
      .split("; ")
      .find((part) => part.startsWith(`${VIEWED_COOKIE}=`))
      ?.slice(VIEWED_COOKIE.length + 1);
    const next = withViewed(parseViewed(current), slug).slice(0, MAX_VIEWED);
    document.cookie = `${VIEWED_COOKIE}=${encodeURIComponent(next.join(","))}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`;
  }, [slug]);

  return null;
}
