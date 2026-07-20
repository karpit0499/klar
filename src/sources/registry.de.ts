// ============================================================================
// Curated registry of German / DACH employers with PUBLIC ATS boards.
// EVERY entry below was verified live (HTTP 200 with >0 jobs) while writing
// this guide. Old-line corporates (Siemens, Allianz, Bayer, VW, banks…) run
// Workday / SuccessFactors and expose NO public endpoint, so they are
// deliberately absent — the honest limitation of the ATS layer.
//
// Adding an employer is a great 'good first issue': verify one slug against
// its vendor, then append a line here.
// ============================================================================
import type { SourceId } from '../types'

export type AtsVendor = Extract<SourceId, 'greenhouse' | 'lever' | 'ashby'>
export type AtsEntry = { company: string; ats: AtsVendor; slug: string }

export const ATS_REGISTRY_DE: AtsEntry[] = [
  { company: 'Aleph Alpha', ats: 'ashby', slug: 'alephalpha' }, // ~8 live jobs at verification
  { company: 'Amboss', ats: 'ashby', slug: 'amboss' }, // ~16 live jobs at verification
  { company: 'Babbel', ats: 'ashby', slug: 'babbel' }, // ~2 live jobs at verification
  { company: 'Billie', ats: 'ashby', slug: 'billie' }, // ~2 live jobs at verification
  { company: 'Camunda', ats: 'ashby', slug: 'camunda' }, // ~31 live jobs at verification
  { company: 'Choco', ats: 'ashby', slug: 'choco' }, // ~10 live jobs at verification
  { company: 'Clark', ats: 'ashby', slug: 'clark' }, // ~18 live jobs at verification
  { company: 'Cosuno', ats: 'ashby', slug: 'cosuno' }, // ~15 live jobs at verification
  { company: 'DeepL', ats: 'ashby', slug: 'deepl' }, // ~22 live jobs at verification
  { company: 'Deepset', ats: 'ashby', slug: 'deepsetai' }, // ~2 live jobs at verification
  { company: 'Enpal', ats: 'ashby', slug: 'enpal' }, // ~334 live jobs at verification
  { company: 'Flink', ats: 'ashby', slug: 'flink' }, // ~2 live jobs at verification
  { company: 'Forto', ats: 'ashby', slug: 'forto' }, // ~15 live jobs at verification
  { company: 'Kombo', ats: 'ashby', slug: 'kombo' }, // ~15 live jobs at verification
  { company: 'Langfuse', ats: 'ashby', slug: 'langfuse' }, // ~8 live jobs at verification
  { company: 'Moss', ats: 'ashby', slug: 'moss' }, // ~33 live jobs at verification
  { company: 'Nelly', ats: 'ashby', slug: 'nelly' }, // ~22 live jobs at verification
  { company: 'Pleo', ats: 'ashby', slug: 'pleo' }, // ~49 live jobs at verification
  { company: 'Pliant', ats: 'ashby', slug: 'pliant' }, // ~41 live jobs at verification
  { company: 'Statista', ats: 'ashby', slug: 'statista' }, // ~50 live jobs at verification
  { company: 'Zenjob', ats: 'ashby', slug: 'zenjob' }, // ~16 live jobs at verification
  { company: 'Celonis', ats: 'greenhouse', slug: 'celonis' }, // ~232 live jobs at verification
  { company: 'Commercetools', ats: 'greenhouse', slug: 'commercetools' }, // ~18 live jobs at verification
  { company: 'Contentful', ats: 'greenhouse', slug: 'contentful' }, // ~28 live jobs at verification
  { company: 'Flaconi', ats: 'greenhouse', slug: 'flaconi' }, // ~13 live jobs at verification
  { company: 'FlixBus', ats: 'greenhouse', slug: 'flix' }, // ~140 live jobs at verification
  { company: 'Free Now', ats: 'greenhouse', slug: 'freenow' }, // ~47 live jobs at verification
  { company: 'GetYourGuide', ats: 'greenhouse', slug: 'getyourguide' }, // ~59 live jobs at verification
  { company: 'Grafana', ats: 'greenhouse', slug: 'grafanalabs' }, // ~114 live jobs at verification
  { company: 'Grover', ats: 'greenhouse', slug: 'grover' }, // ~10 live jobs at verification
  { company: 'HelloFresh', ats: 'greenhouse', slug: 'hellofresh' }, // ~373 live jobs at verification
  { company: 'Helsing', ats: 'greenhouse', slug: 'helsing' }, // ~123 live jobs at verification
  { company: 'IONOS', ats: 'greenhouse', slug: 'ionos' }, // ~28 live jobs at verification
  { company: 'Isar Aerospace', ats: 'greenhouse', slug: 'isaraerospace' }, // ~91 live jobs at verification
  { company: 'Konux', ats: 'greenhouse', slug: 'konux' }, // ~4 live jobs at verification
  { company: 'N26', ats: 'greenhouse', slug: 'n26' }, // ~77 live jobs at verification
  { company: 'Parloa', ats: 'greenhouse', slug: 'parloa' }, // ~57 live jobs at verification
  { company: 'Raisin', ats: 'greenhouse', slug: 'raisin' }, // ~32 live jobs at verification
  { company: 'Remote', ats: 'greenhouse', slug: 'remotecom' }, // ~235 live jobs at verification
  { company: 'Solaris', ats: 'greenhouse', slug: 'solarisbank' }, // ~28 live jobs at verification
  { company: 'SumUp', ats: 'greenhouse', slug: 'sumup' }, // ~381 live jobs at verification
  { company: 'Trade Republic', ats: 'greenhouse', slug: 'traderepublic' }, // ~1 live jobs at verification
  { company: 'Trivago', ats: 'greenhouse', slug: 'trivago' }, // ~8 live jobs at verification
  { company: 'Vay', ats: 'greenhouse', slug: 'vay' }, // ~15 live jobs at verification
  { company: 'Aircall', ats: 'lever', slug: 'aircall' }, // ~78 live jobs at verification
  { company: 'Finn', ats: 'lever', slug: 'finn' }, // ~42 live jobs at verification
  { company: 'Qonto', ats: 'lever', slug: 'qonto' }, // ~51 live jobs at verification
]