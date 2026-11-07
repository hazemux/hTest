import Image from "next/image";

import { IntentLink } from "@/components/ui/IntentLink";

export type SectorMenuItem = {
  slug: string;
  name: string;
  href: string;
  icon: { url: string; alt: string } | null;
  current: boolean;
};

/**
 * The sectors of a gift-card section as an icon menu (owner, 2026-10-08:
 * «like Daleel store») — on the section's page and on each sector's page, so
 * a customer moves between «التسوق» and «الطعام والمطاعم» in one tap.
 *
 * A row the phone scrolls sideways (never the page — `overflow-x-auto` on
 * the list alone, padded to the gutter), wrapping on desktop. Each item is a
 * 64px icon plate (80 from `lg`) with the name under it, two lines at most;
 * the sector being viewed is marked with the brand ring and `aria-current`.
 */
export function SectorMenu({ items, label }: { items: SectorMenuItem[]; label: string }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label={label} className="mt-5 lg:mt-6">
      <ul className="-mx-6 flex gap-3 overflow-x-auto px-6 pb-2 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:gap-4 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <li key={item.slug} className="w-[76px] shrink-0 lg:w-[96px]">
            <IntentLink
              href={item.href}
              aria-current={item.current ? "page" : undefined}
              className="group flex flex-col items-center gap-2 transition-transform duration-(--cq-motion-fast) ease-(--cq-ease-out) active:scale-[0.97]"
            >
              <span
                className={`relative block size-16 overflow-hidden rounded-[18px] bg-[var(--color-brand-50)] transition group-hover:brightness-95 lg:size-20 ${
                  item.current ? "ring-2 ring-[var(--color-brand-500)] ring-offset-2 ring-offset-[var(--color-surface)]" : ""
                }`}
              >
                {item.icon ? (
                  <Image src={item.icon.url} alt="" fill sizes="80px" className="object-contain p-1.5" />
                ) : null}
              </span>
              <span
                className={`line-clamp-2 text-center text-caption leading-[1.4] lg:text-body-s ${
                  item.current ? "font-bold text-[var(--color-brand-500)]" : "font-medium text-[var(--color-ink)]"
                }`}
              >
                {item.name}
              </span>
            </IntentLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
