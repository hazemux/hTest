import type { Metadata } from "next";

import { pageMetadata } from "@/lib/seo/metadata";
import { notFound } from "next/navigation";

import { ContentArticle } from "@/components/content/ContentArticle";
import { SHELL_PARAM } from "@/lib/catalog/shell";
import { contentPage } from "@/lib/content/pages";
import { isLocale } from "@/lib/i18n/locales";

/**
 * `/{locale}/{slug}` — a CMS page, when one is published under that slug.
 *
 * This is the locale's catch-all, so it is also where every path nothing
 * else claims ends up. The rule that keeps the two apart: a content page
 * has exactly ONE segment (the footer's `page` menu items link to
 * `/{locale}/{target}`, see lib/catalog/menu-href.ts). Two or more
 * segments were never a page and go straight to 404 without a request.
 */
type Props = { params: Promise<{ locale: string; rest: string[] }> };

/**
 * F3: one param, or Cache Components fails the build for this route. Never a
 * real page — it answers 404 before reading anything — so the build needs no
 * API. Every redirect and 404 here follows from the path alone (ADR 0046).
 */
export async function generateStaticParams() {
  return [{ rest: [SHELL_PARAM] }];
}

async function resolve(props: Props) {
  const { locale, rest } = await props.params;
  const [slug] = rest;
  if (!isLocale(locale) || rest.length !== 1 || !slug || slug === SHELL_PARAM) return null;

  const page = await contentPage(slug, locale);
  return page ? { locale, page } : null;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const resolved = await resolve(props);
  if (!resolved) return {};

  return pageMetadata({
    locale: resolved.locale,
    path: `/${encodeURIComponent(resolved.page.slug)}`,
    title: resolved.page.seoTitle,
    description: resolved.page.seoDescription,
  });
}

export default async function ContentPageRoute(props: Props) {
  const resolved = await resolve(props);
  if (!resolved) notFound();

  return (
    <main className="mx-auto w-full max-w-[1248px] flex-1 px-6 pb-12 pt-6 lg:pt-[70px]">
      <ContentArticle page={resolved.page} locale={resolved.locale} />
    </main>
  );
}
