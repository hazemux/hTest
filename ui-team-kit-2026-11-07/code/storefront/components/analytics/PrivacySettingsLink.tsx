"use client";

import { useEffect, useState } from "react";

import { hasConsentApi, showConsentModal } from "@/lib/analytics/zaraz";

/**
 * «إعدادات الخصوصية» — appears by itself once the owner turns Zaraz consent
 * on (Zaraz spec §4): the Consent API exists only then. No flag, no deploy.
 */
export function PrivacySettingsLink({ label, className = "" }: { label: string; className?: string }) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const check = () => setAvailable(hasConsentApi());
    check();
    document.addEventListener("zarazConsentAPIReady", check);
    return () => document.removeEventListener("zarazConsentAPIReady", check);
  }, []);

  if (!available) return null;
  return (
    <button type="button" onClick={showConsentModal} className={`underline underline-offset-2 ${className}`.trim()}>
      {label}
    </button>
  );
}
