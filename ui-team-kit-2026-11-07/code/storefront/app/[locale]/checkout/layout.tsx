/**
 * Private, per request, allowed to block (instant.md). This opts the segment
 * out of instant validation ONLY: a redirect or 404 its pages decide after a
 * request read still streams as a 200 under Cache Components (not-found.md,
 * "Status codes") — a real status is decided in the shell or in `proxy.ts`
 * (HANDBOOK §8). Remove this file only together with Cache Components (plan D2).
 */
export const instant = false;

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
