import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(new URL(pathname, "http://kb.example"), {
      headers: {
        accept: "text/html",
        host: "kb.example",
        "x-forwarded-host": "kb.example",
        "x-forwarded-proto": "https",
      },
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const target = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) return markdownFiles(target);
    return entry.name.endsWith(".md") ? [target] : [];
  }));
  return files.flat();
}

test("renders the finished Klar knowledge-base home", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Klar Knowledge Base<\/title>/i);
  assert.match(html, /Understand Klar/);
  assert.match(html, /Build it with confidence/);
  assert.match(html, /Public knowledge with a status/);
  assert.match(html, /Students and job seekers/);
  assert.match(html, /Schools and career services/);
  assert.match(html, /Developers and technical reviewers/);
  assert.match(html, /Privacy and security reviewers/);
  assert.match(html, /https:\/\/klar-knowledge-base\.kmrarpit2704\.chatgpt\.site/);
  assert.match(html, /\/og\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("renders governed Markdown as a controlled documentation page", async () => {
  const response = await render("/docs/getting-started");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Getting Started/);
  assert.match(html, /Document control/);
  assert.match(html, /Applicable version/);
  assert.match(html, /2\.6\.0\.1/);
  assert.match(html, /Documentation table of contents/i);
  assert.match(html, /rel="canonical" href="https:\/\/klar-knowledge-base\.kmrarpit2704\.chatgpt\.site\/docs\/getting-started"/i);
  assert.match(html, /property="og:url" content="https:\/\/klar-knowledge-base\.kmrarpit2704\.chatgpt\.site\/docs\/getting-started"/i);
});

test("emits only public documentation in publishable lifecycle states", async () => {
  const docs = JSON.parse(await readFile(new URL("../generated/docs.json", import.meta.url), "utf8"));
  const publishableStatuses = new Set(["current", "approved", "target", "planned", "deprecated", "historical"]);
  assert.ok(docs.length >= 1, "expected at least one public documentation page");
  for (const doc of docs) {
    assert.equal(doc.classification, "public", `${doc.slug} must be public`);
    assert.ok(publishableStatuses.has(doc.status), `${doc.slug} has non-publishable status ${doc.status}`);
  }
});

test("publishes discovery metadata for every emitted page", async () => {
  const docs = JSON.parse(await readFile(new URL("../generated/docs.json", import.meta.url), "utf8"));
  const robotsResponse = await render("/robots.txt");
  assert.equal(robotsResponse.status, 200);
  const robots = await robotsResponse.text();
  assert.match(robots, /Allow: \/\s/i);
  assert.match(robots, /Sitemap: https:\/\/klar-knowledge-base\.kmrarpit2704\.chatgpt\.site\/sitemap\.xml/i);

  const sitemapResponse = await render("/sitemap.xml");
  assert.equal(sitemapResponse.status, 200);
  const sitemap = await sitemapResponse.text();
  for (const doc of docs) {
    assert.match(sitemap, new RegExp(`<loc>https://klar-knowledge-base\\.kmrarpit2704\\.chatgpt\\.site/docs/${doc.slug}</loc>`));
  }
});

test("keeps canonical documentation free of the retired accented Resume spelling", async () => {
  const files = await markdownFiles(new URL("../content/", import.meta.url));
  assert.ok(files.length >= 1, "expected at least one governed Markdown page");
  const retired = /r(?:\u00e9|e\u0301)sum(?:\u00e9|e\u0301)/iu;
  for (const file of files) {
    const content = await readFile(file, "utf8");
    assert.doesNotMatch(content, retired, path.basename(file.pathname));
  }
});
