"use client";

import { useEffect } from "react";

import { reportClientError } from "@/lib/monitoring/report-client";

/**
 * The last resort: an error thrown by the ROOT layout itself.
 *
 * `app/[locale]/error.tsx` catches everything inside a locale's pages, but it
 * renders *within* the root layout — so if that layout is what threw, there is
 * no boundary above it and Next.js falls back to its own screen. This replaces
 * that screen, and it must supply its own `<html>` and `<body>`: the layout
 * that normally provides them is precisely what failed.
 *
 * ARABIC AND RTL, HARDCODED. Everything that would tell us the locale — the
 * layout, the route params, the message dictionary — lives above or inside the
 * thing that broke. Arabic is this store's default and the majority of its
 * customers; guessing English here would serve the wrong language to most
 * people at their worst moment. The English line sits underneath rather than
 * instead.
 *
 * Styles are inline for the same reason: a failed root layout means the
 * stylesheet link it renders never reached the page, so a class name here
 * would resolve to nothing. The literals are the Figma variables' own values
 * (`Theme/text-primary` #212121, `text-secondary` #5e5e5e, `text-subtitle`
 * #818181, `Button/Primary/default` #007bbf) — the one place in the app a
 * token cannot reach, so the values are copied rather than invented.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  /** Fetches the failed root again (Next 16.3+); `reset()` would only re-render what already failed. */
  retry: () => void;
}) {
  // Browser-side failures only; a digest was reported on the server.
  useEffect(() => reportClientError(error), [error]);

  return (
    <html lang="ar" dir="rtl" translate="no" className="notranslate">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          padding: "48px 24px",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          color: "#212121",
          background: "#fff",
        }}
      >
        <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>حدث خطأ غير متوقع</h1>
        <p style={{ fontSize: "15px", color: "#5e5e5e", margin: 0 }}>
          نعتذر، لم نتمكن من تحميل الصفحة. حاول مرة أخرى.
        </p>
        <p style={{ fontSize: "13px", color: "#5e5e5e", margin: 0 }} dir="ltr">
          Something went wrong. Please try again.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          style={{
            marginTop: "8px",
            border: 0,
            borderRadius: "12px",
            background: "#007bbf",
            color: "#fff",
            fontSize: "15px",
            fontWeight: 600,
            padding: "12px 28px",
            cursor: "pointer",
          }}
        >
          إعادة المحاولة
        </button>
        {/* The digest, and only the digest — it is the id that joins this
            screen to the server log, and it carries none of the message,
            hostname or stack that `error.message` can. */}
        {error.digest ? (
          <p style={{ fontSize: "11px", color: "#818181", margin: 0 }} dir="ltr">
            {error.digest}
          </p>
        ) : null}
      </body>
    </html>
  );
}
