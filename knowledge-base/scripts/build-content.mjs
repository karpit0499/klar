import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT_ROOT = path.join(ROOT, "content");
const OUTPUT_ROOT = path.join(ROOT, "generated");
const OUTPUT_FILE = path.join(OUTPUT_ROOT, "docs.json");
const PUBLIC_ROOT = path.join(ROOT, "public");
const SEARCH_FILE = path.join(PUBLIC_ROOT, "search-index.json");
const REQUIRED_FIELDS = [
  "title",
  "description",
  "section",
  "order",
  "audience",
  "status",
  "classification",
  "applicable_version",
  "owner",
  "last_verified",
  "next_review",
  "tags",
];
const STATUS_VALUES = new Set(["current", "approved", "target", "planned", "draft", "deprecated", "historical", "archived"]);
const PUBLICATION_STATUS_VALUES = new Set(["current", "approved", "target", "planned", "deprecated", "historical"]);
const CLASSIFICATION_VALUES = new Set(["public", "internal", "confidential", "restricted"]);
const LEGACY_RESUME = /r(?:\u00e9|e\u0301)sum(?:\u00e9|e\u0301)/iu;

function validIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stringValue(value, fallback = "") {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function arrayValue(value) {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (!value) return [];
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(absolute);
    return entry.isFile() && entry.name.endsWith(".md") ? [absolute] : [];
  }));
  return nested.flat();
}

function textOnly(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_|~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});
md.use(anchor, { slugify, permalink: false });

const defaultTableOpen = md.renderer.rules.table_open ?? (() => "<table>");
const defaultTableClose = md.renderer.rules.table_close ?? (() => "</table>");
md.renderer.rules.table_open = (...args) => `<div class="table-scroll">${defaultTableOpen(...args)}`;
md.renderer.rules.table_close = (...args) => `${defaultTableClose(...args)}</div>`;
const files = await markdownFiles(CONTENT_ROOT);
const seenSlugs = new Map();
const docs = [];
const sourceBySlug = new Map();

for (const file of files.sort()) {
  const raw = await readFile(file, "utf8");
  const parsed = matter(raw);
  const relative = path.relative(CONTENT_ROOT, file).replaceAll(path.sep, "/");
  const missing = REQUIRED_FIELDS.filter((field) => parsed.data[field] === undefined || parsed.data[field] === null || parsed.data[field] === "");
  if (missing.length) throw new Error(`Document ${relative} is missing required metadata: ${missing.join(", ")}.`);
  const status = stringValue(parsed.data.status).toLowerCase();
  const classification = stringValue(parsed.data.classification).toLowerCase();
  if (!STATUS_VALUES.has(status)) throw new Error(`Document ${relative} has unsupported status '${status}'.`);
  if (!CLASSIFICATION_VALUES.has(classification)) throw new Error(`Document ${relative} has unsupported classification '${classification}'.`);
  const lastVerified = stringValue(parsed.data.last_verified);
  const nextReview = stringValue(parsed.data.next_review);
  if (!validIsoDate(lastVerified)) throw new Error(`Document ${relative} has an invalid last_verified date.`);
  if (!validIsoDate(nextReview)) throw new Error(`Document ${relative} has an invalid next_review date.`);
  if (nextReview < lastVerified) throw new Error(`Document ${relative} has next_review before last_verified.`);
  if (LEGACY_RESUME.test(raw)) throw new Error(`Document ${relative} uses the retired accented Resume spelling.`);
  const order = Number(parsed.data.order);
  if (!Number.isInteger(order) || order < 1) throw new Error(`Document ${relative} has a non-positive or non-integer order.`);
  const tags = arrayValue(parsed.data.tags).map((tag) => tag.trim()).filter(Boolean);
  if (!tags.length) throw new Error(`Document ${relative} must have at least one tag.`);
  const inferredSlug = path.basename(file, ".md").replace(/^\d+-/, "");
  const slug = slugify(parsed.data.slug ?? inferredSlug);
  if (!slug) throw new Error(`Document ${relative} has no usable slug.`);
  if (seenSlugs.has(slug)) {
    throw new Error(`Duplicate document slug '${slug}' in ${seenSlugs.get(slug)} and ${relative}.`);
  }
  seenSlugs.set(slug, relative);
  sourceBySlug.set(slug, { content: parsed.content, sourcePath: relative });

  const content = parsed.content.replace(/^\s*#\s+[^\n]+\n+/, "");
  const tokens = md.parse(content, {});
  const headings = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== "heading_open") continue;
    const level = Number(token.tag.slice(1));
    if (level < 2 || level > 3) continue;
    const inline = tokens[index + 1];
    const text = inline?.content?.trim();
    if (!text) continue;
    headings.push({ level, text, id: slugify(text) });
  }

  const title = stringValue(parsed.data.title, inferredSlug.replaceAll("-", " "));
  const description = stringValue(parsed.data.description, textOnly(parsed.content).slice(0, 180));
  docs.push({
    slug,
    title,
    description,
    section: stringValue(parsed.data.section, "Reference"),
    order,
    audience: arrayValue(parsed.data.audience).join(" · "),
    status,
    classification,
    applicableVersion: stringValue(parsed.data.applicable_version, "2.6.1"),
    owner: stringValue(parsed.data.owner, "Repository maintainer"),
    lastVerified,
    nextReview,
    tags,
    sourcePath: relative,
    headings,
    html: md.render(content),
    searchText: `${title} ${description} ${arrayValue(parsed.data.tags).join(" ")} ${textOnly(content)}`,
  });
}

