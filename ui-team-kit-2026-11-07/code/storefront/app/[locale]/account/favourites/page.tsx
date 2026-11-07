import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";

import { AccountShell } from "@/components/account/AccountShell";
import { notFound, redirect } from "next/navigation";

import { ProductCard } from "@/components/catalog/ProductCard";
import { requireCustomer } from "@/lib/account/guard";
import { withProductArtwork } from "@/lib/catalog/product-artwork";
import { listCategories } from "@/lib/catalog/queries";
import { currencyForVisitor } from "@/lib/currency/visitor";
import { removeFavouriteAction } from "@/lib/favourites/actions";
import { favouritesPage, favouritesPager, pastTheEnd } from "@/lib/favourites/pagination";
import { listFavouriteProducts } from "@/lib/favourites/queries";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { SubmitButton } from "@/components/ui/SubmitButton";

/**
 * The customer's wishlist — Figma `5713:11294` ("Favorites - Desktop"), whose
 * two frames are the populated grid (`4317:22019`) and the empty state
 * (`4317:21708`).
 *
 * `requireCustomer` proves the session BEFORE anything renders. `GET /me/favourites`
 * answers 401 to a guest, so a page that rendered its heading first and asked
 * afterwards would show a customer their wishlist furniture and then an error —
 * the failure the guard exists to prevent.
 *
 * WHAT THE COMP DRAWS THAT IS NOT HERE:
 *
 *   - THREE FILTER CHIPS ("كروت الهدايا" / "البرامج" / "الالعاب") and the
 *     per-category section headings under them. `listFavourites` takes `page`,
 *     `per_page` and `currency` and nothing else — there is no category filter to
 *     wire a chip to. Grouping the flat response by `category_public_id` would be
 *     worse than useless: `Product` carries the id and no category NAME, so the
 *     headings would be numbers, and regrouping would destroy the one ordering
 *     guarantee the contract makes ("most recently favourited first"). The
 *     chips are the designer's sample taxonomy, not a feature the API serves.
 *   - "منتجات نالت اعجاب الكثير من عملائنا" — a recommendations row. There is no
 *     recommendations endpoint in the contract at all.
 *   - "أضف للسلة" on every tile. There is no cart in v1 (HANDBOOK §5) and no
 *     cart endpoint; the tile links to the product page, where the customer
 *     picks a denomination and checks out, which is the real path.
 *   - The "وفر ٥٪" saving badge and the struck-through price — the tile shows no
 *     price at all (owner, 2026-10-09; see `ProductCard`); the tier and its
 *     price are chosen on the product page.
 *
 * THE COMP DRAWS NO PAGINATION and `meta` supports it, so none is invented here.
 * The list is asked for at the contract's maximum `per_page` instead, and a
 * customer with more favourites than that is TOLD so rather than shown a
 * silently truncated grid — "you have 100 of 137 favourites" is a fact;
 * a grid that stops at 100 with nothing said is a lie of omission.
 */
