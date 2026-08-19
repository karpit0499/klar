import {
  ATS_CANDIDATES_DACH,
  ATS_DIRECT_RUNTIME_DE,
  ATS_RETIRED_DACH,
  type AtsEntry,
} from '../registry.de'
import { ATS_CACHE_EXPANSION_DE } from './catalog.v261'

/** Operator/cache-ingestion catalog. This module is intentionally not imported by the app runtime. */
export const ATS_ALL_VERIFIED_DE: AtsEntry[] = [
  ...ATS_DIRECT_RUNTIME_DE,
  ...ATS_CACHE_EXPANSION_DE,
]

export const ATS_SOURCE_CATALOG_DE: AtsEntry[] = [
  ...ATS_ALL_VERIFIED_DE,
  ...ATS_CANDIDATES_DACH,
  ...ATS_RETIRED_DACH,
]
