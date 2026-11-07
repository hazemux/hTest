import { serializeJsonLd, type JsonLdNode } from "@/lib/seo/schema";

/**
 * One `<script type="application/ld+json">`, rendered on the SERVER, so the
 * markup is in the HTML a crawler receives before any JavaScript runs. The
 * payload is escaped by serializeJsonLd — never interpolated raw.
 */
export function JsonLd({ data }: { data: JsonLdNode }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
