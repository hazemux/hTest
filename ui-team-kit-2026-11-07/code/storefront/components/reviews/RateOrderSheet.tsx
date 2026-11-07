"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";

import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { CURRENCY_ICON } from "@/lib/loyalty/currency-icon";
import { COMMENT_MAX } from "@/lib/reviews/limits";
import { rateOrderAction, type RateOrderState } from "@/lib/reviews/rate-order";

/** The order's product, shown at the top of the reminder (Figma `7610:9690`). */
export type RatedProduct = {
  name: string;
  tier: string | null;
  imageUrl: string | null;
  imageAlt: string;
  /** Already formatted by the server's `formatMoney` — never computed here. */
  price: string | null;
  quantity: number;
};

const STARS = [1, 2, 3, 4, 5] as const;

/**
 * «قيم طلبك» — the review sheet of Figma «Submitting a review flow»
 * (`7563:57105`): stars, an optional comment with quick chips, and the
 * points an approval earns; then «جارٍ إرسال التقييم…», «شكرًا على التقييم»
 * or «لم يتم إرسال التقييم» with «حاول مرة أخرى», each its own panel of the
 * same bottom sheet (a centred card from `lg`).
 *
 * A native `<dialog>`, like `components/ui/Sheet.tsx`: the browser gives the
 * focus trap, Escape and the inert page. The form is a real form posting to
 * `rateOrderAction`; the stars are radios, so a rating chosen and sent works
 * before any script — the chips and the live counter are the script's extras.
 *
 * The «+N» line is the server's figure (`reward_points`) and is not drawn at 0.
 * Points arrive on APPROVAL, so the thank-you says «ستحصل على», never «حصلت».
 * A review is sent ONCE and is final (owner, 2026-10-07) — there is no edit
 * state; a second send (another tab) lands on «قيّمت هذا الطلب من قبل».
 */
