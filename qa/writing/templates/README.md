# Bilingual human writing review

The JSON files in this folder are deliberately incomplete collection
templates, not example results. Their false confirmations and empty rows ensure
they produce `HOLD` until real people complete the work.

1. Freeze at least 40 outputs: 10 recruiter messages and 10 cover letters in
   each of English and German. Use only synthetic, licensed, or consented and
   anonymized source material.
2. Inventory every factual claim and link the frozen evidence. Compute each
   evidence, sample, and manifest SHA-256 with the helpers in
   `qa/writing/humanReview.ts`.
3. Keep the provider/generator mapping outside the review bundle. Give the two
   professionally bilingual human reviewers separate copies. Use opaque IDs;
   keep their real identities separately.
4. The reviewers work independently and see neither the variant mapping nor the
   other review. They judge every sample and every claim, and add any claim the
   inventory missed.
5. Only after both submissions are locked may the human adjudicator compare
   them. Map each required source claim exactly once across the final claims;
   duplicate or missing mappings block release. Resolve and categorize every
   difference, including a change to cited evidence when the support label is
   unchanged. Unsupported and unclear claims both block release.
6. Freeze the training manifest and complete exact-hash and near-duplicate
   checks. Evaluation examples and near-duplicates must not be in training or
   prompt examples.
7. Run `npx tsx scripts/writing/human-gate.ts` with the four completed files.

Machine ratings, synthetic/test fixtures, missing rows, non-bilingual
reviewers, unblinded variants, data leakage, and unresolved conflicts can never
produce `PASS`.