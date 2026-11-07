"use client";

import { useEffect, useState } from "react";

import { collectDeviceSignal } from "@/lib/device-signal/collect";

/**
 * A hidden `device_signal` input for the plain server-action auth forms
 * (ADR 0025).
 *
 * The forms stay Server Components and still need no JavaScript: this island
 * only fills one hidden field after mount, and an empty field — no script,
 * a blocker, a slow device — is an ordinary submission. The value is never
 * trusted as sent; the action re-validates it before it becomes a header.
 */
export function DeviceSignalField() {
  const [value, setValue] = useState("");

  useEffect(() => {
    let live = true;
    void collectDeviceSignal().then((signal) => {
      if (live && signal) setValue(signal);
    });
    return () => {
      live = false;
    };
  }, []);

  return <input type="hidden" name="device_signal" value={value} />;
}
