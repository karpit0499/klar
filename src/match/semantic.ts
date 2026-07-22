// ============================================================================
// Semantic pre-filter (feature 1.4). A drop-in alternative to the keyword
// pre-filter: embed the candidate query (profile + preferences) and each job,
// then rank by cosine similarity. Job vectors are cached in IndexedDB so a
// re-run is instant and correct — only unseen jobs get embedded.
//
// The core ranking (scoreBySimilarity) is pure and takes an embedder, so it's
// unit-testable without a database. semanticPrefilter adds the Dexie cache and
// the same hard drops (dealbreakers / remote-only) the keyword pre-filter uses.
// ============================================================================
import type { NormalizedJob, Preferences, Profile } from '../types'
import { cosineSim, defaultEmbedder, type TextEmbedder } from './embeddings'
import type { VectorRow } from '../db/db'
import { getVectors, putVectors } from '../storage/careerData'

/** The text we embed for a job (title carries the strongest signal). */
export function jobText(job: NormalizedJob): string {
  return [job.title, job.title, job.company, job.description.slice(0, 2000)].join('\n')
}

/** The query text we embed from the candidate's own profile + preferences. */
export function buildQueryText(profile: Profile, prefs: Preferences): string {
  return [
    ...prefs.targetTitles,
    ...profile.titles.map((t) => t.title),
    ...profile.skills.map((s) => s.name),
    ...prefs.mustHaves,
    ...profile.domains,
  ]
    .filter(Boolean)
    .join('\n')
}

export type Scored = { job: NormalizedJob; score: number }

/** Rank jobs by cosine similarity to the query. Pure — embeds inline, no cache. */
export function scoreBySimilarity(
  jobs: NormalizedJob[],
  profile: Profile,
  prefs: Preferences,
  embedder: TextEmbedder = defaultEmbedder,
): Scored[] {
  const queryVec = embedder.embed(buildQueryText(profile, prefs))
  return jobs
    .map((job) => ({ job, score: cosineSim(queryVec, embedder.embed(jobText(job))) }))
    .sort((a, b) => b.score - a.score)
}

/** Hard drops shared with the keyword pre-filter (dealbreakers + remote-only). */
function survivesHardDrops(job: NormalizedJob, prefs: Preferences): boolean {
  if (prefs.remoteOnly && !job.location.remote) return false
  if (prefs.dealbreakers.length) {
    const hay = `${job.title} ${job.company} ${job.description}`.toLowerCase()
    if (prefs.dealbreakers.some((d) => d.trim() && hay.includes(d.toLowerCase()))) return false
  }
  return true
}

/**
 * The semantic counterpart to `prefilter`: applies hard drops, ranks the rest by
 * cosine similarity (using the cached vectors), and returns the top `limit`.
 */
export async function semanticPrefilter(
  jobs: NormalizedJob[],
  profile: Profile,
  prefs: Preferences,
  limit: number,
  embedder: TextEmbedder = defaultEmbedder,
): Promise<NormalizedJob[]> {
  const survivors = jobs.filter((j) => survivesHardDrops(j, prefs))
  const queryVec = embedder.embed(buildQueryText(profile, prefs))
  const scored: Scored[] = []
  const cached = await getVectors(survivors.map((job) => job.id))
  const freshRows: VectorRow[] = []
  survivors.forEach((job, index) => {
    const row = cached[index]
    const vec = row && row.embedderId === embedder.id && row.dim === embedder.dim
      ? row.vec
      : embedder.embed(jobText(job))
    if (!row || row.embedderId !== embedder.id || row.dim !== embedder.dim) {
      freshRows.push({ jobId: job.id, embedderId: embedder.id, dim: embedder.dim, vec })
    }
    scored.push({ job, score: cosineSim(queryVec, vec) })
  })
  await putVectors(freshRows)
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((s) => s.job)
}