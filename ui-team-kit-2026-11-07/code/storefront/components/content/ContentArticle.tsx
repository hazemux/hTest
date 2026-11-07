import Link from "next/link";

import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { formatStoreDateTime } from "@/lib/i18n/time";
import type { ContentPage } from "@/lib/content/pages";
import { pageSections } from "@/lib/content/sections";

/**
 * A CMS page (terms, privacy, about…) — «Content Page Mobile» (Claude
 * Design, 2026-09-30), one template for every page: a large title with the
 * date the page took effect (legal pages), the summary staff wrote in a blue
 * box so the key points come first (v0.1.64), numbered chips that jump to
 * each section — built from the page's own `<h2>` headings — then the body,
 * readable long-form, a «لديك سؤال؟» card to Contact, and back to the top.
 *
 * The body is HTML the API has already sanitised (contract v0.1.12) — this is
 * the one place the storefront renders markup it did not write, and the
 * reason it renders nothing that was not sanitised upstream. Giving each
 * heading an id is the only change made to it here.
 */
export function ContentArticle({ page, locale }: { page: ContentPage; locale: Locale }) {
  const m = messagesFor(locale);
  const effective = page.template === "legal" && page.effectiveFrom ? formatStoreDateTime(locale, page.effectiveFrom, { dateStyle: "long" }) : null;
  const { html, sections, numberedByPage } = pageSections(page.body);

  return (
    <article id="top" className="mx-auto flex w-full max-w-3xl scroll-mt-4 flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-display font-bold lg:text-[32px] leading-[1.3] text-[var(--color-ink)]">{page.title}</h1>
        {effective ? <p className="text-caption text-[var(--color-ink-subtle)] lg:text-body-s">{m.pages.effectiveFrom.replace("{date}", effective)}</p> : null}
      </header>

      {page.summary ? (
        <p className="whitespace-pre-line rounded-[14px] bg-[var(--color-primary-wash-lighter)] px-4 py-3.5 text-body-s leading-[1.75] text-[var(--color-ink)] lg:text-body-l">
          {page.summary}
        </p>
      ) : null}

      {sections.length > 0 ? (
        <nav aria-label={m.pages.sections} className="-mx-6 flex gap-2 overflow-x-auto px-6 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0">
          {sections.map((section, index) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-caption font-bold text-[var(--color-ink)] shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-[var(--color-chip)]"
            >
              <span dir="ltr" className="text-[var(--color-brand-500)]">
                {index + 1}
              </span>
              {section.title}
            </a>
          ))}
        </nav>
      ) : null}

      <div className={`cq-prose cq-article ${sections.length > 0 && !numberedByPage ? "cq-article-numbered" : ""}`} dangerouslySetInnerHTML={{ __html: html }} />

      <div className="mt-2 flex items-center gap-3 rounded-[16px] bg-[var(--color-chip)] p-4">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-body-s font-bold text-[var(--color-ink)] lg:text-body-l">{m.pages.questionTitle}</span>
          <span className="text-caption text-[var(--color-ink-muted)] lg:text-body-s">{m.pages.questionLead}</span>
        </span>
        <Link
          href={`/${locale}/contact-us`}
          className="flex h-10 shrink-0 items-center rounded-[10px] bg-[var(--color-brand-500)] px-3.5 text-body-s font-bold text-[var(--color-on-cta)] hover:bg-[var(--color-primary-hover)]"
        >
          {m.pages.contactUs}
        </Link>
      </div>
      <a href="#top" className="self-center text-caption font-bold text-[var(--color-brand-500)]">
        {m.pages.backToTop} ↑
      </a>
    </article>
  );
}
