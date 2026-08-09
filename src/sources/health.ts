import { db, type ConnectorHealthRow } from '../db/db'
import type { SourceStatus } from './types'

const SOURCE_URLS: Partial<Record<SourceStatus['source'], string>> = {
  ba: 'https://rest.arbeitsagentur.de/',
  arbeitnow: 'https://www.arbeitnow.com/',
  adzuna: 'https://www.adzuna.de/',
  ats: 'https://github.com/karpit0499/klar/blob/main/src/sources/ats/index.ts',
}

const CONFIDENCE: Partial<Record<
  SourceStatus['source'],
  NonNullable<SourceStatus['extractionConfidence']>
>> = {
  ba: 'published',
  arbeitnow: 'published',
  adzuna: 'published',
  ats: 'structured',
}

export function initialSourceStatus(
  source: SourceStatus['source'],
  patch: Pick<SourceStatus, 'ok' | 'count'> & Partial<SourceStatus>,
): SourceStatus {
  return {
    source,
    requested: true,
    ok: patch.ok,
    count: patch.count,
    fetchedAt: patch.fetchedAt ?? new Date().toISOString(),
    sourceUrl: patch.sourceUrl ?? SOURCE_URLS[source] ?? 'https://github.com/karpit0499/klar',
    extractionConfidence: patch.extractionConfidence ?? CONFIDENCE[source] ?? 'unknown',
    duplicateFamilies: patch.duplicateFamilies ?? 0,
    lastSuccessfulRefresh: patch.lastSuccessfulRefresh,
    note: patch.note,
    error: patch.error,
  }
}

export async function persistCareerSourceHealth(
  statuses: SourceStatus[],
): Promise<SourceStatus[]> {
  return Promise.all(statuses.map(async (status) => {
    const connectorId = `career:${status.source}`
    const previous = await db.connectorHealth.get(connectorId)
    const fetchedAt = status.fetchedAt ?? new Date().toISOString()
    const lastSuccessfulRefresh = status.ok
      ? fetchedAt
      : previous?.lastSuccessAt
    const row: ConnectorHealthRow = {
      connectorId,
      scope: 'career',
      consecutiveFailures: status.ok ? 0 : (previous?.consecutiveFailures ?? 0) + 1,
      successes: (previous?.successes ?? 0) + (status.ok ? 1 : 0),
      failures: (previous?.failures ?? 0) + (status.ok ? 0 : 1),
      schemaFailures: previous?.schemaFailures ?? 0,
      lastFetchedAt: fetchedAt,
      lastFailureAt: status.ok ? previous?.lastFailureAt : fetchedAt,
      lastSuccessAt: lastSuccessfulRefresh,
      lastVerifiedAt: fetchedAt,
      lastLatencyMs: previous?.lastLatencyMs,
      sourceUrl: status.sourceUrl,
      extractionConfidence: status.extractionConfidence,
      openedAt: previous?.openedAt,
      cooldownUntil: previous?.cooldownUntil,
      killed: previous?.killed ?? false,
    }
    await db.connectorHealth.put(row)
    return { ...status, lastSuccessfulRefresh }
  }))
}

export async function listCareerSourceHealth(): Promise<ConnectorHealthRow[]> {
  return (await db.connectorHealth.toArray())
    .filter((row) => row.scope === 'career' || row.connectorId.startsWith('career:'))
    .sort((a, b) => a.connectorId.localeCompare(b.connectorId))
}