import type { DocRecord } from "../lib/docs";

function statusClass(status: string): string {
  const value = status.toLowerCase();
  if (value.includes("current") || value.includes("approved")) return "current";
  if (value.includes("target") || value.includes("planned")) return "target";
  if (value.includes("deprecated")) return "deprecated";
  if (value.includes("historical") || value.includes("archived")) return "historical";
  return "draft";
}

export function DocMeta({ doc }: { doc: DocRecord }) {
  return (
    <div className="doc-meta" aria-label="Document control information">
      <span className={`status-pill ${statusClass(doc.status)}`}>{doc.status}</span>
      <span>Applies to {doc.applicableVersion}</span>
      <span>{doc.classification}</span>
      <span>Verified {doc.lastVerified}</span>
    </div>
  );
}
