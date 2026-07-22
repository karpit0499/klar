// ============================================================================
// Job-description keyword extraction + résumé↔JD coverage (feature 13), also
// used by the tailored-résumé generator (feature 12) to mirror a posting's
// exact terminology.
//
// Approach: a curated dictionary of hard skills / technologies (each with its
// common aliases and a canonical spelling) is matched against the JD text. We
// ALSO surface the candidate's own multi-word skills when they appear verbatim
// in the posting. This yields clean, meaningful terms — "Kubernetes", "dbt",
// "BigQuery" — instead of the noise a bag-of-words keyword count produces.
// Everything is pure + deterministic → unit-testable with no network.
// ============================================================================
import type { NormalizedJob, Profile } from '../types'

/** canonical → alias spellings (all matched case- and boundary-insensitively). */
export const SKILL_DICTIONARY: Record<string, string[]> = {
  Python: ['python'],
  SQL: ['sql'],
  Java: ['java'],
  JavaScript: ['javascript', 'js'],
  TypeScript: ['typescript', 'ts'],
  // Do not include bare "go": product postings use "go-live" and "go-to-market"
  // constantly, which would create a false programming-language gap.
  Go: ['golang', 'go lang', 'go programming language', 'go developer', 'go engineer'],
  Rust: ['rust'],
  Scala: ['scala'],
  R: ['r language', 'r programming'],
  'C++': ['c++', 'cpp'],
  Kubernetes: ['kubernetes', 'k8s'],
  Docker: ['docker'],
  Terraform: ['terraform'],
  Ansible: ['ansible'],
  'CI/CD': ['ci/cd', 'ci cd', 'continuous integration', 'continuous delivery'],
  'GitHub Actions': ['github actions'],
  GitLab: ['gitlab'],
  AWS: ['aws', 'amazon web services'],
  GCP: ['gcp', 'google cloud', 'google cloud platform'],
  Azure: ['azure', 'microsoft azure'],
  BigQuery: ['bigquery', 'big query'],
  Snowflake: ['snowflake'],
  Redshift: ['redshift'],
  Databricks: ['databricks'],
  Spark: ['spark', 'apache spark', 'pyspark'],
  Hadoop: ['hadoop'],
  Kafka: ['kafka', 'apache kafka'],
  Airflow: ['airflow', 'apache airflow'],
  dbt: ['dbt', 'data build tool'],
  Dataflow: ['dataflow'],
  'Pub/Sub': ['pub/sub', 'pubsub'],
  PostgreSQL: ['postgresql', 'postgres'],
  MySQL: ['mysql'],
  MongoDB: ['mongodb', 'mongo'],
  Redis: ['redis'],
  Elasticsearch: ['elasticsearch', 'elastic search'],
  'Machine Learning': ['machine learning', 'ml'],
  'Deep Learning': ['deep learning'],
  NLP: ['nlp', 'natural language processing'],
  'Computer Vision': ['computer vision', 'cv'],
  TensorFlow: ['tensorflow', 'tf'],
  PyTorch: ['pytorch', 'torch'],
  'scikit-learn': ['scikit-learn', 'sklearn', 'scikit learn'],
  Keras: ['keras'],
  XGBoost: ['xgboost'],
  Pandas: ['pandas'],
  NumPy: ['numpy'],
  'Vertex AI': ['vertex ai', 'vertex'],
  SageMaker: ['sagemaker', 'sage maker'],
  MLflow: ['mlflow'],
  MLOps: ['mlops'],
  LLM: ['llm', 'large language model', 'large language models'],
  RAG: ['rag', 'retrieval augmented generation', 'retrieval-augmented generation'],
  'Vector Database': ['vector database', 'vector db', 'vector search', 'pinecone', 'weaviate'],
  Transformers: ['transformers', 'hugging face', 'huggingface'],
  LoRA: ['lora', 'peft'],
  React: ['react', 'react.js', 'reactjs'],
  'Node.js': ['node.js', 'nodejs', 'node js'],
  REST: ['rest', 'rest api', 'restful'],
  GraphQL: ['graphql'],
  gRPC: ['grpc'],
  Microservices: ['microservices', 'micro-services'],
  Tableau: ['tableau'],
  'Power BI': ['power bi', 'powerbi'],
  Looker: ['looker', 'looker studio'],
  Git: ['git'],
  Linux: ['linux'],
  Bash: ['bash', 'shell scripting'],
  Agile: ['agile', 'scrum'],
  'A/B Testing': ['a/b testing', 'ab testing', 'a/b test'],
  Statistics: ['statistics', 'statistical'],
  ETL: ['etl', 'elt'],
  'Data Engineering': ['data engineering'],
  'Data Science': ['data science'],
  'Feature Engineering': ['feature engineering'],
  'Time Series': ['time series', 'time-series'],
  Recommender: ['recommender', 'recommendation system', 'recommendation systems'],
}

