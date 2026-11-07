import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { ALERTS, type AlertKey, type AlertTone } from "@/lib/notifications/registry";

/**
 * The comp's `Notification Bar` (`7422:37352`): 8px corners, a 16px glyph,
 * SemiBold, a small outlined action at the end. The ONE place the storefront
 * draws a confirmation or warning bar.
 *
 * SERVER-SAFE ON PURPOSE — no hooks, no browser APIs. The cart and account
 * pages render it from their own URL flags so it is there with JavaScript off;
 * `ToastHost` renders it for alerts raised after a redirect or in the browser.
 *
 * `animate` is the CSS-only notice motion (`cq-notice-in` stays, `cq-notice-auto`
 * fades after ~6.5 s) for the server-rendered uses, which have no timer of their
 * own. `ToastHost` times itself and leaves it off.
 */
export const ALERT_ACTION_CLASS =
  "shrink-0 rounded-[6px] border border-current px-2 py-1 text-body-s font-semibold leading-[1.5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]";

const TONES: Record<AlertTone, string> = {
  success: "bg-[var(--color-success-subtlest)] text-[var(--color-success)]",
  error: "bg-[var(--color-error-subtlest)] text-[var(--color-error)]",
  // The status banner's (`STATUS_BANNER`): ink on the semantic washes — the
  // cyan and amber themselves are too light for body text on their wash.
  info: "bg-[var(--color-info-wash)] text-[var(--color-ink)]",
  warning: "bg-[var(--color-warning-wash)] text-[var(--color-ink)]",
};

const SETTLE: Record<AlertTone, string> = {
  success: "cq-notice-auto",
  error: "cq-notice-in",
  // The status banner stays put: it is in the page's flow, drawn in the shell.
  info: "",
  warning: "",
};

export function AlertBar({
  tone,
  icon,
  text,
  role = "status",
  animate = false,
  className = "",
  children,
}: {
  tone: AlertTone;
  icon: string;
  text: string;
  role?: "status" | "alert";
  animate?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      role={role}
      className={`mx-auto flex max-w-[640px] items-center justify-between gap-3 rounded-[8px] py-1 ps-3 pe-1 text-body-s font-semibold leading-[1.5] lg:text-body-l ${TONES[tone]} ${animate ? SETTLE[tone] : ""} ${className}`}
    >
      <p className="flex min-w-0 items-center gap-2 py-1">
        <span
          aria-hidden
          className="block size-4 shrink-0 bg-current [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]"
          style={{ maskImage: `url(${icon})`, WebkitMaskImage: `url(${icon})` }}
        />
        <span>{text}</span>
      </p>
      {children}
    </div>
  );
}

/** What `<AlertBar {...alertProps(key, locale)} />` needs, from the registry. */
export function alertProps(key: AlertKey, locale: Locale) {
  const alert = ALERTS[key];
  return { tone: alert.tone, icon: alert.icon, role: alert.role, text: alert.text(messagesFor(locale)) };
}
