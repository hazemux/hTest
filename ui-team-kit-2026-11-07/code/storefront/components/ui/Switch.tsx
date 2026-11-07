/**
 * THE STORE'S ONE SWITCH LOOK — the track and the thumb of «الوضع الليلي»
 * («Side Menu Mobile» / «Settings Mobile», 2026-09-30). Only the look lives
 * here, so the control around it stays whatever the screen needs:
 * `ThemeSwitch` is a client button that repaints at once; a settings switch
 * that saves to the API is a `SubmitButton` posting its NEW state, which
 * works with JavaScript off. Neither draws its own toggle.
 *
 * The element that carries `switchTrackClass` takes `role="switch"` and
 * `aria-checked`; the thumb is decoration.
 */
export function switchTrackClass(on: boolean): string {
  return `relative h-[26px] w-11 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] ${
    on ? "bg-[var(--color-brand-500)]" : "bg-[var(--color-line)]"
  }`;
}

export function SwitchThumb({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`absolute top-[3px] size-5 rounded-full bg-[var(--color-on-primary)] shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-[inset-inline-start] motion-reduce:transition-none ${
        on ? "start-[21px]" : "start-[3px]"
      }`}
    />
  );
}