const seenSectionOrder = new Map();
for (const doc of docs) {
  const key = `${doc.section}\u0000${doc.order}`;
  const previous = seenSectionOrder.get(key);
  if (previous) throw new Error(`Documents '${previous}' and '${doc.slug}' share order ${doc.order} in section '${doc.section}'.`);
  seenSectionOrder.set(key, doc.slug);
}

const knownSlugs = new Set(docs.map((doc) => doc.slug));
for (const [sourceSlug, source] of sourceBySlug) {
  const links = source.content.matchAll(/\]\(\/docs\/([a-z0-9-]+)(?:#([^)]+))?\)/g);
  for (const link of links) {
    if (!knownSlugs.has(link[1])) {
      throw new Error(`Document '${sourceSlug}' (${source.sourcePath}) links to missing page '/docs/${link[1]}'.`);
    }
    if (link[2]) {
      const target = docs.find((doc) => doc.slug === link[1]);
      const fragments = new Set(target?.headings.map((heading) => heading.id));
      if (!fragments.has(decodeURIComponent(link[2]))) {
        throw new Error(`Document '${sourceSlug}' (${source.sourcePath}) links to missing fragment '/docs/${link[1]}#${link[2]}'.`);
      }
    }
  }
  const assets = source.content.matchAll(/\]\((\/(?!docs\/)[^?#)]+)(?:[?#][^)]*)?\)/g);
  for (const asset of assets) {
    const relativeAsset = decodeURIComponent(asset[1]).replace(/^\/+/, "");
    await access(path.join(PUBLIC_ROOT, relativeAsset)).catch(() => {
      throw new Error(`Document '${sourceSlug}' (${source.sourcePath}) links to missing asset '${asset[1]}'.`);
    });
  }
}

const publishedDocs = docs.filter(
  (doc) => doc.classification === "public" && PUBLICATION_STATUS_VALUES.has(doc.status),
);
const publishedSlugs = new Set(publishedDocs.map((doc) => doc.slug));
for (const doc of publishedDocs) {
  const source = sourceBySlug.get(doc.slug);
  const links = source.content.matchAll(/\]\(\/docs\/([a-z0-9-]+)(?:#[^)]+)?\)/g);
  for (const link of links) {
    if (!publishedSlugs.has(link[1])) {
      throw new Error(
        `Public document '${doc.slug}' links to non-published page '/docs/${link[1]}'. ` +
        "Publish the target with classification 'public' and a non-draft, non-archived status, or remove the link.",
      );
    }
  }
}

publishedDocs.sort((left, right) =>
  left.section.localeCompare(right.section) ||
  left.order - right.order ||
  left.title.localeCompare(right.title),
);

await mkdir(OUTPUT_ROOT, { recursive: true });
await mkdir(PUBLIC_ROOT, { recursive: true });
await writeFile(OUTPUT_FILE, `${JSON.stringify(publishedDocs, null, 2)}\n`, "utf8");
await writeFile(SEARCH_FILE, `${JSON.stringify(publishedDocs.map(({
  slug, title, description, section, status, searchText,
}) => ({ slug, title, description, section, status, searchText })), null, 2)}\n`, "utf8");
console.log(`Validated ${docs.length} governed sources and published ${publishedDocs.length} public knowledge-base pages.`);
