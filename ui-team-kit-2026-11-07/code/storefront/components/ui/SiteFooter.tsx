import Image from "next/image";

import { PrivacySettingsLink } from "@/components/analytics/PrivacySettingsLink";
import { IntentLink } from "@/components/ui/IntentLink";
import { listMenus } from "@/lib/api/client";
import { CATALOG_REVALIDATE_SECONDS } from "@/lib/catalog/tags";
import { isExternal, menuHref } from "@/lib/catalog/menu-href";
import { categoryLanding } from "@/lib/catalog/queries";
import { groupLinks, type GroupBrand } from "@/lib/content/store-links";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { storeSettings } from "@/lib/content/settings";
import { copyrightYear } from "@/lib/content/copyright-year";

type MenuItem = {
  label: Record<string, string>;
  type: string;
  target: string;
};

/**
 * Footer, built to the dark comps — desktop 7194:46670, phone 7200:32747 —
 * which every home comp, light and dark, places (the old light-only node
 * 6659:20058 no longer exists in the file).
 *
 * THE LINK COLUMNS ARE MENUS, NOT LITERALS. `GET /content/menus` returns four
 * fixed menus and the header uses exactly one of them; the other three —
 * `footer_shop`, `footer_support`, `footer_legal` — are these columns. The comp
 * draws thirteen links (terms, privacy, refunds, AML, careers, blog…), and
 * transcribing them would hardcode a route to a legal page that may not exist
 * and cannot be corrected without a deploy. Same argument the header already
 * makes: the design supplies the shape, the admin supplies the contents, and an
 * empty menu renders no column.
 *
 * SOCIAL AND CONTACT COME FROM `GET /content/settings`, and each icon appears
 * only when its setting is a non-empty string. An Instagram button that opens
 * `instagram.com/chargerquick` because this file guessed the handle is worse
 * than no button: it is a link to an account that may belong to someone else.
 *
 * ALL FIVE NETWORKS THE COMP DRAWS HAVE A SETTING: Instagram and X since
 * v0.1.13, Facebook, Snapchat and TikTok since v0.1.35. Each icon lights up
 * the moment staff fill its link on the dashboard's General settings.
 *
 * «جزء من» — THE GROUP'S LOGOS — ARE ALWAYS DRAWN, AND LINK ONLY WHEN TOLD TO
 * (owner, 2026-10-07): ChargerQuick's store and company marks and JoyGames,
 * the phone comp's artwork (7200:31797). Each is a link only when its
 * `general.group_*_url` setting (v0.1.100) is an https address, opening in a
 * new tab without a Referer — this footer is on the order pages too.
 *
 * THE SECOND `listMenus` CALL IS FREE, AND THAT WAS MEASURED, NOT ASSUMED.
 * The header already fetches menus; calling again here with the identical URL
 * and options lets Next's per-render request memoisation serve both from one
 * round-trip. Counted against a stub API on a cold render of `/ar`:
 * `/content/menus` was hit exactly ONCE. Change the URL or the `next` options
 * on either side and that silently becomes two — which is why both call sites
 * spell the revalidate window and the `menu` tag the same way.
 */
