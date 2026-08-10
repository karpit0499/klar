import Link from "next/link";
import { groupedDocs } from "../lib/docs";

export function DocsSidebar({ activeSlug }: { activeSlug?: string }) {
  return (
    <nav className="docs-sidebar" aria-label="Documentation table of contents">
      <Link className="docs-index-link" href="/docs">Documentation index</Link>
      {groupedDocs().map((group) => (
        <section key={group.section}>
          <h2>{group.section}</h2>
          <ul>
            {group.docs.map((doc) => (
              <li key={doc.slug}>
                <Link href={`/docs/${doc.slug}`} aria-current={doc.slug === activeSlug ? "page" : undefined}>
                  {doc.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}
