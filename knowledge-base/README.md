# Klar Knowledge Base

The Klar Knowledge Base is the public, governed documentation system for the current Klar implementation. It is designed for students, job seekers, schools, career services, developers, and independent privacy or security reviewers. Markdown is the canonical source, the website is the primary reading experience, and PDF handbooks are controlled public snapshots.

[Open the public knowledge base](https://klar-knowledge-base.kmrarpit2704.chatgpt.site/) · [Browse the canonical Markdown](https://github.com/karpit0499/klar/tree/main/knowledge-base/content) · [Read the Klar license](https://github.com/karpit0499/klar/blob/main/LICENSE)

## Content model

- `content/` contains one Markdown file per governed page.
- Every page carries ownership, audience, classification, lifecycle status, applicable version, and review dates in frontmatter.
- `scripts/build-content.mjs` validates every source page, then emits only pages classified `public` whose status is neither `draft` nor `archived`.
- `app/` and `components/` render the searchable website from that generated index.
- `scripts/export-handbooks.py` creates the controlled PDF bundles in `output/pdf/`.

Do not edit `generated/docs.json` or the downloadable PDF copies by hand. Regenerate them from the Markdown source.

## Local development

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

The local site is available at `http://localhost:3000` by default.

## Validation

```bash
npm run content:build
npm run lint
npm test
```

The production build is part of `npm test`. Content compilation fails for missing control metadata, duplicate slugs, broken internal documentation links, unsupported lifecycle values, or the retired accented spelling of Resume.

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
python3 -m pip install -r requirements-pdf.txt
npm run pdf:build
npm run pdf:verify
```

All three bundles are classified `PUBLIC`. After visual review, copy the verified PDFs from `output/pdf/` into `public/downloads/` so the website distributes the exact approved snapshots.

## Adding or changing a page

1. Start with the contribution and style guidance in `content/contributing-docs.md` and `content/style-guide.md`.
2. State what is current, target, deprecated, or historical; never turn planning material into implementation fact.
3. Explain purpose, contracts, invariants, ownership, and verification evidence at the useful level. Avoid line-by-line narration that will immediately become stale.
4. Use `Resume` in all English product copy, code-facing names, and documentation. German user content may use `Lebenslauf`.
5. Run the complete validation set before requesting review.

## Public deployment

The site is packaged and published publicly through the configured Sites project. `.openai/hosting.json` records the project binding and must stay aligned with the deployed site. The knowledge base has no form for uploading application documents, personal information, credentials, secrets, or diagnostic archives.

Run the complete site build immediately before packaging a release. After deployment, compare every public PDF download with its reviewed `public/downloads/` source so a stale build artifact cannot silently replace an approved handbook.