export async function SiteFooter({ locale }: { locale: Locale }) {
  const m = messagesFor(locale);

  const [menus, settings, landing] = await Promise.all([
    listMenus({
      locale,
      next: { revalidate: CATALOG_REVALIDATE_SECONDS, tags: ["menu"] },
    }).catch(() => null),
    storeSettings(locale).catch(() => null),
    // Where a category row lands — never its short path's redirect (`lib/catalog/landing.ts`).
    categoryLanding(locale),
  ]);

  // A footer is not worth a 500 on every page of the site. If either read
  // fails the plate still renders with the logo and the description.
  /*
   * THE HANDLE TRAVELS WITH THE ITEMS, because the comp gives every group a
   * TITLE and the menus endpoint returns only the links. The title cannot come
   * from the API, so it is looked up per handle in the dictionary — which also
   * keeps it translated, where a name typed into the admin once would not be.
   *
   * TITLES FOLLOW CONTENTS, NOT HANDLE NAMES. `footer_shop` is the handle
   * that actually holds the help centre, the FAQ, contact and about — which is
   * the comp's «روابط مهمة» list item for item — while `footer_support` holds
   * payment and how-to-order. Mapping the titles by what the handles SOUND
   * like put the payment links under "important links"; they are mapped by
   * what each menu contains instead.
   *
   * Order is the comp's, read right-to-left on the Arabic frame: important
   * links, then policies. The comp draws TWO groups and the seed makes three,
   * because it keeps payment and ordering separate from the legal set. The
   * third is rendered on the same footing rather than dropped — silently
   * hiding a menu the admin published is worse than a third chip, and merging
   * them is an edit to the MENUS, which is staff work in the panel.
   */
  const groups = (
    [
      ["footer_shop", (menus?.data?.footer_shop ?? []) as MenuItem[]],
      ["footer_legal", (menus?.data?.footer_legal ?? []) as MenuItem[]],
      ["footer_support", (menus?.data?.footer_support ?? []) as MenuItem[]],
    ] as const
  ).filter(([, items]) => items.length > 0);

  const general = settings?.data?.general;

  // Every network the comp draws (7194:46670), in its order, each only when
  // the store has a link for it — an icon to nowhere is a dead control.
  const socials = [
    { key: "facebook", href: general?.social_facebook, icon: "/brand/icon-facebook.svg", label: m.footer.facebook },
    { key: "instagram", href: general?.social_instagram, icon: "/brand/icon-instagram.svg", label: m.footer.instagram },
    { key: "snapchat", href: general?.social_snapchat, icon: "/brand/icon-snapchat.svg", label: m.footer.snapchat },
    { key: "tiktok", href: general?.social_tiktok, icon: "/brand/icon-tiktok.svg", label: m.footer.tiktok },
    { key: "twitter", href: general?.social_twitter, icon: "/brand/icon-x.svg", label: m.footer.twitter },
  ].filter((social): social is typeof social & { href: string } => Boolean(social.href));

  const contacts = [
    {
      key: "email",
      href: general?.support_email ? `mailto:${general.support_email}` : "",
      icon: "/brand/icon-email.svg",
      label: m.footer.email,
    },
    {
      key: "whatsapp",
      href: general?.support_whatsapp ? `https://wa.me/${general.support_whatsapp.replace(/\D/g, "")}` : "",
      icon: "/brand/icon-whatsapp.svg",
      label: m.footer.whatsapp,
    },
  ].filter((contact) => Boolean(contact.href));

  const brandLinks = groupLinks(general);

  return (
    /*
     * THE COMP'S FOOTER IS DARK, in the light theme too (`7194:46670` desktop,
     * `7200:32747` phone): a #212121 ground whose top edge runs flat, rounds
     * at one corner and rises in a tail at the other — the tail stands 68px
     * above the footer on desktop and 50px on the phone, so the element
     * carries that height as padding and the ground fills it.
     *
     * The grounds are the comp's own paths, exported. The desktop tail rises
     * at the top-RIGHT of the Arabic page and the phone's at the top-LEFT,
     * as drawn (measured on the rendered frames); English mirrors each.
     *
     * THE DARK THEME'S FOOTER IS THE INVERSE (the dark home comps,
     * `7213:10184` phone and `6904:105499` desktop): a white ground with the
     * #212121 ink, so it stands apart from the #212121 page. The plates are
     * therefore MASKS filled with `--color-footer-ground`, and the footer's
     * colours are tokens the dark theme redefines on `.cq-footer`
     * (globals.css) — the light footer is drawn exactly as before.
     */
    <footer className="cq-footer relative mt-16 w-full pt-[50px] text-[var(--color-on-primary)] lg:mt-12 lg:pt-[68px]">
      <span aria-hidden className={`${GROUND} [mask-image:url(/brand/footer-ground-mobile.svg)] rtl:-scale-x-100 lg:hidden`} />
      <span aria-hidden className={`${GROUND} hidden [mask-image:url(/brand/footer-ground.svg)] ltr:-scale-x-100 lg:block`} />

      {/* The phone column is 12px apart throughout (7200:32747's Footer
          Content). Desktop: one row, centred in the comp's 339px band, its columns
          aligned at their TOPS (`Footer Content` is items-start). */}
      {/* ONE ROW FROM `xl`, as the 1440 comp draws it; between `lg` and `xl`
          it WRAPS — brand, groups and socials are ~1070px of content that
          cannot shrink, and at 1024 they pushed the page 68px sideways
          (`e2e/journeys/no-overflow.spec.ts`). */}
      <div className="mx-auto flex w-full max-w-[1248px] flex-col items-center gap-3 px-[21px] pb-3 pt-10 md:max-w-[600px] lg:min-h-[339px] lg:max-w-[1248px] lg:flex-row lg:flex-wrap lg:items-start lg:justify-between lg:gap-10 lg:px-6 lg:py-[60px] xl:flex-nowrap">
        {/* The logo and the promise. Centred and stacked on the phone; on
            desktop the wide lockup over a 404px paragraph, Body/Medium-L. */}
        <div className="flex max-w-[404px] flex-col items-center gap-4 text-center lg:min-w-[280px] lg:shrink lg:items-start lg:text-start">
          {/* White lettering on the light theme's dark footer, #212121 on the
              dark theme's white one — one pair shown per theme. */}
          <Image
            src="/brand/logo-chargerquick-mark-light.svg"
            alt={m.common.storeName}
            width={86}
            height={96}
            className="cq-light-theme-only h-[117px] w-auto lg:hidden"
          />
          <Image
            src="/brand/logo-chargerquick-mark-dark.svg"
            alt={m.common.storeName}
            width={86}
            height={96}
            className="cq-dark-theme-only h-[117px] w-auto lg:hidden"
          />
          <Image
            src="/brand/logo-chargerquick-wide-light.svg"
            alt={m.common.storeName}
            width={235}
            height={78}
            className="cq-light-theme-only hidden h-[78px] w-auto lg:block"
          />
          <Image
            src="/brand/logo-chargerquick-wide.svg"
            alt={m.common.storeName}
            width={235}
            height={78}
            className="cq-dark-theme-only hidden h-[78px] w-auto lg:block"
          />
          <p className="text-body-s font-medium leading-[1.5] lg:text-body-l">{m.footer.about}</p>
        </div>

        {/* The link groups. A <details> each: the phone collapses them (the
            comp draws rows with a chevron) and `.cq-footer-group` forces them
            open on desktop, where the comp draws two columns 80px apart. */}
        {/* 80px apart as drawn for the comp's two groups; tighter when the
            store publishes three, so a third column never squeezes the others
            into wrapped lines. */}
        <div className="flex w-full flex-col gap-2 lg:w-auto lg:shrink-0 lg:flex-row lg:items-start lg:gap-12 xl:gap-20">
          {groups.map(([handle, items]) => (
            <details key={handle} className="cq-footer-group group w-full lg:w-auto">
              <summary className="flex cursor-pointer items-center justify-between gap-3 rounded-[12px] bg-[var(--color-info-wash)] px-3 py-2 text-caption font-semibold leading-[1.5] text-[var(--color-info-bright)] lg:whitespace-nowrap lg:text-body-m">
                <span>{m.footer.groups[handle]}</span>
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="cq-footer-caret size-6 shrink-0 transition group-open:rotate-180"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>

              <nav
                aria-label={m.footer.groups[handle]}
                className="cq-footer-panel mt-1 flex flex-col gap-1 px-3 text-body-s font-medium leading-[1.5] lg:whitespace-nowrap"
              >
                {items.map((item) => (
                  <IntentLink
                    key={`${item.type}:${item.target}`}
                    href={menuHref(item, locale, landing)}
                    {...(isExternal(item) ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="transition hover:text-[var(--color-info-bright)]"
                  >
                    {item.label[locale] ?? item.label.en ?? ""}
                  </IntentLink>
                ))}
              </nav>
            </details>
          ))}
        </div>

        {/* Follow us, customer service, «جزء من» — on the phone 12px apart,
            each closed by a rule as drawn; at `xl` (the 1440 comp's single
            row) stacked 24px apart with no rules. Between `lg` and `xl` the
            row cannot hold all three blocks, so they take a row of their
            own, side by side, instead of a lone column under the brand
            (owner, 2026-10-08 — the gap read as broken on 1180px). */}
        <div className="flex w-full flex-col items-center gap-3 lg:flex-row lg:items-start lg:justify-center lg:gap-16 xl:w-auto xl:shrink-0 xl:flex-col xl:items-center xl:justify-start xl:gap-6">
          {socials.length > 0 ? (
            <div className={`${FOOTER_BLOCK} gap-2`}>
              <h2 className="text-body-s font-semibold leading-[1.5] lg:font-medium">{m.footer.followUs}</h2>
              <ul className="flex items-center gap-2">
                {socials.map((social) => (
                  <li key={social.key}>
                    <a href={social.href} target="_blank" rel="noopener noreferrer" aria-label={social.label} className="-m-1 block p-1 lg:m-0 lg:p-0">
                      <FooterGlyph src={social.icon} />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {contacts.length > 0 ? (
            <div className={`${FOOTER_BLOCK} gap-4 lg:gap-2`}>
              <h2 className="text-body-s font-semibold leading-[1.5] lg:font-medium">{m.footer.customerService}</h2>
              <ul className="flex items-start gap-3">
                {contacts.map((contact) => (
                  <li key={contact.key} className="flex flex-col items-center gap-1">
                    {/* rel="noopener noreferrer": this footer renders on the
                        order pages, and the WhatsApp link is a cross-origin
                        navigation that would otherwise send the order URL as
                        the Referer (HANDBOOK §2). */}
                    <a href={contact.href} target="_blank" rel="noopener noreferrer" aria-label={contact.label} className="-m-1 block p-1 lg:m-0 lg:p-0">
                      <FooterGlyph src={contact.icon} />
                    </a>
                    <span className="text-caption font-semibold leading-[1.5]">{contact.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* «جزء من»: SemiBold 14 over 48px logos on the phone; Medium 16
              over 40px logos on desktop, where the comp holds the row's
              place with three grey circles (144×40) — the phone comp's
              logos are the real ones, drawn at the desktop row's height. */}
          <div className={`${FOOTER_BLOCK} gap-4 lg:gap-2`}>
            <h2 className="text-body-s font-semibold leading-[1.5] lg:text-body-l lg:font-medium">{m.footer.partOf}</h2>
            <ul className="flex items-start justify-center gap-3">
              {GROUP_LOGOS.map((logo) => {
                const href = brandLinks[logo.brand];
                const picture = (src: string, theme: string) => (
                  <Image
                    src={src}
                    alt={m.footer.brands[logo.brand]}
                    width={logo.width}
                    height={logo.height}
                    // Served as the file itself, like the other small brand
                    // pictures: the 9 KB JoyGames PNG gains nothing from the
                    // optimizer, and its `/_next/image` request was seen to
                    // never answer in CI — with JavaScript off (no lazy
                    // loading) the page's load event waited on it forever.
                    unoptimized
                    className={`${theme} ${logo.className}`}
                  />
                );
                // A lockup with white lettering has a #212121 twin for the
                // dark theme's white footer; JoyGames' picture reads on both.
                const art = logo.darkSrc ? (
                  <>
                    {picture(logo.src, "cq-light-theme-only")}
                    {picture(logo.darkSrc, "cq-dark-theme-only")}
                  </>
                ) : (
                  picture(logo.src, "")
                );
                return (
                  <li key={logo.brand}>
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="block">
                        {art}
                      </a>
                    ) : (
                      art
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      {/* The phone comp closes on the copyright — Bold 12, the store's name
          alone in Primary/main (#007bbf); the desktop comp has no such line.
          The year is the clock's, not the dictionary's, where it would be
          wrong every January — read through a cached helper, since the
          footer is the shared shell's (`copyrightYear`). */}
      <p className="mx-auto w-full max-w-[1248px] px-6 pb-8 text-center text-caption font-bold leading-normal lg:hidden">
        {m.footer.rights} | <span className="text-[var(--color-brand-500)]">{m.common.storeName}</span>{" "}
        {await copyrightYear()}
      </p>

      {/* Appears only when Zaraz's Consent API exists (owner turned consent
          on); renders nothing otherwise, so the footer is unchanged. Closes
          both layouts — the copyright line above is phone-only. */}
      <PrivacySettingsLink
        label={m.footer.privacySettings}
        className="mx-auto block pb-8 text-center text-body-s font-medium leading-[1.5] max-lg:-mt-6"
      />
    </footer>
  );
}

/**
 * A ground plate: the exported path as a mask over the ground token, stretched
 * to the footer's box as the plate <img> used to be (`preserveAspectRatio="none"`).
 */
const GROUND =
  "pointer-events-none absolute inset-0 -z-10 bg-[var(--color-footer-ground)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:100%_100%]";

/** One of the phone column's blocks: full width, closed by a rule (phone only). */
const FOOTER_BLOCK =
  "flex w-full flex-col items-center border-b border-[var(--color-footer-rule)] pb-3 lg:w-auto lg:border-b-0 lg:pb-0";

/*
 * The «جزء من» logos, in the comp's reading order (right to left on the
 * Arabic page). The store's lockup is the footer's own light mark — the same
 * artwork, in the variable palette (ADR 0017) rather than the export's retired
 * one; the company mark is exported from 7200:31799; JoyGames is the comp's
 * own 200×200 picture, which the comp crops into a 34×48 slot (object-cover).
 */
const GROUP_LOGOS: readonly { brand: GroupBrand; src: string; darkSrc?: string; width: number; height: number; className: string }[] = [
  {
    brand: "store",
    src: "/brand/logo-chargerquick-mark-light.svg",
    darkSrc: "/brand/logo-chargerquick-mark-dark.svg",
    width: 86,
    height: 96,
    className: "h-12 w-auto lg:h-10",
  },
  {
    brand: "company",
    src: "/brand/group-chargerquick.svg",
    darkSrc: "/brand/group-chargerquick-dark.svg",
    width: 59,
    height: 48,
    className: "h-12 w-auto lg:h-10",
  },
  {
    brand: "joygames",
    src: "/brand/group-joygames.png",
    width: 200,
    height: 200,
    className: "h-12 w-[34.29px] object-cover lg:h-10 lg:w-[28.57px]",
  },
];

/**
 * A glyph in the footer's ink — 20px on the phone (`7200:31739`, gap 8; the
 * link's 4px padding lifts each target to 28px without moving the icons) and
 * 32px on desktop. The pack's files are drawn in #212121 for
 * light grounds; drawn as a CSS mask here, they take whatever colour the
 * footer is — white on the comp's dark ground — without a second file per
 * colour.
 */
function FooterGlyph({ src }: { src: string }) {
  return (
    <span
      aria-hidden
      className="block size-5 bg-current lg:size-8 [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]"
      style={{ maskImage: `url(${src})`, WebkitMaskImage: `url(${src})` }}
    />
  );
}
