import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { CopyButton } from "@/components/checkout/CopyButton";
import { ReportOrderForm } from "@/components/content/ReportOrderForm";
import { readSessionToken } from "@/lib/account/session";
import { listOrders } from "@/lib/api/client";
import { faqEntries } from "@/lib/content/pages";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { CUSTOMER_STATUS_PILL, customerStatus } from "@/lib/orders/customer-status";
import { pageMetadata } from "@/lib/seo/metadata";
import { lineName } from "@/lib/orders/purchased";
import { storeSettings } from "@/lib/content/settings";
import { lineArtworks } from "@/lib/orders/line-artwork";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  if (!isLocale(locale)) return {};
  const m = messagesFor(locale);
  return pageMetadata({ locale, path: "/contact-us", title: m.contact.title, description: m.seo.contactDescription });
}

/**
 * «تواصل معنا» — «Contact Mobile» (Claude Design, 2026-09-30).
 *
 *   - WhatsApp first, as one large card — the fastest channel;
 *   - the email on one row with «نسخ»;
 *   - «مشكلة في طلب؟»: a signed-in customer picks a recent order and WhatsApp
 *     opens with the order page's own report sentence and its number; a guest
 *     types the number;
 *   - quick answers from the FAQ, then the store's social links.
 *
 * Every channel is the store's own setting (`support_whatsapp`,
 * `support_email`, `social_*` — the footer's source) and is drawn only when
 * set. WHAT THE COMP HAS THAT IS NOT HERE: «فريق الدعم متصل الآن» and the
 * reply times — claims nothing here can check, left for the owner to confirm.
 */
