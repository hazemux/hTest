import { Suspense } from "react";

import { AnnouncementBar } from "@/components/ui/AnnouncementBar";
import { isPublicId } from "@/lib/api/public-id";
import { announcementRows, dismissedAnnouncement, pickAnnouncement, type Announcement } from "@/lib/content/announcements";
import type { Locale } from "@/lib/i18n/locales";

type Rows = Awaited<ReturnType<typeof announcementRows>>;

/**
 * The announcement bar, split along ADR 0046 §2: the bars staff publish are
 * the SAME for every visitor (`announcementRows`, the shared shell), whether
 * THIS visitor closed one is their cookie (`AnnouncementForVisitor`, its own
 * Suspense boundary). The layout reads neither cookie nor header for it.
 *
 * THE FALLBACK IS THE BAR ITSELF — the bar everyone sees, drawn in the shell —
 * not an empty box of a guessed height. The bar is `min-h-10` but its message
 * wraps (a long campaign line at 360px is two lines), so only the bar holds
 * the bar's height exactly; and the visitor who has not closed it — nearly
 * everyone — sees it at once, as before this split, and their own copy (with
 * its «×») lands in the same room with nothing moving.
 *
 * THE VISITOR WHO CLOSED IT NEVER SEES IT, AND SEES THE NEXT ONE AT ONCE.
 * Their answer is the runner-up (or nothing), and a top bar that showed and
 * then left would flash the thing they closed and move the page. So the shell
 * carries the runner-up too — `pickAnnouncement(rows, locale, top.id)`,
 * hidden — and a rule keyed by the two bars' public ids swaps them under
 * `html[data-closed-bar="<top id>"]`, which `CLOSED_BAR_SCRIPT`
 * (`lib/content/closed-bar-script.ts`, in <head>) stamps from the dismissal
 * cookie before the first paint. Both ids are the bars', the same for every
 * visitor, so the shell stays shared; the visitor's own bar then streams into
 * the room already drawn. The rule is written only for ids shaped like public
 * ids — the script stamps nothing else either.
 *
 * THE COPY HAS NO «×». With JavaScript off the streamed answer never swaps in,
 * so the copy is what such a visitor has, and the cookie a «×» would post is
 * one this copy can never read back — a button that does nothing is worse
 * than none (HANDBOOK §5, honesty rules). With JavaScript on the visitor's
 * own bar, «×» included, replaces it as soon as it streams.
 *
 * A BAR NOBODY CAN CLOSE NEEDS NO VISITOR: when the bar everyone sees is not
 * dismissible, no cookie can change the answer (`pickAnnouncement` never
 * skips it), so it is drawn straight into the shell with no boundary at all.
 */
export async function AnnouncementSlot({ locale }: { locale: Locale }) {
  const rows = await announcementRows(locale);
  const forEveryone = pickAnnouncement(rows, locale, undefined);

  if (forEveryone === null) return null;
  if (!forEveryone.dismissible) return <AnnouncementBar announcement={forEveryone} locale={locale} />;

  return (
    <Suspense fallback={<AnnouncementFallback top={forEveryone} next={pickAnnouncement(rows, locale, forEveryone.id)} locale={locale} />}>
      <AnnouncementForVisitor locale={locale} rows={rows} />
    </Suspense>
  );
}

/**
 * The shell's copies: the top bar, and the runner-up a visitor who closed the
 * top bar sees instead — shown or hidden by `html[data-closed-bar]` before the
 * first paint. Exported for the test that checks the swap.
 */
export function AnnouncementFallback({ top, next, locale }: { top: Announcement; next: Announcement | null; locale: Locale }) {
  // Only ids shaped like public ids go into the rule (the script stamps nothing else).
  const hideable = isPublicId(top.id);
  const runnerUp = hideable && next !== null && isPublicId(next.id) ? next : null;
  // Lowercase, as `CLOSED_BAR_SCRIPT` stamps it.
  const topKey = top.id.toLowerCase();
  const nextKey = runnerUp?.id.toLowerCase();
  const closed = `html[data-closed-bar="${topKey}"] [data-cq-fallback="announcement"]`;
  const rules = hideable
    ? [
        `${closed}[data-bar="${topKey}"]{display:none}`,
        ...(nextKey ? [`[data-cq-fallback="announcement"][data-bar="${nextKey}"]{display:none}`, `${closed}[data-bar="${nextKey}"]{display:block}`] : []),
      ].join("")
    : "";

  return (
    <>
      {rules ? <style>{rules}</style> : null}
      <div data-cq-fallback="announcement" data-bar={topKey}>
        <AnnouncementBar announcement={{ ...top, dismissible: false }} locale={locale} />
      </div>
      {runnerUp ? (
        <div data-cq-fallback="announcement" data-bar={nextKey}>
          <AnnouncementBar announcement={{ ...runnerUp, dismissible: false }} locale={locale} />
        </div>
      ) : null}
    </>
  );
}

async function AnnouncementForVisitor({ locale, rows }: { locale: Locale; rows: Rows }) {
  const bar = pickAnnouncement(rows, locale, await dismissedAnnouncement());
  return bar ? <AnnouncementBar announcement={bar} locale={locale} /> : null;
}
