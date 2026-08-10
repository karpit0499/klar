import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocMeta } from "../../../components/DocMeta";
import { DocsFrame } from "../../../components/DocsFrame";
import { adjacentDocs, allDocs, docBySlug } from "../../../lib/docs";
import { SOCIAL_IMAGE } from "../../../lib/site";

type PageProps = { params: Promise<{ slug: string[] }> };

export function generateStaticParams() {
  return allDocs().map((doc) => ({ slug: [doc.slug] }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const doc = docBySlug(slug.join("/"));
  if (!doc) return {};
  const canonical = `/docs/${doc.slug}`;
  return {
    title: doc.title,
    description: doc.description,
    alternates: { canonical },
    openGraph: {
      title: `${doc.title} · Klar Knowledge Base`,
      description: doc.description,
      url: canonical,
      type: "article",
      images: [{ url: SOCIAL_IMAGE, width: 1731, height: 909, alt: "Klar Knowledge Base" }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${doc.title} · Klar Knowledge Base`,
      description: doc.description,
      images: [SOCIAL_IMAGE],
    },
  };
}

export default async function DocumentationPage({ params }: PageProps) {
  const { slug } = await params;
  const doc = docBySlug(slug.join("/"));
  if (!doc) notFound();
  const adjacent = adjacentDocs(doc.slug);

  const toc = doc.headings.length ? (
    <aside className="page-toc" aria-label="On this page">
      <strong>On this page</strong>
      <ol>{doc.headings.map((heading) => (
        <li key={`${heading.id}-${heading.level}`} className={heading.level === 3 ? "nested" : ""}>
          <a href={`#${heading.id}`}>{heading.text}</a>
        </li>
      ))}</ol>
      <div className="page-control">
        <span>Owner</span><strong>{doc.owner}</strong>
        <span>Next review</span><strong>{doc.nextReview}</strong>
      </div>
    </aside>
  ) : undefined;

  return (
    <DocsFrame activeSlug={doc.slug} aside={toc}>
      <article className="doc-page">
        <div className="doc-breadcrumbs"><Link href="/docs">Documentation</Link><span>/</span><span>{doc.section}</span></div>
        <p className="doc-kicker">{doc.section}</p>
        <h1>{doc.title}</h1>
        <p className="doc-description">{doc.description}</p>
        <DocMeta doc={doc} />
        <div className="prose" dangerouslySetInnerHTML={{ __html: doc.html }} />
        <section className="document-control">
          <h2>Document control</h2>
          <dl>
            <div><dt>Owner</dt><dd>{doc.owner}</dd></div>
            <div><dt>Audience</dt><dd>{doc.audience}</dd></div>
            <div><dt>Classification</dt><dd>{doc.classification}</dd></div>
            <div><dt>Applicable version</dt><dd>{doc.applicableVersion}</dd></div>
            <div><dt>Last verified</dt><dd>{doc.lastVerified}</dd></div>
            <div><dt>Next review</dt><dd>{doc.nextReview}</dd></div>
            <div><dt>Source record</dt><dd>{doc.sourcePath}</dd></div>
          </dl>
        </section>
        <nav className="doc-pagination" aria-label="Adjacent documentation">
          {adjacent.previous ? <Link href={`/docs/${adjacent.previous.slug}`}><span>Previous</span><strong>← {adjacent.previous.title}</strong></Link> : <span />}
          {adjacent.next ? <Link href={`/docs/${adjacent.next.slug}`}><span>Next</span><strong>{adjacent.next.title} →</strong></Link> : <span />}
        </nav>
      </article>
    </DocsFrame>
  );
}
