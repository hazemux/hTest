import Image from "next/image";

import type { AppStore } from "@/lib/content/store-links";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

/*
 * The stores' own badges, exported from the comps (desktop 6946:36628–30,
 * phone 6959:18273–76) with the export plates stripped — the stores' artwork,
 * never redrawn. Width is what both comps pin (190.67 on desktop, ~77.5 on
 * the phone); the height follows each badge's own proportions, which is why
 * Apple's (a taller badge) stands a little higher, as the desktop comp draws
 * it.
 */
const BADGES: Readonly<Record<AppStore, { src: string; width: number; height: number }>> = {
  app_store: { src: "/brand/badge-app-store.svg", width: 190.67, height: 63.56 },
  google_play: { src: "/brand/badge-google-play.svg", width: 190.67, height: 56.49 },
  app_gallery: { src: "/brand/badge-app-gallery.svg", width: 190.67, height: 56.92 },
};

/**
 * «حمّل التطبيق الآن» — the app-download banner (phone 6959:18207, desktop
 * 6944:26426), the home page's last section.
 *
 * DATA, NOT A PROMISE (ADR 0019 §24). The store links are dashboard settings
 * (`general.app_store_url` / `google_play_url` / `app_gallery_url`, contract
 * v0.1.100): the section renders only once at least one is set, and each
 * badge only with its own link. A badge to a store the app is not in would
 * be a dead control on the most-seen page of the store.
 *
 * The gold panel with the phone is the comp's own render (the phone's screen
 * included), exported per frame — the phone's 152×249 and the desktop's
 * 500×500 crop the device differently, so one image cannot serve both.
 */
export function AppDownload({ locale, links }: { locale: Locale; links: { store: AppStore; href: string }[] }) {
  if (links.length === 0) return null;

  const m = messagesFor(locale).home.appDownload;

  return (
    <section aria-labelledby="app-download-heading" className="mx-auto mt-6 w-full max-w-[1248px] px-6 lg:mt-12">
      {/* Blue ground, 16px corners, the copy at the START and the gold panel
          at the END — the Arabic comps put the panel on the left. Desktop:
          the comp's 32px start padding, the two halves centred vertically. */}
      <div className="flex overflow-hidden rounded-[16px] bg-[var(--color-primary)] text-[var(--color-on-primary)] lg:items-center lg:justify-between lg:gap-8 lg:ps-8">
        {/* A tablet (md) keeps the phone's two halves at a size between the
            two comps: 24/16 copy, the badges in one row, a wider panel. */}
        <div className="flex min-w-0 flex-1 flex-col gap-3 px-4 py-5 md:gap-6 md:px-8 md:py-8 lg:max-w-[604px] lg:gap-10 lg:px-0 lg:py-10">
          <div className="flex flex-col gap-1.5 text-start md:gap-2 lg:gap-3">
            {/* Bold 18/24 on the phone; the desktop comp's SemiBold 32 and
                Regular 28 are display sizes above the type ramp's 24
                (HANDBOOK §5 allows an arbitrary size only there). */}
            <h2
              id="app-download-heading"
              className="text-heading-m font-bold leading-6 md:text-display md:leading-normal lg:text-[32px] lg:font-semibold"
            >
              {m.titleBefore}
              <span className="text-[var(--color-secondary)]">{m.titleHighlight}</span>
              {m.titleAfter}
            </h2>
            <p className="text-caption leading-4 md:text-body-l md:leading-[1.5] lg:text-[28px] lg:leading-[1.25]">{m.body}</p>
          </div>

          {/* Stacked on the phone (gap 5), one row on desktop (gap 16). */}
          <ul className="flex flex-col items-start gap-[5px] md:flex-row md:flex-wrap md:items-center md:gap-3 lg:gap-4">
            {links.map(({ store, href }) => {
              const badge = BADGES[store];
              return (
                <li key={store}>
                  <a href={href} target="_blank" rel="noopener noreferrer" className="block rounded-[6px]">
                    <Image
                      src={badge.src}
                      alt={m.badges[store]}
                      width={badge.width}
                      height={badge.height}
                      className="h-auto w-[77.5px] md:w-[130px] lg:w-[150px] xl:w-[190.67px]"
                    />
                  </a>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="relative w-[152px] shrink-0 self-stretch md:w-[220px] lg:hidden">
          <Image
            src="/brand/app-download-panel-mobile.webp"
            alt=""
            aria-hidden
            fill
            sizes="(min-width: 768px) 220px, 152px"
            // A file from public/: served as itself, never through
            // `/_next/image` (HANDBOOK §7 item 8).
            unoptimized
            className="object-cover object-top"
          />
        </div>
        <Image
          src="/brand/app-download-panel.webp"
          alt=""
          aria-hidden
          width={500}
          height={500}
          sizes="(min-width: 1280px) 500px, 400px"
          unoptimized
          className="hidden shrink-0 lg:block lg:size-[400px] xl:size-[500px]"
        />
      </div>
    </section>
  );
}
