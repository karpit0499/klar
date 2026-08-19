import type { DocRecord } from "../lib/docs";

function statusClass(status: string): string {
  const value = status.toLowerCase();
  const allowed = new Set([
    "current",
    "approved",
    "target",
    "planned",
    "draft",
    "deprecated",
    "historical",
    "archived",
  ]);
  if (allowed.has(value)) return value;
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