export default async function ContactPage(props: Props) {
  // Per request, always: it lists the visitor's own orders.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const m = messagesFor(locale);
  const token = await readSessionToken();
  const [settings, orders, faq] = await Promise.all([
    storeSettings(locale).catch(() => null),
    token ? listOrders({ per_page: 3 }, { locale, bearerToken: token }).catch(() => null) : Promise.resolve(null),
    faqEntries(locale).catch(() => []),
  ]);
  const general = settings?.data?.general;
  const whatsapp = general?.support_whatsapp?.replace(/\D/g, "") || null;
  const email = general?.support_email || null;
  const report = (id: string) => `https://wa.me/${whatsapp}?text=${encodeURIComponent(m.orderStatus.reportMessage.replace("{id}", id))}`;
  const socials = [
    { key: "instagram", href: general?.social_instagram, icon: "/brand/icon-instagram.svg", label: m.footer.instagram },
    { key: "twitter", href: general?.social_twitter, icon: "/brand/icon-x.svg", label: m.footer.twitter },
    { key: "tiktok", href: general?.social_tiktok, icon: "/brand/icon-tiktok.svg", label: m.footer.tiktok },
    { key: "snapchat", href: general?.social_snapchat, icon: "/brand/icon-snapchat.svg", label: m.footer.snapchat },
    { key: "facebook", href: general?.social_facebook, icon: "/brand/icon-facebook.svg", label: m.footer.facebook },
  ].filter((social): social is typeof social & { href: string } => Boolean(social.href));

  return (
    <main className="mx-auto w-full max-w-[1248px] flex-1 px-6 pb-12 pt-6 lg:pt-[70px]">
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
        <header className="flex flex-col gap-1.5">
          <p className="text-body-s font-bold text-[var(--color-brand-500)]">{m.contact.title}</p>
          <h1 className="text-display font-bold lg:text-[32px] leading-[1.3] text-[var(--color-ink)]">{m.contact.heading}</h1>
        </header>

        {!whatsapp && !email ? (
          <p className="rounded-[14px] bg-[var(--color-chip)] p-5 text-center text-body-s text-[var(--color-ink-muted)] lg:text-body-l">{m.contact.unavailable}</p>
        ) : null}

        {whatsapp ? (
          <a
            href={`https://wa.me/${whatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col gap-3.5 rounded-[20px] bg-[var(--color-success)] p-[18px] text-[var(--color-on-primary)]"
          >
            <span className="flex items-center gap-3">
              <span className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-white/20">
                <span aria-hidden className="block size-[26px] bg-[var(--color-on-primary)] [mask-image:url(/brand/icon-whatsapp.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-body-m font-semibold leading-[1.35] lg:text-body-l">{m.contact.waTitle}</span>
                <span className="text-caption opacity-90 lg:text-body-s">{m.contact.waLead}</span>
              </span>
            </span>
            <span className="flex h-11 items-center justify-center rounded-[12px] bg-[var(--color-on-primary)] text-body-s font-bold text-[var(--color-success)] lg:text-body-l">
              {m.contact.waCta}
            </span>
          </a>
        ) : null}

        {email ? (
          <div className="flex items-center gap-3 rounded-[16px] bg-[var(--color-chip)] p-3.5">
            <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-[var(--color-primary-wash-lighter)]">
              <span aria-hidden className="block size-[22px] bg-[var(--color-brand-500)] [mask-image:url(/brand/icon-email.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-caption text-[var(--color-ink-subtle)] lg:text-body-s">{m.contact.emailLabel}</span>
              <a href={`mailto:${email}`} dir="ltr" className="max-w-full self-start text-body-m font-bold text-[var(--color-ink)] lg:text-body-l [overflow-wrap:anywhere]">
                {email}
              </a>
            </span>
            <CopyButton
              value={email}
              label={m.orderView.copy}
              copiedLabel={m.orderView.copied}
              accessibleName={`${m.orderView.copy} ${m.contact.emailLabel}`}
              className="inline-flex h-[34px] shrink-0 items-center rounded-[10px] px-3 text-caption font-bold text-[var(--color-brand-500)] shadow-[inset_0_0_0_1px_var(--color-line)] [&>svg]:hidden"
            />
          </div>
        ) : null}

        {whatsapp ? (
          <section aria-labelledby="order-help" className="flex flex-col gap-2.5">
            <h2 id="order-help" className="text-body-m font-bold text-[var(--color-ink)] lg:text-heading-m">
              {m.contact.orderHelp}
            </h2>
            <p className="-mt-1.5 text-caption text-[var(--color-ink-muted)] lg:text-body-s">
              {orders && orders.data.length > 0 ? m.contact.orderHelpLead : m.contact.orderHelpGuest}
            </p>
            {orders && orders.data.length > 0 ? (
              <ul className="rounded-[16px] bg-[var(--color-chip)] px-3">
                {orders.data.map((order, index) => (
                  <li key={order.id} className={`flex min-h-16 items-center gap-2.5 ${index > 0 ? "border-t border-[var(--color-line)]" : ""}`}>
                    <OrderArt order={order} locale={locale} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body-s font-bold text-[var(--color-ink)] lg:text-body-l">{bought(order, locale)}</span>
                      <span className="flex items-center gap-1.5 whitespace-nowrap text-caption text-[var(--color-ink-subtle)]">
                        <bdi dir="ltr">#{order.id}</bdi>
                        <span className={`rounded-full px-1.5 font-bold ${CUSTOMER_STATUS_PILL[customerStatus(order)]}`}>{m.customerStatus[customerStatus(order)]}</span>
                      </span>
                    </span>
                    <a
                      href={report(order.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-8 shrink-0 items-center rounded-[9px] bg-[var(--background)] px-3 text-caption font-bold text-[var(--color-ink)] shadow-[inset_0_0_0_1px_var(--color-line)]"
                    >
                      {m.contact.report}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <ReportOrderForm whatsapp={whatsapp} message={m.orderStatus.reportMessage} label={m.orderView.orderNo} button={m.contact.report} />
            )}
          </section>
        ) : null}

        {faq.length > 0 ? (
          <section aria-labelledby="quick-answers" className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <h2 id="quick-answers" className="text-body-m font-bold text-[var(--color-ink)] lg:text-heading-m">
                {m.contact.quick}
              </h2>
              <Link href={`/${locale}/faq`} className="text-caption font-bold text-[var(--color-brand-500)] lg:text-body-s">
                {m.contact.allFaq}
              </Link>
            </div>
            <ul>
              {faq.slice(0, 3).map((entry) => (
                <li key={entry.id} className="border-b border-[var(--color-line)]">
                  <Link href={`/${locale}/faq`} className="flex min-h-12 items-center gap-2.5 text-[var(--color-ink)]">
                    <span className="flex-1 text-body-s font-bold lg:text-body-l">{entry.question}</span>
                    <span aria-hidden className="block size-4 shrink-0 bg-[var(--color-ink-subtle)] [mask-image:url(/brand/icon-chevron-start.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:5px_10px] ltr:-scale-x-100" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {socials.length > 0 ? (
          <section className="flex flex-col items-center gap-3 pt-1 text-center">
            <p className="text-caption font-bold text-[var(--color-ink-subtle)] lg:text-body-s">{m.contact.follow}</p>
            <div className="flex flex-wrap justify-center gap-2.5">
              {socials.map((social) => (
                <a
                  key={social.key}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.label}
                  className="grid size-11 place-items-center rounded-full bg-[var(--color-chip)]"
                >
                  <span
                    aria-hidden
                    className="block size-5 bg-[var(--color-ink)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]"
                    style={{ maskImage: `url(${social.icon})`, WebkitMaskImage: `url(${social.icon})` }}
                  />
                </a>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

type ListedOrder = NonNullable<Awaited<ReturnType<typeof listOrders>>>["data"][number];

/**
 * The order's first line, pictured as its product's page pictures it
 * (`lineArtworks`) — never another line's picture. The picture alone; the
 * brand blue only where there is none.
 */
async function OrderArt({ order, locale }: { order: ListedOrder; locale: Locale }) {
  const first = order.items?.[0];
  const [image] = first ? await lineArtworks([first], locale).catch(() => [null]) : [null];
  return (
    <span className={`relative block size-10 shrink-0 overflow-hidden rounded-[10px] ${image ? "" : "bg-[var(--color-brand-500)]"}`}>
      {image ? <Image src={image.url} alt={image.alt} fill sizes="40px" className="object-cover" /> : null}
    </span>
  );
}

function bought(order: ListedOrder, locale: Locale): string {
  return (order.items ?? [])
    .map((item) => lineName(item, locale))
    .join(" · ");
}