export default async function FavouritesPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  // Per request, always: this page is somebody's account.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const m = messagesFor(locale);
  const { token } = await requireCustomer(locale, `/${locale}/account/favourites`);

  // The customer's browsing currency, resolved exactly as every catalogue page
  // resolves it. Omitting it answers in USD.
  const currency = await currencyForVisitor();

  // NOT `.catch(() => [])`. `GET /me/favourites` answers 422 for an unsupported
  // currency and 503 when no FX rate is usable right now, and neither of those
  // means "you have not saved anything". Collapsing them into the empty state
  // would tell a customer their wishlist was wiped; they are held apart here for
  // the same reason the account page holds "no orders" apart from "we could not
  // read your orders".
  const page = favouritesPage((await props.searchParams).page);
  // The category tree beside it (a shared read): a favourite without its own
  // picture wears its category's art, as on its page (`withProductArtwork`).
  const [list, categories] = await Promise.all([
    listFavouriteProducts({ locale, currency, bearerToken: token, page }).catch(() => null),
    listCategories({ locale }).catch(() => []),
  ]);
  const base = `/${locale}/account/favourites`;
  const pager = list ? favouritesPager(base, page, list.meta) : null;

  // A page past the end (favourites removed since the link was made) is not
  // "your favourites are empty": back to the last page that has some.
  const overrun = list ? pastTheEnd(base, page, list) : null;
  if (overrun) redirect(overrun);

  return (
    // Inside the account frame, as the comps put every section (`4317:16178`).
    <AccountShell locale={locale} active="favourites">
      <section className="lg:rounded-[16px] lg:bg-[var(--color-surface-raised)] lg:p-6 lg:shadow-[0_0_12px_rgba(0,0,0,0.07)]">
      <h2 className="text-heading-l font-bold text-[var(--color-ink)]">
        {m.favourites.title}
      </h2>

      {list === null ? (
        <p className="mt-6 rounded-[16px] bg-[var(--color-field)] p-5 text-body-s text-[var(--color-ink-subtle)] lg:text-body-l">
          {m.account.sectionUnavailable}
        </p>
      ) : list.products.length === 0 ? (
        <EmptyState locale={locale} />
      ) : (
        <>
          <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {list.products.map((product) => (
              <li key={product.slug}>
                <ProductCard
                  locale={locale}
                  product={withProductArtwork(product, categories)}
                  overlay={
                    // Removed by PUBLIC id (ADR 0037); a product that arrives
                    // without one has no heart to press.
                    product.public_id ? (
                      <RemoveButton locale={locale} productPublicId={product.public_id} label={m.favourites.remove} />
                    ) : null
                  }
                />
              </li>
            ))}
          </ul>

          {/* Previous/next from the server's own `meta` — every favourite is
              reachable, 100 to a page. */}
          {pager ? (
            <nav aria-label={m.favourites.pages} className="mt-6 flex items-center justify-between text-body-s lg:text-body-l">
              {pager.previous ? (
                <Link href={pager.previous} className="font-bold text-[var(--color-brand-500)] hover:underline">
                  {m.favourites.previous}
                </Link>
              ) : (
                <span />
              )}
              <span className="text-[var(--color-ink-subtle)]">
                {m.favourites.pageOf
                  .replace("{page}", formatCount(locale, pager.page))
                  .replace("{pages}", formatCount(locale, pager.pages))}
              </span>
              {pager.next ? (
                <Link href={pager.next} className="font-bold text-[var(--color-brand-500)] hover:underline">
                  {m.favourites.next}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
      </section>
    </AccountShell>
  );
}

/**
 * The heart on each tile — the comp's "Heart Icon Active" (`5713:10999`).
 *
 * A FORM, NOT A LINK. Removing a favourite changes state, and a GET that
 * changes state is something a link prefetcher, or an `<img>` on somebody else's
 * page, can fire on the customer's behalf. Same reasoning as the account page's
 * sign-out control.
 *
 * NO CONFIRMATION DIALOG, unlike the saved cards the account page leaves
 * read-only: un-favouriting is a one-tap undo (favourite it again from the
 * product page), so a confirm step would cost every customer a tap to protect
 * against a mistake that costs nothing to reverse.
 */
function RemoveButton({
  locale,
  productPublicId,
  label,
}: {
  locale: Locale;
  productPublicId: string;
  label: string;
}) {
  return (
    <form action={removeFavouriteAction}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="product_public_id" value={productPublicId} />
      <SubmitButton
        // The comp draws the heart directly on the artwork, which is a
        // photograph the store uploads and therefore any colour at all. The
        // scrim behind it is what keeps a white glyph legible on a pale image.
        className="flex size-8 items-center justify-center rounded-full bg-black/40 transition hover:bg-black/60"
        // The icon carries no text, so the accessible name has to come from
        // somewhere — this is the whole label a screen reader announces.
        aria-label={label}
        title={label}
      >
        <Image
          src="/brand/icon-favourite-filled.svg"
          alt=""
          aria-hidden
          width={24}
          height={24}
          className="size-[18px]"
        />
      </SubmitButton>
    </form>
  );
}

/**
 * The comp's own empty state (`4317:21708`) — heading, one line, and a way out.
 *
 * A blank grid is not an answer, and neither is this state being reused for a
 * failure: it says "you have not added anything", which is a claim about the
 * customer's data and must only be made when the API actually returned none.
 */
function EmptyState({ locale }: { locale: Locale }) {
  const m = messagesFor(locale);

  return (
    // Text FIRST in the DOM, illustration second, and the row is a plain
    // `flex-row` — so the copy sits at the start edge and the artwork at the end
    // edge, which is the comp's arrangement on the Arabic page and its mirror on
    // the English one. Getting there with `flex-row-reverse` would have been a
    // direction conditional in disguise; `flex-col-reverse` on narrow screens is
    // a stacking order, not a direction, and puts the illustration on top.
    <div className="mt-10 flex flex-col-reverse items-center justify-center gap-8 py-10 sm:flex-row sm:gap-12">
      <div className="flex flex-col items-center gap-4 text-center sm:items-start sm:text-start">
        <h2 className="text-heading-l font-bold text-[var(--color-ink)] lg:text-display">
          {m.favourites.emptyTitle}
        </h2>
        <p className="max-w-[280px] text-body-l font-medium text-[var(--color-ink-subtle)] lg:text-heading-m">
          {m.favourites.emptyBody}
        </p>
        <Link
          href={`/${locale}`}
          className="rounded-[10px] bg-[var(--color-brand-500)] px-8 py-3 text-body-l font-semibold text-[var(--color-on-primary)] transition hover:bg-[var(--color-brand-700)]"
        >
          {m.favourites.emptyCta}
        </Link>
      </div>
      <Image
        src="/brand/illus-favourites-empty.svg"
        alt=""
        aria-hidden
        width={244}
        height={262}
        className="w-[180px] max-w-full sm:w-[244px]"
      />
    </div>
  );
}

/**
 * A count, from the platform. It formats a number the server sent (or an array's
 * own length) and computes nothing.
 *
 * `Intl` rather than `String(n)`, and with the same locale tag `formatMoney`
 * uses, so a count and a price on one page always agree about digits. `ar-AE`
 * resolves to Western digits today; `String()` would match that by coincidence
 * and stop matching the moment that locale tag is revisited.
 */
function formatCount(locale: Locale, value: number): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-AE" : "en-AE").format(value);
}
