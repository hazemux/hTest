import { useId, type CSSProperties } from "react";

/**
 * THE CHARGERQUICK MARK, AS PARTS THE LOADERS CAN MOVE: the bolt (eight
 * shapes) and the thirteen squares beside it. Geometry and colours from
 * Claude Design «Loader Concepts» (2026-10-08), in the logo's own viewBox.
 * Colours are the logo pack's (`--cq-logo-*`, set on `.cq-page-loader`).
 */
type LogoColour = "orange" | "amber" | "blue" | "yellow" | "cyan" | "sky";

const VIEW_BOX = "248 348 100 144";

const BOLT: ReadonlyArray<readonly [LogoColour, string]> = [
  ["yellow", "M306.3,410.86c4.63-6.47,33.6-58.53,33.6-58.53l-35.64,36.28,3.37,3.37-4.99,4.92,5.66,6.22-20.85,22.17-3.26-3.36-5.54,5.2-6.47-5.85-8.52,8.68h34.2l14.88-19.09h-6.43Z"],
  ["sky", "M344.89,410.86h-32.16l-14.88,19.09h4.41l-33.64,59.62,76.26-78.71Z"],
  ["orange", "M280.28,468.92l-11.65,20.65,26.16-26.9-14.51,6.25Z"],
  ["blue", "M323.44,433l21.46-22.15h-32.16l-14.88,19.09h4.41l-1.72,3.05h22.88Z"],
  ["blue", "M301.77,446.79l-8.64-.63-5.66,10.03,14.3-9.4Z"],
  ["orange", "M296.58,414.09h6.58l-12.46,15.86h7.15l14.88-19.1h-6.43c4.63-6.47,33.6-58.53,33.6-58.53l-43.31,61.78Z"],
  ["amber", "M321.91,370.65l-6.85,6.98,9.88,1.37c.59-1.03,1.17-2.06,1.75-3.08l-4.78-5.26Z"],
  ["amber", "M310.24,382.53l-5.28,5.37,10.93,6.97c.98-1.71,2-3.48,3.04-5.3l-8.69-7.03Z"],
];

/** Each square with its centre, which times its stream (1a) and aims its spark (1e/1f). */
const SQUARES: ReadonlyArray<readonly [LogoColour, string, number, number]> = [
  ["orange", "M285.88,375.68l10.09,10.21-10.09,10.21-10.11-10.37,10.11-10.05Z", 286, 386],
  ["yellow", "M259.94,393.67c2.68-2.73,5.43-5.53,8.13-8.29,2.7,2.74,5.44,5.52,8.13,8.24-2.68,2.7-5.45,5.49-8.2,8.27-2.63-2.68-5.37-5.48-8.05-8.22Z", 268, 394],
  ["cyan", "M280.43,409.29l-7.8,7.98-7.74-7.93,7.76-7.94,7.77,7.89Z", 272, 409],
  ["sky", "M287.69,406.43l6.77,6.75-6.74,6.86-6.63-6.95,6.6-6.66Z", 288, 413],
  ["cyan", "M295.78,395.47l6.48,6.59-6.46,6.58-6.47-6.67,6.45-6.49Z", 296, 402],
  ["orange", "M267.03,416.12c-1.92,1.98-3.94,4.04-5.94,6.1-1.97-2.02-3.96-4.06-5.94-6.12,1.98-1.97,4.03-4,6.08-6.03,1.89,1.97,3.86,4.03,5.81,6.05Z", 261, 416],
  ["orange", "M280.96,396.03l5,5.06-5.12,5.13-5.04-5.01,5.16-5.18Z", 281, 401],
  ["orange", "M258.82,406.55c-1.34-1.39-2.74-2.84-4.11-4.25,1.42-1.44,2.88-2.91,4.29-4.34,1.38,1.36,2.84,2.8,4.28,4.23-1.46,1.43-2.92,2.85-4.47,4.36Z", 259, 402],
  ["yellow", "M261.46,383.43c-1.32-1.34-2.65-2.7-3.91-4,1.35-1.33,2.74-2.72,4.06-4.02,1.19,1.21,2.56,2.61,3.85,3.93-1.23,1.26-2.61,2.67-4,4.08Z", 262, 379],
  ["sky", "M299.53,387.82l3.25,3.3-3.39,3.24-3.19-3.19,3.33-3.35Z", 300, 391],
  ["yellow", "M274.53,374.82c1.13,1.14,2.25,2.28,3.34,3.38-1.04,1.04-2.15,2.14-3.14,3.13-1.07-1.07-2.23-2.21-3.35-3.33.97-.97,2.09-2.11,3.15-3.19Z", 274, 378],
  ["yellow", "M253.8,387.83l3.02,3.2-3.35,3.36-3.1-3.19,3.43-3.38Z", 254, 391],
  ["blue", "M281.4,420.53l-3.15,3.23-3.12-3.35,3.2-3.16,3.06,3.27Z", 278, 420],
];

/** `empty`: the battery's grey, uncharged mark. */
const fill = (colour: LogoColour, empty?: boolean): CSSProperties => ({ fill: empty ? "var(--color-line)" : `var(--cq-logo-${colour})` });

/** 1a: squares further from the bolt leave first, so they stream in left to right. */
const streamDelay = (x: number): CSSProperties => ({ ["--cq-delay" as string]: `${(((x - 254) / 46) * 2 * 0.35).toFixed(2)}s` });

/** 1e/1f: each square bursts away from the bolt's centre. */
const sparkVector = (x: number, y: number): CSSProperties => ({
  ["--cq-spark-x" as string]: `${((x - 300) * 0.35).toFixed(1)}px`,
  ["--cq-spark-y" as string]: `${((y - 400) * 0.35).toFixed(1)}px`,
});

function Bolt({ empty }: { empty?: boolean }) {
  return (
    <g className="cq-mark-bolt">
      {BOLT.map(([colour, d], i) => (
        <path key={i} d={d} style={fill(colour, empty)} />
      ))}
    </g>
  );
}

function Squares({ motion, empty }: { motion?: "stream" | "spark"; empty?: boolean }) {
  return SQUARES.map(([colour, d, x, y], i) => (
    <path
      key={i}
      d={d}
      className="cq-mark-part"
      style={{ ...fill(colour, empty), ...(motion === "stream" ? streamDelay(x) : motion === "spark" ? sparkVector(x, y) : {}) }}
    />
  ));
}

export type MarkMotion = "pixel" | "battery" | "thunder" | "still";

/** The mark, moving the way its loader needs. Decorative: always `aria-hidden`. */
export function LoaderMark({ motion }: { motion: MarkMotion }) {
  const clipId = useId();

  if (motion === "battery") {
    return (
      <svg viewBox={VIEW_BOX} width="100%" height="100%" aria-hidden focusable="false">
        <defs>
          <clipPath id={clipId}>
            <rect className="cq-mark-level" x={248} y={348} width={100} height={150} />
          </clipPath>
        </defs>
        <g>
          <Bolt empty />
          <Squares empty />
        </g>
        <g className="cq-mark-charged" clipPath={`url(#${clipId})`}>
          <Bolt />
          <Squares />
        </g>
      </svg>
    );
  }

  return (
    <svg viewBox={VIEW_BOX} width="100%" height="100%" aria-hidden focusable="false">
      <Bolt />
      <Squares motion={motion === "pixel" ? "stream" : motion === "thunder" ? "spark" : undefined} />
    </svg>
  );
}
