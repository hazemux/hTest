"use client";

import { startAuthentication, startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { useState, useSyncExternalStore } from "react";

import {
  beginPasskeyRegistration,
  beginPasskeySignIn,
  finishPasskeyRegistration,
  finishPasskeySignIn,
} from "@/lib/account/passkey-actions";

/**
 * «مفتاح المرور» — one button for both ceremonies (v0.1.61). Drawn only when
 * the browser can do WebAuthn; everything else on the page works without it.
 * The browser talks to server actions only, never to the API.
 */
export function PasskeyButton({
  mode,
  locale,
  next = "",
  label,
  failedLabel,
  deviceName = "",
  className,
}: {
  mode: "sign-in" | "add";
  locale: string;
  next?: string;
  label: string;
  failedLabel: string;
  deviceName?: string;
  className: string;
}) {
  // Read after hydration, false on the server: the button never flashes on
  // a browser that cannot use it.
  const supported = useSyncExternalStore(noSubscription, browserSupportsWebAuthn, () => false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!supported) return null;

  async function run() {
    setBusy(true);
    setFailed(false);
    try {
      if (mode === "sign-in") {
        const start = await beginPasskeySignIn(locale);
        if ("error" in start) throw new Error("options");
        const answer = await startAuthentication({ optionsJSON: start.options as never });
        const to = await finishPasskeySignIn(locale, next, start.challengeId, answer as unknown as Record<string, unknown>);
        if (!to) throw new Error("refused");
        window.location.assign(to);
        return;
      }

      const start = await beginPasskeyRegistration(locale);
      if ("stepUp" in start) {
        window.location.assign(start.stepUp);
        return;
      }
      if ("error" in start) throw new Error("options");
      const answer = await startRegistration({ optionsJSON: start.options as never });
      const saved = await finishPasskeyRegistration(locale, start.challengeId, answer as unknown as Record<string, unknown>, deviceLabel() ?? deviceName);
      if (!saved) throw new Error("refused");
      window.location.assign(`/${locale}/account/settings/security/passkeys?added=1`);
    } catch {
      // A cancelled prompt lands here too; saying "try again" is right for both.
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <button type="button" onClick={run} disabled={busy} className={className}>
        {busy ? <span aria-hidden className="size-4 motion-safe:animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
        {label}
      </button>
      {failed ? (
        <p role="alert" className="text-body-s font-medium text-[var(--color-error)] lg:text-body-l">
          {failedLabel}
        </p>
      ) : null}
    </div>
  );
}

function noSubscription(): () => void {
  return () => {};
}

/** "iPhone", "Mac", "Android"… — so the list says which device holds which key. */
function deviceLabel(): string | null {
  const agent = navigator.userAgent;
  for (const [pattern, name] of [
    [/iPhone/, "iPhone"],
    [/iPad/, "iPad"],
    [/Android/, "Android"],
    [/Macintosh|Mac OS X/, "Mac"],
    [/Windows/, "Windows"],
  ] as const) {
    if (pattern.test(agent)) return name;
  }
  return null;
}
