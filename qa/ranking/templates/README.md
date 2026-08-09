# Human ranking gate evidence

These are deliberately incomplete collection templates, not example results.
They cannot pass the release gate until real people complete the work.

1. Build and lock an anonymized corpus with at least six job families, English
   and German postings, three candidate seniority bands, and 50 jobs per
   candidate scenario. Before blinding, inventory every explicit posting
   requirement with a stable `requirementId`, exact text and source fragment.
   Every included posting needs at least one reviewed requirement. Compute the
   candidate-profile, job-snapshot and requirement-inventory SHA-256 values
   with the helper exported by `qa/ranking/humanReview.ts`. Each requirement
   source fragment must occur in the frozen posting title or description.
2. Give reviewer A and reviewer B separate, score-free copies. Both reviewers
   must be human, professionally competent in English and German, and blind to
   the other reviewer's answers until their files are locked.
3. Collect a 0–3 relevance label, exactly one judgment for each of the eight
   eligibility keys, and exactly one judgment for every frozen requirement.
   Record required/preferred priority, candidate-evidence links, seniority and
   rationale for every job. Candidate-evidence paths must resolve to non-empty
   leaves of the frozen `Profile` (for example `skills.0.name`); invented or
   object-level paths are rejected. Collect every requested pairwise judgment.
4. Only then create the adjudication file. Resolve and categorize every label,
   per-key constraint, requirement priority/judgment/evidence, seniority and
   pairwise disagreement. The final arrays must cover the same exact keys and
   requirement IDs. AI suggestions are never gold labels.
5. Run `npx tsx scripts/ranking/human-gate.ts` with the four completed files.

Never put synthetic labels into these files or mark a test fixture as
`human_release`. The harness rejects both.
