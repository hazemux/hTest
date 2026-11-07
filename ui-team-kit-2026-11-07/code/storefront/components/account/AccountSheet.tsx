import Link from "next/link";

/**
 * The account comps' bottom popup (`6847:89940`, `6847:90062`): the page
 * behind blurred (20px) under the grey backdrop, and a white sheet with 12px
 * top corners and 24px padding holding, 16 apart, the 96px illustration tile,
 * the title (Bold 16) over its line (SemiBold 14), and the buttons.
 *
 * THE TILE IS THE COMP'S OWN: a grey square around an image glyph — the
 * artwork slot the design leaves for an illustration. Drawn as drawn until
 * artwork exists (reported to the owner).
 *
 * Closing is a link (`closeHref`) where the sheet is a URL state, or a button
 * (`onClose`) where a client component owns it.
 */
export function AccountSheet({
  closeHref,
  onClose,
  closeLabel,
  labelledBy,
  title,
  lead,
  tone,
  children,
}: {
  closeHref?: string;
  onClose?: () => void;
  closeLabel: string;
  labelledBy: string;
  title: string;
  lead: string;
  tone: "error" | "ink";
  children: React.ReactNode;
}) {
  const backdrop = "absolute inset-0 bg-[var(--color-backdrop)] backdrop-blur-[20px]";

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center lg:items-center">
      {closeHref ? (
        <Link href={closeHref} scroll={false} aria-label={closeLabel} className={backdrop} />
      ) : (
        <button type="button" onClick={onClose} aria-label={closeLabel} className={backdrop} />
      )}
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="relative flex w-full max-w-[480px] flex-col items-center gap-4 rounded-t-[12px] bg-[var(--color-surface)] p-6 lg:rounded-[12px]"
      >
        <span className="grid size-24 place-items-center rounded-[9px] bg-[var(--color-surface-subtle)]">
          <span aria-hidden className="block size-[60px] bg-[var(--color-ink-subtle)] [mask-image:url(/brand/icon-sheet-image.svg)] [mask-size:contain]" />
        </span>
        <div className="flex w-full flex-col gap-1 text-center leading-[1.5]">
          <h2
            id={labelledBy}
            className={`text-body-l font-bold ${tone === "error" ? "text-[var(--color-error)]" : "text-[var(--color-ink)]"}`}
          >
            {title}
          </h2>
          <p className="text-body-s font-semibold text-[var(--color-ink)]">{lead}</p>
        </div>
        {/* Equal columns, however much padding each button carries. */}
        <div className="grid w-full auto-cols-fr grid-flow-col items-center gap-4">{children}</div>
      </section>
    </div>
  );
}
