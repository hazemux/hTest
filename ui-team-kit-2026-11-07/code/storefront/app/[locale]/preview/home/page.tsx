import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { HomePage } from "@/components/home/HomePage";
import { ApiError, previewHomeLayout } from "@/lib/api/client";
import { appPreviewFrameSrc } from "@/lib/home/preview-frame";
import { isLocale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * The home page as the dashboard's DRAFT draws it (ADR 0026) — where the
 * Home page screen's «Preview» link lands. Same page, same components, the
 * saved draft instead of what is published; refresh after saving again.
 *
 * The token in the link is the only key, and the API decides it: forged or
 * expired is a 404 here exactly as there. Never indexed and never cached
 * (`no-store` read, and `next.config.ts` marks the path private, which also
 * keeps the token out of the Referer a banner click would send).
 *
 * THE APP'S HOME (`?surface=app`, Plan 4b) is shown as a phone draws it. This
 * outer page validates the token with ONE preview read (a bad one is the same
 * 404; a token-shape check could not tell forged from expired), then holds a
 * same-origin iframe of `./frame` — the bare app home, laid out at the
 * frame's own width, with none of the website's chrome (`SiteChrome`
 * `STANDALONE`; the app has none of it). The staff member's own header and
 * footer stay around this outer page. `next.config.ts` lets only the inner
 * `./frame` page be framed, by our own origin; this outer page stays
 * unframable like the rest of the store.
 *
 * The app preview's read (here, and the frame's) is sent AS THE APP
 * (`previewHomeLayout`'s `surface: "app"`, ruling R19), so it is filtered for
 * the app's catalogue mode, as the live app's read is.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function HomePreviewRoute(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[]; surface?: string | string[] }>;
}) {
  const [{ locale }, { token, surface }] = await Promise.all([props.params, props.searchParams]);
  if (!isLocale(locale) || typeof token !== "string" || token === "") notFound();

  // `?surface=app` is the customer app's home; anything else is the website's.
  const appPreview = surface === "app";

  let blocks;
  try {
    blocks = (await previewHomeLayout(token, { locale, ...(appPreview ? { surface: "app" as const } : {}) })).data.blocks;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const m = messagesFor(locale);

  const notice = (
    <p
      role="status"
      className="sticky top-0 z-30 bg-[var(--color-secondary)] px-4 py-2 text-center text-body-s font-semibold text-[var(--color-on-secondary)]"
    >
      {appPreview ? m.home.appPreviewNotice : m.home.previewNotice}
    </p>
  );

  // The outer app preview: the notice, then the phone. The token is only in
  // the same-origin `src`. 390 wide at most and the full width under that.
  if (appPreview) {
    return (
      <main className="flex-1">
        {notice}
        <div className="px-4 py-6">
          <iframe
            src={appPreviewFrameSrc({ locale, token })}
            title={m.home.appPreviewFrameTitle}
            className="mx-auto block h-[844px] w-[min(390px,100%)] max-w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)]"
          />
        </div>
      </main>
    );
  }

  return <HomePage locale={locale} blocks={blocks} notice={notice} />;
}
