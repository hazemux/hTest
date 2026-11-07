import { domAnimation } from "motion/react";

/**
 * Motion's DOM animation features (animate, exit, variants, gestures — no
 * layout or drag), loaded by `MotionScope` through a dynamic `import()` so
 * they arrive after the page is interactive and never weigh on first paint.
 * `domMax` is deliberately not used (ADR 0041).
 */
export default domAnimation;
