import assert from "node:assert/strict";
import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "out");
const BASE_PATH = "/klar/kb";
const SITE_URL = "https://karpit0499.github.io/klar/kb";

async function rendered(pathname = "/") {
  const clean = pathname.replace(/^\/+|\/+$/g, "");
  const file = clean ? path.join(OUT, clean, "index.html") : path.join(OUT, "index.html");
  return readFile(file, "utf8");
}

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(target);
    return entry.name.endsWith(".md") ? [target] : [];
  }));
  return nested.flat();
}

test("exports the finished Klar knowledge-base home", async () => {
  const html = await rendered();
  assert.match(html, /<title>Klar Knowledge Base<\/title>/i);
  assert.match(html, /Understand Klar/);
  assert.match(html, /Build it with confidence/);
  assert.match(html, /Public knowledge with a status/);
  assert.match(html, new RegExp(SITE_URL.replaceAll("/", "\\/")));
  assert.doesNotMatch(html, /chatgpt\.site|codex-preview|Your site is taking shape/i);
});

test("exports governed Markdown with GitHub Pages canonical metadata", async () => {
  const html = await rendered("/docs/getting-started");
  assert.match(html, /Getting Started/);
  assert.match(html, /Document control/);
  assert.match(html, /Applicable version/);
  assert.match(html, new RegExp(`rel="canonical" href="${SITE_URL}/docs/getting-started/?"`, "i"));
  assert.match(html, new RegExp(`property="og:url" content="${SITE_URL}/docs/getting-started/?"`, "i"));
});

test("keeps the full-text corpus out of every initial page payload", async () => {
  const home = await stat(path.join(OUT, "index.html"));
  const doc = await stat(path.join(OUT, "docs", "getting-started", "index.html"));
  const index = JSON.parse(await readFile(path.join(OUT, "search-index.json"), "utf8"));
  assert.ok(home.size < 100_000, `home HTML is ${home.size} bytes`);
  assert.ok(doc.size < 150_000, `documentation HTML is ${doc.size} bytes`);
  assert.equal(index.length, 38);
  assert.ok(index.every((item) => typeof item.searchText === "string" && !("html" in item)));
});

test("keeps German umlaut and digraph search forms equivalent", async () => {
  const source = await readFile(path.join(ROOT, "components", "SearchBox.tsx"), "utf8");
  assert.match(source, /\.replace\(\/ä\/g, "ae"\)/);
  assert.match(source, /\.replace\(\/ö\/g, "oe"\)/);
  assert.match(source, /\.replace\(\/ü\/g, "ue"\)/);
  assert.match(source, /\.replace\(\/ß\/g, "ss"\)/);
});

test("keeps the social preview at the unfurl dimensions and byte budget", async () => {
  const sourcePath = path.join(ROOT, "public", "og.png");
  const exportedPath = path.join(OUT, "og.png");
  const [source, exported, metadata] = await Promise.all([
    readFile(sourcePath),
    readFile(exportedPath),
    stat(sourcePath),
  ]);
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.deepEqual(source.subarray(0, 8), pngSignature, "og.png must remain PNG");
  assert.equal(source.readUInt32BE(16), 1200, "og.png width");
  assert.equal(source.readUInt32BE(20), 630, "og.png height");
  assert.ok(metadata.size < 300_000, `og.png is ${metadata.size} bytes`);
  assert.deepEqual(exported, source, "the static export must copy the reviewed social preview exactly");
});

test("emits only public documentation in publishable lifecycle states", async () => {
  const docs = JSON.parse(await readFile(path.join(ROOT, "generated", "docs.json"), "utf8"));
  const publishable = new Set(["current", "approved", "target", "planned", "deprecated", "historical"]);
  assert.ok(docs.length >= 1);
  for (const doc of docs) {
    assert.equal(doc.classification, "public", `${doc.slug} must be public`);
    assert.ok(publishable.has(doc.status), `${doc.slug} has non-publishable status ${doc.status}`);
  }
});

test("publishes Pages-aware robots and sitemap metadata", async () => {
  const docs = JSON.parse(await readFile(path.join(ROOT, "generated", "docs.json"), "utf8"));
  const robots = await readFile(path.join(OUT, "robots.txt"), "utf8");
  assert.match(robots, /Allow: \/klar\/kb\//i);
  assert.match(robots, /Sitemap: https:\/\/karpit0499\.github\.io\/klar\/kb\/sitemap\.xml/i);
  const sitemap = await readFile(path.join(OUT, "sitemap.xml"), "utf8");
  for (const doc of docs) assert.match(sitemap, new RegExp(`<loc>${SITE_URL}/docs/${doc.slug}</loc>`));
});

test("prefixes every internal absolute link and exports its target", async () => {
  const htmlFiles = (await walk(OUT)).filter((file) => file.endsWith(".html"));
  for (const file of htmlFiles) {
    const html = await readFile(file, "utf8");
    assert.doesNotMatch(html, /(?:href|src)="\/(?:docs|downloads|_next)\//, file);
    for (const match of html.matchAll(/(?:href|src)="(\/klar\/kb\/[^"?#]*)(?:[?#][^"]*)?"/g)) {
      const relative = match[1].slice(BASE_PATH.length).replace(/^\//, "");
      const candidates = relative.endsWith("/")
        ? [path.join(OUT, relative, "index.html")]
        : [path.join(OUT, relative), path.join(OUT, relative, "index.html")];
      let found = false;
      for (const candidate of candidates) {
        try { await access(candidate); found = true; break; } catch { /* try next */ }
      }
      assert.ok(found, `${path.relative(OUT, file)} has missing target ${match[1]}`);
    }
  }
});

test("keeps canonical documentation free of the retired accented Resume spelling", async () => {
  const files = await markdownFiles(path.join(ROOT, "content"));
  const retired = /(?:r(?:é|e\u0301)sum(?:é|e\u0301)|resum(?:é|e\u0301))/iu;
  for (const file of files) assert.doesNotMatch(await readFile(file, "utf8"), retired, path.basename(file));
});

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  }));
  return nested.flat();
}