export function RateOrderSheet({
  locale,
  orderId,
  title,
  rewardPoints,
  product,
  open,
  onClose,
}: {
  locale: Locale;
  orderId: string;
  title: string;
  rewardPoints: number;
  product?: RatedProduct | null;
  open: boolean;
  onClose: () => void;
}) {
  const m = messagesFor(locale).orderReview;
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const router = useRouter();
  const [state, formAction, pending] = useActionState<RateOrderState, FormData>(rateOrderAction, { status: "idle" });
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  // The error panel stands until the customer chooses to try again: the
  // answer they dismissed is remembered, so the NEXT answer shows afresh.
  const [dismissed, setDismissed] = useState<RateOrderState | null>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      if (typeof element.showModal === "function") element.showModal();
      else element.setAttribute("open", "");
    }
    if (!open && element.open) {
      if (typeof element.close === "function") element.close();
      else element.removeAttribute("open");
    }
  }, [open]);

  function close() {
    // Sent here, or already sent elsewhere: the page now shows the review's status.
    if (state.status === "sent" || state.status === "already") router.refresh();
    onClose();
  }

  const panel = pending ? "submitting" : state.status === "sent" ? "sent" : state.status === "already" ? "error" : (state.status === "failed" || state.status === "invalid") && state !== dismissed ? "error" : "form";

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) close();
      }}
      className="cq-sheet fixed inset-x-0 bottom-0 z-[70] m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-[22px] bg-[var(--background)] p-0 text-[var(--color-ink)] shadow-[0_-6px_12px_rgba(22,43,55,0.08)] backdrop:bg-[var(--color-backdrop)] backdrop:backdrop-blur-[20px] lg:inset-0 lg:m-auto lg:max-w-[440px] lg:rounded-[22px]"
    >
      <div className="flex max-h-[inherit] flex-col overflow-y-auto pb-[calc(32px+env(safe-area-inset-bottom))] pt-4">
        <span aria-hidden className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-[var(--color-brand-100)] lg:hidden" />

        {panel === "submitting" ? (
          <div role="status" className="flex flex-col items-center gap-4 px-6 py-2">
            <span className="grid size-20 place-items-center">
              <span className="block size-[58px] rotate-[150deg] bg-[var(--color-brand-500)] [mask-image:url(/brand/illus-processing.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] motion-safe:animate-spin" />
            </span>
            <p id={titleId} className="text-heading-m font-extrabold leading-[1.5]">
              {m.submitting}
            </p>
          </div>
        ) : panel === "sent" ? (
          <div role="status" className="flex flex-col items-center gap-4 px-6">
            <span aria-hidden className="grid size-14 place-items-center rounded-[18px] bg-[var(--color-success-subtlest)]">
              <Image src="/brand/icon-tick-circle.svg" alt="" width={32} height={32} unoptimized className="size-8" />
            </span>
            <div className="flex flex-col gap-2 text-center">
              <p id={titleId} className="text-heading-m font-bold leading-[1.4]">
                {m.sentTitle}
              </p>
              <p className="text-body-s leading-[1.5] text-[var(--color-ink-muted)]">{m.sentBody}</p>
            </div>
            {rewardPoints > 0 ? (
              <Reward points={rewardPoints}>
                <span className="text-caption font-semibold">{m.sentRewardBefore}</span>
                <Points points={rewardPoints} />
                <span className="text-caption font-semibold">{m.sentRewardAfter}</span>
              </Reward>
            ) : null}
            <button type="button" onClick={close} className={PRIMARY}>
              {m.done}
            </button>
          </div>
        ) : panel === "error" ? (
          <div role="alert" className="flex flex-col items-center px-6">
            <span aria-hidden className="mt-5 grid size-14 place-items-center rounded-[18px] bg-[var(--color-error-subtlest)]">
              <span className="block size-8 bg-[var(--color-error)] [mask-image:url(/brand/icon-info-filled.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
            </span>
            <p id={titleId} className="mt-4 text-center text-heading-l font-extrabold leading-[1.5]">
              {state.status === "already" ? m.alreadyTitle : m.errorTitle}
            </p>
            <p className="mt-2 text-center text-body-s leading-[1.5] text-[var(--color-ink-muted)]">{state.status === "already" ? m.alreadyBody : state.status === "invalid" ? m.invalidBody : m.errorBody}</p>
            <div className="mt-6 flex w-full gap-4">
              <button type="button" onClick={close} className={state.status === "already" ? PRIMARY : SECONDARY}>
                {m.close}
              </button>
              {/* A sent review is final: nothing to try again. */}
              {state.status === "already" ? null : (
                <button type="button" onClick={() => setDismissed(state)} className={`${PRIMARY} flex-1`}>
                  {m.retry}
                </button>
              )}
            </div>
          </div>
        ) : (
          <form action={formAction} className="flex flex-col gap-6 px-6">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="order_id" value={orderId} />

            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <h2 id={titleId} className="text-heading-l font-extrabold leading-[1.5]">
                  {title}
                </h2>
                <p className="text-caption leading-[1.5] text-[var(--color-ink-muted)] lg:text-body-s">{m.subtitle}</p>
              </div>
              <button type="button" onClick={close} aria-label={m.close} className="grid size-6 shrink-0 place-items-center">
                <span aria-hidden className="block size-4 bg-[var(--color-ink)] [mask-image:url(/brand/icon-close.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
              </button>
            </div>

            {product ? <ProductLine product={product} /> : null}

            {rewardPoints > 0 ? (
              <Reward points={rewardPoints}>
                <span className="text-caption font-semibold">{m.rewardBefore}</span>
                <Points points={rewardPoints} />
                <span className="text-caption font-semibold">{m.rewardAfter}</span>
              </Reward>
            ) : null}

            <fieldset className="flex flex-col items-center gap-3">
              <legend className="sr-only">{m.title}</legend>
              <div dir="ltr" className="flex items-center justify-center gap-4">
                {STARS.map((n) => (
                  <label key={n} className="relative grid size-8 cursor-pointer place-items-center">
                    <input
                      type="radio"
                      name="rating"
                      value={n}
                      required
                      checked={rating === n}
                      onChange={() => setRating(n)}
                      className="peer absolute inset-0 cursor-pointer opacity-0"
                      aria-label={m.starN.replace("{n}", String(n))}
                    />
                    <Image
                      src={n <= rating ? "/brand/icon-star-rate-filled.svg" : "/brand/icon-star-rate-empty.svg"}
                      alt=""
                      width={30}
                      height={29}
                      unoptimized
                      className="pointer-events-none h-[29px] w-[30px] transition-transform duration-(--cq-motion-fast) peer-focus-visible:scale-110 peer-active:scale-95"
                    />
                  </label>
                ))}
              </div>
              <p aria-live="polite" className={`text-center text-body-s font-bold ${rating > 0 ? "text-[var(--color-ink)]" : "text-[var(--color-ink-muted)]"}`}>
                {rating > 0 ? m[`star${rating as 1 | 2 | 3 | 4 | 5}`] : m.pickRating}
              </p>
            </fieldset>

            <div className="flex flex-col gap-3">
              <label htmlFor={`${titleId}-body`} className="flex items-center justify-between">
                <span className="text-body-s font-bold">{m.comment}</span>
                <span className="text-caption font-semibold text-[var(--color-ink-subtle)]">{m.optional}</span>
              </label>
              <textarea
                id={`${titleId}-body`}
                name="body"
                rows={1}
                maxLength={COMMENT_MAX}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={m.placeholder}
                className="field-sizing-content min-h-[50px] resize-none rounded-[16px] border border-[var(--color-border)] bg-[var(--background)] px-[17px] py-[13px] text-body-s leading-[1.7] text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-brand-500)] focus:outline-none"
              />
              <p className="text-caption-xs text-[var(--color-ink-muted)]">{m.remaining.replace("{n}", String(COMMENT_MAX - body.length))}</p>
              {/* Quick chips: a tap adds the words to the comment. */}
              <div className="flex flex-wrap gap-2">
                {m.chips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setBody((current) => appendChip(current, chip))}
                    className="rounded-full border border-[var(--color-border)] bg-[var(--background)] px-4 py-[9px] text-caption font-bold leading-[18px] text-[var(--color-ink)] transition active:scale-[0.98]"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-4">
              <button type="button" onClick={close} className={SECONDARY}>
                {m.close}
              </button>
              <button type="submit" disabled={rating === 0} className={`${PRIMARY} flex-1 disabled:bg-[var(--color-button-disabled)] disabled:text-[var(--color-ink-muted)]`}>
                {m.submit}
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}

const PRIMARY =
  "flex h-[54px] w-full items-center justify-center rounded-[12px] bg-[var(--color-primary)] px-6 text-body-m font-extrabold text-[var(--color-on-primary)] transition hover:bg-[var(--color-primary-hover)] active:scale-[0.99]";
const SECONDARY =
  "flex h-[54px] shrink-0 items-center justify-center rounded-[12px] border border-[var(--color-border-strong)] px-6 text-body-s font-semibold text-[var(--color-ink-muted)] transition active:scale-[0.99]";

/** «سوف تحصل على +1 ⓒ عند الموافقة على التقييم» — the brand-tinted box. */
function Reward({ children }: { points: number; children: ReactNode }) {
  return (
    <p className="flex w-full flex-wrap items-center justify-center gap-2 rounded-[8px] border border-[var(--color-brand-500)] bg-[var(--color-brand-50)] p-3 text-[var(--color-ink)]">
      {children}
    </p>
  );
}

function Points({ points }: { points: number }) {
  return (
    <span className="flex items-center gap-1">
      <bdi dir="ltr" className="text-heading-m font-medium leading-[1.4] text-[var(--color-brand-500)]">
        +{points}
      </bdi>
      <Image src={CURRENCY_ICON} alt="" width={16} height={16} unoptimized className="size-4 object-contain" />
    </span>
  );
}

/** The reminder's product: price and ×qty, name and tier, the 55px artwork. */
function ProductLine({ product }: { product: RatedProduct }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`relative block size-[55px] shrink-0 overflow-hidden rounded-[12px] ${product.imageUrl ? "" : "bg-[var(--color-brand-500)]"}`}>
        {product.imageUrl ? <Image src={product.imageUrl} alt={product.imageAlt} fill sizes="55px" className="object-cover" /> : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="text-body-s font-bold leading-[1.5]">{product.name}</span>
        {product.tier ? <span className="text-caption text-[var(--color-ink-subtle)]">{product.tier}</span> : null}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {product.price ? (
          <span dir="ltr" className="text-body-s font-bold tabular-nums">
            {product.price}
          </span>
        ) : null}
        <span dir="ltr" className="rounded-[12px] bg-[var(--color-bg-subtle)] px-[9px] text-caption font-semibold leading-5 text-[var(--color-ink-subtle)]">
          × {product.quantity}
        </span>
      </span>
    </div>
  );
}

/** A chip's words added to the comment once, on a new clause, within the limit. */
export function appendChip(current: string, chip: string): string {
  const trimmed = current.trim();
  if (trimmed.split(/[،,\n]\s*/).includes(chip)) return current;
  const next = trimmed === "" ? chip : `${trimmed}، ${chip}`;
  return next.length > COMMENT_MAX ? current : next;
}
