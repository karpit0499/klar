import rawDocs from "../generated/docs.json";

export type DocHeading = {
  level: number;
  text: string;
  id: string;
};

export type DocRecord = {
  slug: string;
  title: string;
  description: string;
  section: string;
  order: number;
  audience: string;
  status: string;
  classification: string;
  applicableVersion: string;
  owner: string;
  lastVerified: string;
  nextReview: string;
  tags: string[];
  sourcePath: string;
  headings: DocHeading[];
  html: string;
  searchText: string;
};

export type DocSearchItem = Pick<
  DocRecord,
  "slug" | "title" | "description" | "section" | "status" | "searchText"
>;

const docs = rawDocs as DocRecord[];

const SECTION_ORDER = [
  "Product",
  "User Guide",
  "Architecture",
  "Data",
  "Discovery",
  "Application Preparation",
  "AI and Models",
  "Platform",
  "Security and Privacy",
  "Engineering",
  "Quality and Operations",
  "Decisions and Roadmap",
  "Governance",
  "Knowledge Base",
  "Reference",
];

export function allDocs(): DocRecord[] {
  return docs;
}

export function docBySlug(slug: string): DocRecord | undefined {
  return docs.find((doc) => doc.slug === slug);
}

export function groupedDocs(): Array<{ section: string; docs: DocRecord[] }> {
  const groups = new Map<string, DocRecord[]>();
  for (const doc of docs) {
    const sectionDocs = groups.get(doc.section) ?? [];
    sectionDocs.push(doc);
    groups.set(doc.section, sectionDocs);
  }
  return [...groups.entries()]
    .map(([section, sectionDocs]) => ({
      section,
      docs: [...sectionDocs].sort((left, right) => left.order - right.order || left.title.localeCompare(right.title)),
    }))
    .sort((left, right) => {
      const leftIndex = SECTION_ORDER.indexOf(left.section);
      const rightIndex = SECTION_ORDER.indexOf(right.section);
      if (leftIndex === -1 && rightIndex === -1) return left.section.localeCompare(right.section);
      if (leftIndex === -1) return 1;
      if (rightIndex === -1) return -1;
      return leftIndex - rightIndex;
    });
}

export function searchItems(): DocSearchItem[] {
  return docs.map(({ slug, title, description, section, status, searchText }) => ({
    slug,
    title,
    description,
    section,
    status,
    searchText,
  }));
}

export function adjacentDocs(slug: string): { previous?: DocRecord; next?: DocRecord } {
  const ordered = groupedDocs().flatMap((group) => group.docs);
  const index = ordered.findIndex((doc) => doc.slug === slug);
  if (index < 0) return {};
  return { previous: ordered[index - 1], next: ordered[index + 1] };
}
