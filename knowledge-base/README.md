# Klar Knowledge Base

The Klar Knowledge Base is the public, governed documentation system for the current Klar implementation. It is designed for students, job seekers, schools, career services, developers, and independent privacy or security reviewers. Markdown is the canonical source, the website is the primary reading experience, and PDF handbooks are controlled public snapshots.

[Open the public knowledge base](https://karpit0499.github.io/klar/kb/) · [Browse the canonical Markdown](https://github.com/karpit0499/klar/tree/main/knowledge-base/content) · [Read the Klar license](https://github.com/karpit0499/klar/blob/main/LICENSE)

## Content model

- `content/` contains one Markdown file per governed page.
- Every page carries ownership, audience, classification, lifecycle status, applicable version, and review dates in frontmatter.
- `scripts/build-content.mjs` validates every source page, then emits only pages classified `public` whose status is neither `draft` nor `archived`.
- `app/` and `components/` render a Next.js static export from that generated index.
- `public/search-index.json` is generated as a separately loaded search corpus so every page does not embed the full KB.
- `scripts/export-handbooks.py` creates the controlled PDF bundles in `output/pdf/`.

Do not edit `generated/docs.json` or the downloadable PDF copies by hand. Regenerate them from the Markdown source.

## Local development

Requires Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

The local site is available at `http://localhost:3000` by default.

## Validation

```bash
npm run content:build
npm run typecheck
npm run lint
npm run build
npm test
```

Use `npm run qa` for the combined content, type, lint, static-build, and rendered-output gate. Content compilation fails for missing control metadata, duplicate slugs, broken internal documentation links, unsupported lifecycle values, or the retired accented spelling of Resume.

The v2.6.1 handbook binaries are generated artifacts rather than committed source files. On a fresh checkout, install the hash-locked PDF dependencies and run `npm run pdf:repro` plus `npm run pdf:verify` before `npm run qa`; the reproducibility gate first rebuilds the governed public-content index, then builds twice and requires byte-identical output. The static-export tests require every advertised `/downloads/` target to exist and match its verified source. The deployment workflow uses this same order.

## Public publication gate

Publication is fail closed:

- Every Markdown source is validated even when it will not be published.
- Only `classification: public` pages with `current`, `approved`, `target`, `planned`, `deprecated`, or `historical` status enter `generated/docs.json` and the public site.
- `draft`, `archived`, `internal`, `confidential`, and `restricted` material stays out of site navigation, search, sitemaps, and PDF exports.
- A published page may link only to another published documentation page. A link to hidden or non-existent documentation stops the build.
- PDF content hashes cover only the public source pages represented in the published index.

The package remains marked `private: true` to prevent accidental publication to the npm registry. That setting does not make the deployed website private.

## PDF handbooks

Install the pinned PDF dependencies, then build and verify the three controlled handbooks:

```bash
python3 -m pip install --require-hashes -r requirements-pdf.txt
npm run pdf:repro
npm run pdf:verify
```

All three bundles are classified `PUBLIC`. The exporter writes each controlled file to `output/pdf/` and its downloadable copy to `public/downloads/`; the verifier requires those copies to be byte-identical. Render and visually review every page before publication. The verifier rejects blank pages, invalid page counts, relative production links, missing document language/title metadata, and stale public copies. The HTML site remains the accessible authority while tagged-PDF evidence is on HOLD.

## Adding or changing a page

1. Start with the contribution and style guidance in `content/contributing-docs.md` and `content/style-guide.md`.
2. State what is current, target, deprecated, or historical; never turn planning material into implementation fact.
3. Explain purpose, contracts, invariants, ownership, and verification evidence at the useful level. Avoid line-by-line narration that will immediately become stale.
4. Use `Resume` in all English product copy, code-facing names, and documentation. German user content may use `Lebenslauf`.
5. Run the complete validation set before requesting review.

## Public deployment

The repository's **Verify and deploy Klar** workflow builds the application and KB from the same reviewed commit, assembles one GitHub Pages artifact, and publishes:

- the Klar application at `/klar/`; and
- the Next static KB export at `/klar/kb/`.

The KB build uses `NEXT_PUBLIC_KB_BASE_PATH=/klar/kb` and `NEXT_PUBLIC_KB_SITE_URL=https://karpit0499.github.io/klar/kb`. Canonicals, Open Graph metadata, sitemaps, internal routes, assets, downloads, and the lazy search index must all retain that base path. The root application service worker deliberately passes `/klar/kb/` through rather than treating documentation as application-shell traffic.

Do not restore `.openai/hosting.json`, the retired Sites/Vinext/Vite layer, or a ChatGPT Sites canonical. Do not manually deploy a local `out/` directory. Pull requests run the same build and artifact checks without publishing; a push to `main` deploys only after the verified artifact is complete. The knowledge base has no form for uploading application documents, personal information, credentials, secrets, or diagnostic archives.

After deployment, crawl the GitHub Pages routes, compare every public PDF download with its reviewed `public/downloads/` source, and verify the published release metadata so a stale artifact cannot silently replace an approved handbook.