/** Escape a string for safe use inside a RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Does `text` contain `phrase` as a whole word/phrase? We anchor on
 * alphanumeric boundaries so "go" doesn't match "algorithm"/"goal" and "SQL"
 * doesn't match "NoSQL", while symbols inside a term (c++, ci/cd, node.js) are
 * part of the literal. Boundaries are non-alphanumeric only, so a trailing
 * period or comma ("Terraform.") never blocks a match.
 */
export function containsTerm(text: string, phrase: string): boolean {
  const p = phrase.toLowerCase().trim()
  if (!p) return false
  const re = new RegExp('(^|[^a-z0-9])' + escapeRe(p) + '([^a-z0-9]|$)', 'i')
  return re.test(text.toLowerCase())
}

/** Canonicalize any spelling to its dictionary key, or null if unknown. */
export function canonicalizeSkill(name: string): string | null {
  const n = name.toLowerCase().trim()
  for (const [canon, aliases] of Object.entries(SKILL_DICTIONARY)) {
    if (canon.toLowerCase() === n) return canon
    if (aliases.some((a) => a === n)) return canon
  }
  return null
}

/**
 * Extract the meaningful skill/technology terms a posting asks for. Returns
 * canonical spellings, de-duplicated, in dictionary order. `extra` lets the
 * caller fold in the candidate's own skills that appear verbatim in the JD.
 */
export function extractJdTerms(job: NormalizedJob, extra: string[] = []): string[] {
  const text = `${job.title}\n${job.description}`
  const found = new Set<string>()

  for (const [canon, aliases] of Object.entries(SKILL_DICTIONARY)) {
    const searchable = canon === 'Go' ? aliases : [canon, ...aliases]
    if (searchable.some((term) => containsTerm(text, term))) found.add(canon)
  }
  // Also honor multi-word profile skills that appear literally in the posting
  // but aren't in our dictionary (e.g. a niche tool the user listed).
  for (const s of extra) {
    if (s.trim().length >= 3 && !canonicalizeSkill(s) && containsTerm(text, s)) {
      found.add(s.trim())
    }
  }
  // Preserve dictionary order for stable output; append extras after.
  const dictOrder = Object.keys(SKILL_DICTIONARY).filter((k) => found.has(k))
  const extras = [...found].filter((f) => !SKILL_DICTIONARY[f])
  return [...dictOrder, ...extras]
}

/** Which of the profile's skills (canonicalized where possible) the user has. */
export function profileSkillSet(profile: Profile): Set<string> {
  const set = new Set<string>()
  for (const s of profile.skills) {
    const canon = canonicalizeSkill(s.name)
    set.add((canon ?? s.name).toLowerCase())
  }
  return set
}

export type CoverageReport = {
  covered: string[]      // JD terms the profile already demonstrates
  missing: string[]      // JD terms the profile is missing
  total: number          // covered + missing
  coveredCount: number
  ratio: number          // coveredCount / total, 0–1 (1 when the JD has no terms)
  summary: string        // e.g. "6/9 covered — missing: Kubernetes, dbt, Terraform"
}

/**
 * Feature 13: compare a résumé's skills to a posting's key terms and report
 * exactly what's covered and what's missing — making the tailored-résumé output
 * explainable rather than a black-box rewrite.
 */
export function coverageReport(job: NormalizedJob, profile: Profile): CoverageReport {
  const terms = extractJdTerms(job, profile.skills.map((s) => s.name))
  const have = profileSkillSet(profile)
  // Confirmed profiles intentionally do not retain the raw résumé text. Build a
  // safe backstop corpus from reviewed structured facts when rawText is absent.
  const rawText = (profile.rawText ?? [
    profile.summary,
    ...profile.titles.map((item) => item.title),
    ...profile.skills.map((item) => item.name),
    ...profile.domains,
    ...profile.education.flatMap((item) => [item.degree, item.field, item.institution]),
    ...profile.certifications,
  ].filter(Boolean).join(' ')).toLowerCase()

  const covered: string[] = []
  const missing: string[] = []
  for (const term of terms) {
    const canonLower = term.toLowerCase()
    const aliases = SKILL_DICTIONARY[term] ?? [canonLower]
    const known =
      have.has(canonLower) ||
      aliases.some((a) => have.has(a)) ||
      // Backstop: the term appears in the résumé free text even if not a listed skill.
      [term, ...aliases].some((a) => containsTerm(rawText, a))
    if (known) covered.push(term)
    else missing.push(term)
  }

  const total = terms.length
  const coveredCount = covered.length
  const ratio = total === 0 ? 1 : coveredCount / total
  const summary =
    total === 0
      ? 'No specific skills detected in this posting.'
      : `${coveredCount}/${total} covered` +
        (missing.length ? ` — missing: ${missing.join(', ')}` : ' — full coverage')

  return { covered, missing, total, coveredCount, ratio, summary }
}