import Link from "next/link";
import { groupedDocs } from "../lib/docs";

export function DocsSidebar({
  activeSlug,
  collapsible = false,
}: {
  activeSlug?: string;
  collapsible?: boolean;
}) {
  return (
    <nav className="docs-sidebar" aria-label="Documentation table of contents">
      <Link className="docs-index-link" href="/docs">Documentation index</Link>
      {groupedDocs().map((group) => {
        const links = (
          <ul>
            {group.docs.map((doc) => (
              <li key={doc.slug}>
                <Link href={`/docs/${doc.slug}`} aria-current={doc.slug === activeSlug ? "page" : undefined}>
                  {doc.title}
                </Link>
              </li>
            ))}
          </ul>
        );
        const active = group.docs.some((doc) => doc.slug === activeSlug);
        return collapsible ? (
          <details className="docs-sidebar-group" key={group.section} open={active}>
            <summary>{group.section}</summary>
            {links}
          </details>
        ) : (
          <section key={group.section}>
            <h2>{group.section}</h2>
            {links}
          </section>
        );
      })}
    </nav>
  );
}
