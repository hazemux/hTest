import Image from "next/image";

import { CopyButton } from "@/components/checkout/CopyButton";
import type { components } from "@/lib/api/generated/v1.d.ts";
import type { Messages } from "@/lib/i18n/messages";

export type LineDelivery = NonNullable<NonNullable<components["schemas"]["Order"]["items"]>[number]["delivery"]>;

/**
 * One delivered line's hand-over, by what the product is (2026-10-01): a
 * digital card's codes, one per card, each with its own copy button; a direct
 * top-up's proof screenshot («إثبات الشحن») when there is one. Draws nothing
 * when there is nothing to hand over, so a top-up without a proof never shows
 * an empty box or a hint that something is missing.
 *
 * CODES BY LINK (owner, 2026-10-15; v0.1.132). A card line whose codes went
 * to the customer through ChargerUni's own secure link (`channel: link`)
 * holds no code here: it says where the codes went — WhatsApp or email — and
 * to follow that link, and draws no reveal and no copy button. The channel is
 * the LINE's own, so a line delivered with codes keeps showing them.
 */
export function LineDelivered({
  delivery,
  proofHref,
  productName,
  m,
}: {
  delivery: LineDelivery | null;
  proofHref: string;
  productName: string;
  m: Messages;
}) {
  if (!delivery) return null;
  const note = delivery.note ?? null;

  if (delivery.channel === "link") {
    return (
      <div className="flex flex-col gap-1 rounded-[10px] bg-[var(--color-success-subtlest)] px-3 py-2.5">
        <span className="text-caption font-bold text-[var(--color-success)] lg:text-body-s">{m.orderView.codesByLinkTitle}</span>
        <p className="text-caption leading-[1.6] text-[var(--color-ink)] lg:text-body-s">{m.orderView.codesByLinkBody}</p>
        {note ? (
          <p dir="auto" className="text-caption leading-[1.6] text-[var(--color-ink)] lg:text-body-s">
            {note}
          </p>
        ) : null}
      </div>
    );
  }

  const codes = delivery.codes ?? [];
  if (codes.length === 0 && !note && !delivery.has_proof) return null;

  const title =
    codes.length > 1 ? m.orderView.cardCodesTitle : codes.length === 1 ? m.orderView.cardCodeTitle : delivery.has_proof ? m.orderView.proofTitle : m.orderView.deliveryNoteTitle;

  return (
    <div className="flex flex-col gap-2 rounded-[10px] bg-[var(--color-success-subtlest)] px-3 py-2.5">
      <span className="text-caption font-bold text-[var(--color-success)] lg:text-body-s">{title}</span>
      {codes.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {codes.map((code, n) => (
            <li key={n} className="flex flex-col gap-0.5">
              {/* Above the code, not beside it: on a phone the code keeps
                  the whole row and a 4×4 code stays on one line. */}
              {codes.length > 1 ? (
                <span className="text-caption text-[var(--color-ink-subtle)] lg:text-body-s">{m.orderView.cardN.replace("{n}", String(n + 1))}</span>
              ) : null}
              <span className="flex items-center gap-2">
                <bdi dir="ltr" className="min-w-0 flex-1 text-start font-mono text-body-m font-bold tracking-[0.5px] [overflow-wrap:anywhere]">
                  {code}
                </bdi>
                <CopyButton
                  value={code}
                  label={m.orderView.copy}
                  copiedLabel={m.orderView.copied}
                  accessibleName={codes.length > 1 ? `${m.orderView.copy} ${m.orderView.cardN.replace("{n}", String(n + 1))}` : `${m.orderView.copy} ${m.orderView.cardCode}`}
                  className="inline-flex h-[30px] shrink-0 items-center gap-1 rounded-[8px] bg-[var(--background)] px-2.5 text-caption font-bold text-[var(--color-brand-500)] lg:text-body-s focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] [&>svg]:hidden"
                />
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {codes.length === 0 && delivery.has_proof ? (
        <a
          href={proofHref}
          target="_blank"
          rel="noopener"
          aria-label={m.orderView.proofOpen}
          className="relative block h-[180px] overflow-hidden rounded-[8px] bg-[var(--background)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] lg:h-[220px]"
        >
          <Image src={proofHref} alt={m.orderView.proofAlt.replace("{product}", productName)} fill unoptimized sizes="(min-width: 1024px) 600px, 100vw" className="object-contain" />
        </a>
      ) : null}
      {note ? (
        <p dir="auto" className="text-caption leading-[1.6] text-[var(--color-ink)] lg:text-body-s">
          {note}
        </p>
      ) : null}
    </div>
  );
}
