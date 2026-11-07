import { notFound } from "next/navigation";
import { connection } from "next/server";

import { TileSection, type Tile } from "@/components/home/TileSection";
import { SearchPageHeader } from "@/components/search/SearchPageHeader";
import { reportBrowsing } from "@/lib/analytics/server-events";
import { listPopularSearch, searchCatalog } from "@/lib/api/client";
import { OPTIONAL_DEADLINE_MS } from "@/lib/api/deadlines";
import { joinKey } from "@/lib/api/public-id";
import { listCategories } from "@/lib/catalog/queries";
import { CATALOG_TAG } from "@/lib/catalog/tags";
import { isLocale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { toTiles } from "@/lib/search/rows";
import type { SearchTileView } from "@/lib/search/types";

/**
 * Search results — the destination the header's search box has always posted
 * to, and which did not exist until now.
 *
 * IT FINDS THE GAME, NOT THE PACKAGE. The owner's rule (Q31, ADR 0019) is
 * App-Store-style search: typing "pubg" should land on PUBG, the way tapping
 * it in a trending row would, not on a list of nine denominations of UC. So
 * the CATEGORY results are what this page renders, and it renders them with
 * the same `TileSection` the home page uses — icon and name, in a grid — so
 * that finding a game by typing and finding it by browsing arrive at the same
 * looking thing.
 *
 * `GET /search` also answers `products`, and they are deliberately NOT drawn.
 * Every product this store sells hangs off a category the customer would
 * rather land on, and a second grid of "660 UC" beneath the PUBG tile would be
 * the product search Q31 rules out. The field stays in the response for a
 * future screen to use; nothing here pretends it is not there.
 *
 * LINKS RUN THROUGH THE TREE, exactly as the home rows do — a match with one
 * child skips the page that would offer that single choice
 * (`collapseSingleChild`), and every href carries the full ancestor chain so
 * the header can tell which tab is lit. That is why this page fetches the
 * category list as well as the results: the search response knows a match's
 * `parent_public_id` but not its ancestors' slugs, and a bare slug is not a URL here.
 *
 * AN EMPTY QUERY IS NOT A SEARCH. Arriving with no `q` renders the prompt
 * rather than "no results found", because the customer has not asked anything
 * yet and telling them they found nothing is telling them something false.
 */
export default async function SearchPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  // Per request: the search text is in the URL.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const m = messagesFor(locale);
  const query = ((await props.searchParams).q ?? "").trim();

  if (query === "") {
    return (
      <main className="mx-auto w-full max-w-[1248px] flex-1 px-6 pb-12 pt-0 lg:pt-[70px]">
        {/* The site header is hidden on the phone for every /search path, so
            this page draws its own — back, and a bar that opens the search. */}
        <SearchPageHeader locale={locale} query="" />
        <h1 className="mb-2 mt-4 text-heading-l font-bold text-[var(--color-ink)] lg:mt-0">{m.search.title}</h1>
        <p className="text-body-s text-[var(--color-ink-muted)] lg:text-body-l">{m.search.prompt}</p>
      </main>
    );
  }

  // The results and the tree they are linked through, together. The tree is
  // for links only: if it cannot be read, each tile links by its own path
  // (an empty tree) rather than the page throwing away results it has.
  const [results, categories] = await Promise.all([
    searchCatalog({ q: query, locale }, { locale }).catch(() => null),
    listCategories({ locale }).catch(() => []),
  ]);

  // A SEARCH THAT FAILED IS NOT A SEARCH THAT FOUND NOTHING. If the API is
  // briefly unreachable the customer is told the search could not run, never
  // that their game does not exist — the same distinction the account page
  // draws between "no orders" and "we could not read your orders".
  if (results === null) {
    return (
      <main className="mx-auto w-full max-w-[1248px] flex-1 px-6 pb-12 pt-0 lg:pt-[70px]">
        <SearchPageHeader locale={locale} query={query} />
        <h1 className="mb-2 mt-4 text-heading-l font-bold text-[var(--color-ink)] lg:mt-0">{m.search.title}</h1>
        <p className="text-body-s text-[var(--color-ink-muted)] lg:text-body-l">{m.search.unavailable}</p>
      </main>
    );
  }

  // The ad platforms' «search», from this server (contract v0.1.150): what
  // was asked, and the first products it found — a search that found nothing
  // still counts. Only a real query; the prompt page is not a search.
  if (query !== "") {
    const found = (results.products ?? [])
      .map((product) => joinKey(product.public_id))
      .filter((id): id is string => id !== null)
      .slice(0, 5)
      .map((productPublicId) => ({ productPublicId, packPublicId: null }));
    await reportBrowsing("search", found, locale, { searchString: query });
  }

  const tiles: Tile[] = toTiles(results.categories ?? [], categories, locale).map(tileOf);

  // The most-bought — what a search that found nothing shows instead of a
  // blank (ADR 0027) — asked for ONLY then, never in front of results. Cached
  // like the popular panel's own route, and a nicety: slow or failed, the
  // page simply has none.
  const popular =
    tiles.length === 0
      ? await listPopularSearch({
          locale,
          next: { revalidate: 300, tags: [CATALOG_TAG] },
          deadlineMs: OPTIONAL_DEADLINE_MS,
        }).catch(() => ({ categories: [] }))
      : { categories: [] };
  const popularTiles: Tile[] = toTiles(popular.categories ?? [], categories, locale).map(tileOf);

  return (
    <main className="mx-auto w-full max-w-[1248px] flex-1 px-6 pb-12 pt-0 lg:pt-[70px]">
      <SearchPageHeader locale={locale} query={query} />
      <h1 className="mb-1 text-heading-l font-bold text-[var(--color-ink)] max-lg:hidden">{m.search.title}</h1>

      {/* The keyboard-layout correction, said out loud: «نتائج البحث عن pubg». */}
      {results.searched_as ? (
        <p className="mb-3 mt-2 text-body-s leading-[1.5] text-[var(--color-ink-muted)] lg:text-body-l">
          {m.search.showing}{" "}
          <span dir="ltr" className="font-bold text-[var(--color-ink)]">{results.searched_as}</span>
        </p>
      ) : (
        <p dir="auto" className="mb-4 mt-2 text-body-l text-[var(--color-ink-muted)] max-lg:hidden">
          {m.search.resultsFor} “{query}”
        </p>
      )}

      {tiles.length === 0 ? (
        <>
          <div className="flex flex-col gap-0.5 pt-2">
            <p className="text-body-l font-bold leading-[1.5] lg:text-heading-m">
              {m.search.noResultsBefore}
              <bdi>{query}</bdi>
              {m.search.noResultsAfter}
            </p>
            <p className="text-body-s leading-[1.5] text-[var(--color-ink-muted)] lg:text-body-l">{m.search.tryOther}</p>
          </div>
          {popularTiles.length > 0 ? (
            <>
              <h2 className="mb-3 mt-5 text-body-s font-bold text-[var(--color-ink)] lg:text-heading-l">{m.search.popular}</h2>
              <div className="-mx-6">
                <TileSection locale={locale} title="" href="" tiles={popularTiles} hideHeader spacing="mt-0" />
              </div>
            </>
          ) : null}
        </>
      ) : (
        /* `href=""` on the section heading's own link: this row has no "view
           all" destination — it IS all of them. `TileSection` draws the chip
           unconditionally, so the heading is rendered here instead and the
           grid is handed over without one. */
        <div className="-mx-6">
          <TileSection locale={locale} title="" href="" tiles={tiles} hideHeader spacing="mt-0" />
        </div>
      )}
    </main>
  );
}

/** The panel's tile shape → the home grid's. */
function tileOf(tile: SearchTileView): Tile {
  return { slug: tile.id, name: tile.name, href: tile.href, image: tile.icon };
}
