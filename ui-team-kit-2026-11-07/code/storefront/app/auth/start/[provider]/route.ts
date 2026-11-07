import { beginSocial, isSocialProvider } from "@/lib/account/social-handoff";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/locales";
import { isInternalPath } from "@/lib/navigation/internal-path";

/**
 * `/auth/start/google?locale=ar&next=…` — the sign-in page's Google/Apple
 * button is a plain link here (no script needed): ask Laravel where to go,
 * remember the state, and send the customer to the provider.
 *
 * Relative Location headers only: behind the proxy `request.url` is the
 * loopback address.
 */
export async function GET(request: Request, context: { params: Promise<{ provider: string }> }): Promise<Response> {
  const { provider } = await context.params;
  const query = new URL(request.url).searchParams;
  const rawLocale = query.get("locale");
  const locale = rawLocale && isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const rawNext = query.get("next");
  const next = isInternalPath(rawNext) ? rawNext : `/${locale}/account`;

  const target = isSocialProvider(provider) ? await beginSocial(provider, locale, next) : null;

  return new Response(null, {
    status: 303,
    headers: { Location: target ?? `/${locale}/account/sign-in?error=social_failed`, "Cache-Control": "no-store" },
  });
}
