import type { Metadata } from "next";
import { DocsFrame } from "../../components/DocsFrame";
import { groupedDocs } from "../../lib/docs";

export const metadata: Metadata = {
  title: "Documentation",
  description: "The complete Klar knowledge-base table of contents.",
  alternates: { canonical: "/docs" },
  openGraph: {
    title: "Documentation · Klar Knowledge Base",
    description: "The complete public Klar knowledge-base table of contents.",
    url: "/docs",
  },
};

export default function DocumentationIndex() {
  const handbooks = [
    {
      title: "Product and User Handbook",
      detail: "Public · product intent and complete user guidance",
      href: "/downloads/klar-kb-product-user-v2.6.0.1.pdf",
    },
    {
      title: "Engineering and Architecture Handbook",
      detail: "Public · system, data, discovery, AI, platform, and change guidance",
      href: "/downloads/klar-kb-engineering-architecture-v2.6.0.1.pdf",
    },
    {
      title: "Security, Operations, and Governance Handbook",
      detail: "Public · controls, release evidence, runbooks, decisions, and risks",
      href: "/downloads/klar-kb-assurance-operations-v2.6.0.1.pdf",
    },
  ];

  return (
    <DocsFrame>
      <div className="index-hero">
        <span className="eyebrow"><span /> COMPLETE TABLE OF CONTENTS</span>
        <h1>Documentation</h1>
        <p>Browse Klar by product purpose, user task, system responsibility, or assurance need.</p>
      </div>
      <section className="handbook-panel" aria-labelledby="handbook-heading">
        <div className="handbook-heading">
          <div>
            <span className="eyebrow"><span /> CONTROLLED SNAPSHOTS</span>
            <h2 id="handbook-heading">Download the handbooks</h2>
          </div>
          <p>The live site is authoritative. Every PDF is a public snapshot and records its release baseline, generation date, classification, and public-content hash for offline review.</p>
        </div>
        <div className="handbook-grid">
          {handbooks.map((handbook) => (
            <a key={handbook.href} href={handbook.href} download>
              <span>PDF</span>
              <strong>{handbook.title}</strong>
              <small>{handbook.detail}</small>
              <b>Download snapshot ↓</b>
            </a>
          ))}
        </div>
      </section>
      <div className="doc-index">
        {groupedDocs().map((group, index) => (
          <section key={group.section}>
            <div className="doc-index-heading"><span>{String(index + 1).padStart(2, "0")}</span><h2>{group.section}</h2></div>
            <div className="doc-index-grid">
              {group.docs.map((doc) => (
                <a key={doc.slug} href={`/docs/${doc.slug}`}>
                  <div><span>{doc.status}</span><span>{doc.audience}</span></div>
                  <h3>{doc.title}</h3>
                  <p>{doc.description}</p>
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>
    </DocsFrame>
  );
}
