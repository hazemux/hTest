import Image from "next/image";

import { ArtworkPlaceholder } from "@/components/ui/ArtworkPlaceholder";

/**
 * A partner's logo inside the box the comp gives it — CONTAINED, never
 * cropped: a merchant's mark cut off at the edge is the one thing a logo must
 * not look like. The file is on our media disk (staff upload or import it);
 * the storefront never loads a partner's own CDN.
 *
 * No logo yet: the merchant's initial on the catalogue's quiet plate, and the
 * name is carried by the card's text for screen readers.
 */
export function PartnerLogo({
  logo,
  name,
  className,
  sizes,
}: {
  logo: { url: string; alt: string } | null;
  name: string;
  className: string;
  sizes: string;
}) {
  return (
    <div className={`relative shrink-0 overflow-hidden ${logo ? "" : "rounded-[6px]"} ${className}`}>
      {logo ? (
        <Image src={logo.url} alt={logo.alt || name} fill sizes={sizes} className="object-contain" />
      ) : (
        <ArtworkPlaceholder name={name} className="[&>span]:text-heading-l! lg:[&>span]:text-display!" />
      )}
    </div>
  );
}
