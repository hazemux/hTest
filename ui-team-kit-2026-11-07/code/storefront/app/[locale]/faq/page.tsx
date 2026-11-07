import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FaqList } from "@/components/content/FaqList";
import { JsonLd } from "@/components/seo/JsonLd";
import { faqEntries } from "@/lib/content/pages";
import { isLocale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { faqPageNode, graph } from "@/lib/seo/schema";
import { pageMetadata } from "@/lib/seo/metadata";
import { absoluteUrl } from "@/lib/seo/site";

/**
 * The FAQ — «FAQ Mobile» (Claude Design, 2026-09-30): a big heading, a
 * search that filters as the customer types, every active question as a
 * native `<details>` (`FaqList`), and «لم تجد إجابتك؟» leading to Contact.
 * The rows come from the admin (CC4); an empty list says so rather than
 * rendering a heading over nothing.
 */
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  if (!isLocale(locale)) return {};

  const m = messagesFor(locale);
  return pageMetadata({ locale, path: "/faq", title: m.faq.title, description: m.seo.faqDescription });
}

export default async function FaqPage(props: Props) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const m = messagesFor(locale);
  const entries = await faqEntries(locale);
  // The same rows the list renders, so the markup says what the page says.
  const faq = faqPageNode(absoluteUrl(`/${locale}/faq`), entries);

  return (
    <main className="mx-auto w-full max-w-[1248px] flex-1 px-6 pb-12 pt-6 lg:pt-[70px]">
      {faq ? <JsonLd data={graph([faq])} /> : null}
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <header className="flex flex-col gap-1.5">
          <p className="text-body-s font-bold text-[var(--color-brand-500)]">{m.faq.title}</p>
          <h1 className="text-display font-bold lg:text-[32px] leading-[1.3] text-[var(--color-ink)]">{m.faq.heading}</h1>
          <p className="text-body-s leading-[1.6] text-[var(--color-ink-muted)] lg:text-body-l">{m.faq.intro}</p>
        </header>

        {entries.length === 0 ? (
          <p className="rounded-[14px] bg-[var(--color-chip)] p-6 text-center text-body-s text-[var(--color-ink-muted)] lg:text-body-l">{m.faq.empty}</p>
        ) : (
          <FaqList entries={entries} labels={{ search: m.faq.search, noMatch: m.faq.noMatch }} />
        )}

        {/* «لم تجد إجابتك؟» — the way on when the list did not answer. */}
        <div className="flex flex-col gap-2.5 rounded-[16px] bg-[var(--color-primary-wash-lighter)] p-4">
          <p className="text-body-m font-bold text-[var(--color-ink)] lg:text-heading-m">{m.faq.stillTitle}</p>
          <p className="text-caption leading-[1.6] text-[var(--color-ink-muted)] lg:text-body-s">{m.faq.stillLead}</p>
          <Link
            href={`/${locale}/contact-us`}
            className="flex h-[46px] items-center justify-center rounded-[12px] bg-[var(--color-brand-500)] text-body-s font-bold text-[var(--color-on-cta)] hover:bg-[var(--color-primary-hover)] lg:w-fit lg:px-8"
          >
            {m.faq.contact}
          </Link>
        </div>
      </section>
    </main>
  );
}
