import type { Announcement } from "@/lib/content/announcements";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { ReturnPathInput } from "@/components/ui/ReturnPathInput";

/**
 * The strip above the header — Figma `4294:8139`: full width, 40px, Cairo
 * SemiBold 20/1.4 centred on `Background/secondary/Default`.
 *
 * The comp draws the PROMO style. The other three styles an admin can pick
 * take their role's wash from the same semantic layer, so a warning never
 * borrows the promotion yellow.
 *
 * NOT IN THE PHONE COMP, drawn on phones anyway — at the phone's caption size.
 * It is content staff publish, and hiding it from the majority of customers
 * (who are on phones) would make the admin's announcement a desktop feature.
 *
 * DISMISSING IS A PLAIN FORM POST to `/api/preferences`, like the currency and
 * language switchers: it works before hydration. With JavaScript off the bar
 * is the shell's copy and carries no «×» — the visitor's answer (their
 * dismissal cookie) streams in a boundary that never swaps in without a
 * script, so a «×» there could never stick (`AnnouncementSlot`).
 */
const STYLE: Record<Announcement["style"], string> = {
  promo: "bg-[var(--color-secondary)]",
  info: "bg-[var(--color-info-wash)]",
  warning: "bg-[var(--color-warning)]",
  success: "bg-[var(--color-success-wash)]",
};

export function AnnouncementBar({
  announcement,
  locale,
}: {
  announcement: Announcement;
  locale: Locale;
}) {
  const m = messagesFor(locale);

  return (
    <div
      role="region"
      aria-label={m.nav.announcement}
      // The visual suite masks this — its text is whatever staff publish.
      data-announcement
      className={`relative flex min-h-10 items-center justify-center gap-3 px-10 py-[2px] text-center text-[var(--color-ink)] ${STYLE[announcement.style]}`}
    >
      <p className="text-body-s font-semibold leading-[1.4] lg:text-heading-l">
        {announcement.message}
        {announcement.link ? (
          <>
            {" "}
            <a href={announcement.link.url} className="underline underline-offset-4">
              {announcement.link.label}
            </a>
          </>
        ) : null}
      </p>

      {announcement.dismissible ? (
        <form action="/api/preferences" method="post" className="absolute inset-y-0 end-2 flex items-center">
          <input type="hidden" name="dismiss_announcement" value={announcement.id} />
          <ReturnPathInput />
          <button
            type="submit"
            aria-label={m.nav.dismissAnnouncement}
            className="grid size-8 place-items-center rounded-full text-heading-m leading-none hover:bg-[var(--color-action-hover)]"
          >
            ×
          </button>
        </form>
      ) : null}
    </div>
  );
}
