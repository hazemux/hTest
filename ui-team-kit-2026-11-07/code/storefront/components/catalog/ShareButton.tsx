"use client";

import { useState } from "react";

/**
 * The share control beside the heart (Figma 6847:97163).
 *
 * `navigator.share` FIRST, because on the phones this store is actually used on
 * that is the native sheet — WhatsApp, Telegram, the group chat where a link to
 * a top-up gets passed around. The clipboard is the fallback for desktop, and a
 * short confirmation is the only feedback either path gives.
 *
 * IT RENDERS AS A BUTTON THAT DOES NOTHING WITHOUT JAVASCRIPT, and that is
 * acceptable here in a way it would not be for the cart: the page's own URL is
 * in the address bar, so a customer with no bundle has lost a convenience, not
 * the ability to do the thing. Every control that MOVES MONEY on this page is a
 * plain form post for exactly that reason.
 *
 * IT SHARES `location.href`, READ AT CLICK TIME — never a URL assembled from
 * props. Whatever the customer is looking at, including the tier in the query
 * string, is what their friend opens.
 */
export function ShareButton({
  label,
  copiedLabel,
  title,
  onArtwork = false,
}: {
  label: string;
  copiedLabel: string;
  /** The product name, so a native share sheet has something to say. */
  title: string;
  /** White over the product artwork's scrim (desktop), ink on the page otherwise. */
  onArtwork?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // A cancelled sheet throws exactly like a failed one. Falling through
        // to the clipboard would silently copy a link the customer just chose
        // not to send, so this simply stops.
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard permission and no share sheet: nothing useful left to do,
      // and the URL is in the address bar anyway.
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      title={copied ? copiedLabel : label}
      aria-label={copied ? copiedLabel : label}
      className={`grid size-9 place-items-center rounded-full transition ${
        onArtwork ? "text-white hover:opacity-80" : "text-[var(--color-ink)] hover:bg-[var(--color-chip)]"
      }`}
    >
      {/* A mask in `currentColor`, so one file is ink on the page and white on
          the artwork. */}
      <span
        aria-hidden
        className={`block bg-current [mask-image:url(/brand/icon-share.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] ${
          onArtwork ? "size-7" : "size-5"
        }`}
      />
    </button>
  );
}
