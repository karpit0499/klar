// ============================================================================
// Curated registry of German / DACH employers with PUBLIC ATS boards.
//
// This file is intentionally split into two arrays:
//
//   • ATS_VERIFIED_DE  — every slug here was verified live (HTTP 200 with >0
//     jobs) while writing the original guide. Old-line corporates (Siemens,
//     Allianz, Bayer, VW, banks…) run Workday / SuccessFactors and expose NO
//     public endpoint, so they are deliberately absent — the honest limitation
//     of the ATS layer.
//
//   • ATS_CANDIDATES_DACH — a much larger list of real DACH tech employers that
//     are KNOWN to hire but whose exact ATS vendor + slug we did NOT re-verify
//     by hand. Treat every line as a hypothesis: the slug is a best-guess
//     conventional form and the vendor is a best guess too. A wrong slug simply
//     makes that company show up in the "skipped" count — it never breaks a
//     search (see fetchAllAts, which isolates every failure).
//
// To promote candidates → verified, run the verifier shipped with feature 6:
//     npx tsx scripts/verify-registry.ts
// It probes each triple, prints which are live, and emits ready-to-paste
// verified lines. Delete the dead ones; move the green ones up. Verifying one
// slug against its vendor is a great 'good first issue'.
//
// The app runs ATS_REGISTRY_DE, which is simply the two arrays concatenated,
// so nothing else in the codebase needs to know about the split.
// ============================================================================
import type { SourceId } from '../types'

export type AtsVendor = Extract<SourceId, 'greenhouse' | 'lever' | 'ashby'>
export type AtsEntry = { company: string; ats: AtsVendor; slug: string }

/** Hand-verified employers (live at the time of writing). */
export const ATS_VERIFIED_DE: AtsEntry[] = [
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

/**
 * Candidate employers — REAL DACH companies, but the (vendor, slug) pair is an
 * unverified best guess. Run `npx tsx scripts/verify-registry.ts` to find which
 * are live, then promote them into ATS_VERIFIED_DE and delete the rest.
 */
export const ATS_CANDIDATES_DACH: AtsEntry[] = [
  { company: 'Personio', ats: 'greenhouse', slug: 'personio' }, // candidate — verify
  { company: 'Scalable Capital', ats: 'greenhouse', slug: 'scalablecapital' }, // candidate — verify
  { company: 'Taxfix', ats: 'greenhouse', slug: 'taxfix' }, // candidate — verify
  { company: 'Mambu', ats: 'greenhouse', slug: 'mambu' }, // candidate — verify
  { company: 'sennder', ats: 'greenhouse', slug: 'sennder' }, // candidate — verify
  { company: 'Omio', ats: 'greenhouse', slug: 'omio' }, // candidate — verify
  { company: 'Adjust', ats: 'greenhouse', slug: 'adjust' }, // candidate — verify
  { company: 'Tier Mobility', ats: 'greenhouse', slug: 'tiermobility' }, // candidate — verify
  { company: 'Wandelbots', ats: 'greenhouse', slug: 'wandelbots' }, // candidate — verify
  { company: 'Volocopter', ats: 'greenhouse', slug: 'volocopter' }, // candidate — verify
  { company: 'NavVis', ats: 'greenhouse', slug: 'navvis' }, // candidate — verify
  { company: 'Agile Robots', ats: 'greenhouse', slug: 'agilerobots' }, // candidate — verify
  { company: 'McMakler', ats: 'greenhouse', slug: 'mcmakler' }, // candidate — verify
  { company: 'Wooga', ats: 'greenhouse', slug: 'wooga' }, // candidate — verify
  { company: 'Blinkist', ats: 'greenhouse', slug: 'blinkist' }, // candidate — verify
  { company: 'Kontist', ats: 'greenhouse', slug: 'kontist' }, // candidate — verify
  { company: 'Coachhub', ats: 'greenhouse', slug: 'coachhub' }, // candidate — verify
  { company: 'Sastrify', ats: 'greenhouse', slug: 'sastrify' }, // candidate — verify
  { company: 'Workmotion', ats: 'greenhouse', slug: 'workmotion' }, // candidate — verify
  { company: 'Localyze', ats: 'greenhouse', slug: 'localyze' }, // candidate — verify
  { company: 'Bryter', ats: 'greenhouse', slug: 'bryter' }, // candidate — verify
  { company: 'Everphone', ats: 'greenhouse', slug: 'everphone' }, // candidate — verify
  { company: 'Mister Spex', ats: 'greenhouse', slug: 'misterspex' }, // candidate — verify
  { company: 'Emma', ats: 'greenhouse', slug: 'emmamattress' }, // candidate — verify
  { company: 'Wefox', ats: 'greenhouse', slug: 'wefox' }, // candidate — verify
  { company: 'Simon Kucher', ats: 'greenhouse', slug: 'simonkucher' }, // candidate — verify
  { company: 'Bitpanda', ats: 'greenhouse', slug: 'bitpanda' }, // candidate — verify
  { company: 'GoStudent', ats: 'greenhouse', slug: 'gostudent' }, // candidate — verify
  { company: 'Dynatrace', ats: 'greenhouse', slug: 'dynatrace' }, // candidate — verify
  { company: 'Prewave', ats: 'greenhouse', slug: 'prewave' }, // candidate — verify
  { company: 'Storyblok', ats: 'greenhouse', slug: 'storyblok' }, // candidate — verify
  { company: 'Bikemap', ats: 'greenhouse', slug: 'bikemap' }, // candidate — verify
  { company: 'Frontnow', ats: 'greenhouse', slug: 'frontnow' }, // candidate — verify
  { company: 'Nuki', ats: 'greenhouse', slug: 'nuki' }, // candidate — verify
  { company: 'Anyline', ats: 'greenhouse', slug: 'anyline' }, // candidate — verify
  { company: 'Frontier Car Group', ats: 'greenhouse', slug: 'frontiercargroup' }, // candidate — verify
  { company: 'Infarm', ats: 'greenhouse', slug: 'infarm' }, // candidate — verify
  { company: 'Kraken', ats: 'greenhouse', slug: 'krakenflex' }, // candidate — verify
  { company: 'Depop', ats: 'greenhouse', slug: 'depop' }, // candidate — verify
  { company: 'Mollie', ats: 'greenhouse', slug: 'mollie' }, // candidate — verify
  { company: 'Wise', ats: 'greenhouse', slug: 'wise' }, // candidate — verify
  { company: 'Bird', ats: 'greenhouse', slug: 'bird' }, // candidate — verify
  { company: 'Wire', ats: 'lever', slug: 'wire' }, // candidate — verify
  { company: 'Zeitgold', ats: 'lever', slug: 'zeitgold' }, // candidate — verify
  { company: 'Spryker', ats: 'lever', slug: 'spryker' }, // candidate — verify
  { company: 'Riskmethods', ats: 'lever', slug: 'riskmethods' }, // candidate — verify
  { company: 'Klaus', ats: 'lever', slug: 'klausapp' }, // candidate — verify
  { company: 'Circula', ats: 'lever', slug: 'circula' }, // candidate — verify
  { company: 'Coda', ats: 'lever', slug: 'coda' }, // candidate — verify
  { company: 'Getsafe', ats: 'lever', slug: 'getsafe' }, // candidate — verify
  { company: 'Vimcar', ats: 'lever', slug: 'vimcar' }, // candidate — verify
  { company: 'Alasco', ats: 'lever', slug: 'alasco' }, // candidate — verify
  { company: 'Bunch', ats: 'lever', slug: 'bunch' }, // candidate — verify
  { company: 'Demodesk', ats: 'lever', slug: 'demodesk' }, // candidate — verify
  { company: 'Finoa', ats: 'lever', slug: 'finoa' }, // candidate — verify
  { company: 'Nextmarkets', ats: 'lever', slug: 'nextmarkets' }, // candidate — verify
  { company: 'Penta', ats: 'lever', slug: 'penta' }, // candidate — verify
  { company: 'Roadsurfer', ats: 'lever', slug: 'roadsurfer' }, // candidate — verify
  { company: 'Sqreen', ats: 'lever', slug: 'sqreen' }, // candidate — verify
  { company: 'Tourlane', ats: 'lever', slug: 'tourlane' }, // candidate — verify
  { company: 'Userlane', ats: 'lever', slug: 'userlane' }, // candidate — verify
  { company: 'Zolar', ats: 'lever', slug: 'zolar' }, // candidate — verify
  { company: 'Comato', ats: 'lever', slug: 'comato' }, // candidate — verify
  { company: 'Doctorly', ats: 'lever', slug: 'doctorly' }, // candidate — verify
  { company: 'Everoad', ats: 'lever', slug: 'everoad' }, // candidate — verify
  { company: 'Fernride', ats: 'lever', slug: 'fernride' }, // candidate — verify
  { company: 'Inkitt', ats: 'lever', slug: 'inkitt' }, // candidate — verify
  { company: 'Juniqe', ats: 'lever', slug: 'juniqe' }, // candidate — verify
  { company: 'Krautreporter', ats: 'lever', slug: 'krautreporter' }, // candidate — verify
  { company: 'Luko', ats: 'lever', slug: 'luko' }, // candidate — verify
  { company: 'Medwing', ats: 'lever', slug: 'medwing' }, // candidate — verify
  { company: 'Ottonova', ats: 'lever', slug: 'ottonova' }, // candidate — verify
  { company: 'Peakboard', ats: 'lever', slug: 'peakboard' }, // candidate — verify
  { company: 'Quantco', ats: 'lever', slug: 'quantco' }, // candidate — verify
  { company: 'Recare', ats: 'lever', slug: 'recare' }, // candidate — verify
  { company: 'Sanity Group', ats: 'lever', slug: 'sanitygroup' }, // candidate — verify
  { company: 'Tado', ats: 'lever', slug: 'tado' }, // candidate — verify
  { company: 'Unite', ats: 'lever', slug: 'unite' }, // candidate — verify
  { company: 'Vivid Money', ats: 'lever', slug: 'vividmoney' }, // candidate — verify
  { company: 'Wondros', ats: 'lever', slug: 'wondros' }, // candidate — verify
  { company: 'Xentral', ats: 'lever', slug: 'xentral' }, // candidate — verify
  { company: 'Younium', ats: 'lever', slug: 'younium' }, // candidate — verify
  { company: 'Tacto', ats: 'ashby', slug: 'tacto' }, // candidate — verify
  { company: 'Sereact', ats: 'ashby', slug: 'sereact' }, // candidate — verify
  { company: 'Cradle', ats: 'ashby', slug: 'cradle' }, // candidate — verify
  { company: 'Ivy', ats: 'ashby', slug: 'ivalua' }, // candidate — verify
  { company: 'Merantix', ats: 'ashby', slug: 'merantix' }, // candidate — verify
  { company: 'Luminovo', ats: 'ashby', slug: 'luminovo' }, // candidate — verify
  { company: 'Vellum', ats: 'ashby', slug: 'vellum' }, // candidate — verify
  { company: 'Twin', ats: 'ashby', slug: 'twinlabs' }, // candidate — verify
  { company: 'Rasa', ats: 'ashby', slug: 'rasa' }, // candidate — verify
  { company: 'Jina AI', ats: 'ashby', slug: 'jinaai' }, // candidate — verify
  { company: 'Nyra Health', ats: 'ashby', slug: 'nyrahealth' }, // candidate — verify
  { company: 'Ada Health', ats: 'ashby', slug: 'adahealth' }, // candidate — verify
  { company: 'Kaia Health', ats: 'ashby', slug: 'kaiahealth' }, // candidate — verify
  { company: 'Sanity', ats: 'ashby', slug: 'sanity' }, // candidate — verify
  { company: 'Peec AI', ats: 'ashby', slug: 'peecai' }, // candidate — verify
  { company: 'Cardino', ats: 'ashby', slug: 'cardino' }, // candidate — verify
  { company: 'Circ', ats: 'ashby', slug: 'circ' }, // candidate — verify
  { company: 'Planetly', ats: 'ashby', slug: 'planetly' }, // candidate — verify
  { company: 'Cozero', ats: 'ashby', slug: 'cozero' }, // candidate — verify
  { company: 'Tanso', ats: 'ashby', slug: 'tanso' }, // candidate — verify
  { company: 'Squake', ats: 'ashby', slug: 'squake' }, // candidate — verify
  { company: 'Ostrom', ats: 'ashby', slug: 'ostrom' }, // candidate — verify
  { company: '1Komma5Grad', ats: 'ashby', slug: '1komma5grad' }, // candidate — verify
  { company: 'Aedifion', ats: 'ashby', slug: 'aedifion' }, // candidate — verify
  { company: 'Ineratec', ats: 'ashby', slug: 'ineratec' }, // candidate — verify
  { company: 'Marvel Fusion', ats: 'ashby', slug: 'marvelfusion' }, // candidate — verify
  { company: 'Proxima Fusion', ats: 'ashby', slug: 'proximafusion' }, // candidate — verify
  { company: 'The Exploration Company', ats: 'ashby', slug: 'theexplorationcompany' }, // candidate — verify
  { company: 'Quantum Systems', ats: 'ashby', slug: 'quantumsystems' }, // candidate — verify
  { company: 'Stark Defence', ats: 'ashby', slug: 'starkdefence' }, // candidate — verify
  { company: 'Alpine Eagle', ats: 'ashby', slug: 'alpineeagle' }, // candidate — verify
  { company: 'Swap', ats: 'ashby', slug: 'swap' }, // candidate — verify
  { company: 'Finmid', ats: 'ashby', slug: 'finmid' }, // candidate — verify
  { company: 'Banxware', ats: 'ashby', slug: 'banxware' }, // candidate — verify
  { company: 'Re Cap', ats: 'ashby', slug: 'recap' }, // candidate — verify
  { company: 'Tellimer', ats: 'ashby', slug: 'tellimer' }, // candidate — verify
  { company: 'Bezahl', ats: 'ashby', slug: 'bezahlde' }, // candidate — verify
  { company: 'Payrails', ats: 'ashby', slug: 'payrails' }, // candidate — verify
  { company: 'Formbricks', ats: 'ashby', slug: 'formbricks' }, // candidate — verify
  { company: 'Cal.com', ats: 'ashby', slug: 'calcom' }, // candidate — verify
  { company: 'Novu', ats: 'ashby', slug: 'novu' }, // candidate — verify
  { company: 'Novel', ats: 'ashby', slug: 'novel' }, // candidate — verify
  { company: 'Tibber', ats: 'ashby', slug: 'tibber' }, // candidate — verify
  { company: 'Gigs', ats: 'ashby', slug: 'gigs' }, // candidate — verify
  { company: 'Airfocus', ats: 'ashby', slug: 'airfocus' }, // candidate — verify
  { company: 'Usercentrics', ats: 'ashby', slug: 'usercentrics' }, // candidate — verify
  { company: 'Dateva', ats: 'ashby', slug: 'dateva' }, // candidate — verify
  { company: 'Kadoa', ats: 'ashby', slug: 'kadoa' }, // candidate — verify
  { company: 'Nao', ats: 'ashby', slug: 'naomoney' }, // candidate — verify
  { company: 'Beazy', ats: 'ashby', slug: 'beazy' }, // candidate — verify
  { company: 'Pactos', ats: 'ashby', slug: 'pactos' }, // candidate — verify
  { company: 'Workist', ats: 'ashby', slug: 'workist' }, // candidate — verify
  { company: 'Levity', ats: 'ashby', slug: 'levity' }, // candidate — verify
  { company: 'Semron', ats: 'ashby', slug: 'semron' }, // candidate — verify
  { company: 'Black Semiconductor', ats: 'ashby', slug: 'blacksemiconductor' }, // candidate — verify
  { company: 'Neura Robotics', ats: 'ashby', slug: 'neurarobotics' }, // candidate — verify
  { company: 'Koena', ats: 'ashby', slug: 'koena' }, // candidate — verify
  { company: 'Constructor', ats: 'ashby', slug: 'constructor' }, // candidate — verify
  { company: 'Deepc', ats: 'ashby', slug: 'deepc' }, // candidate — verify
  { company: 'Floy', ats: 'ashby', slug: 'floy' }, // candidate — verify
  { company: 'Vara', ats: 'ashby', slug: 'vara' }, // candidate — verify
  { company: 'Merantix Momentum', ats: 'ashby', slug: 'merantixmomentum' }, // candidate — verify
  { company: 'Spread AI', ats: 'ashby', slug: 'spreadai' }, // candidate — verify
  { company: 'Deeploy', ats: 'ashby', slug: 'deeploy' }, // candidate — verify
  { company: 'Seldon', ats: 'ashby', slug: 'seldon' }, // candidate — verify
  { company: 'Nnaisense', ats: 'ashby', slug: 'nnaisense' }, // candidate — verify
  { company: 'Lakera', ats: 'ashby', slug: 'lakera' }, // candidate — verify
  { company: 'DeepJudge', ats: 'ashby', slug: 'deepjudge' }, // candidate — verify
  { company: 'Unique', ats: 'ashby', slug: 'unique' }, // candidate — verify
  { company: 'Legartis', ats: 'ashby', slug: 'legartis' }, // candidate — verify
  { company: 'Yokoy', ats: 'ashby', slug: 'yokoy' }, // candidate — verify
  { company: 'Ledgy', ats: 'ashby', slug: 'ledgy' }, // candidate — verify
  { company: 'Nezasa', ats: 'ashby', slug: 'nezasa' }, // candidate — verify
  { company: 'Planted', ats: 'ashby', slug: 'planted' }, // candidate — verify
  { company: 'Yova', ats: 'ashby', slug: 'yova' }, // candidate — verify
  { company: 'Frontify', ats: 'ashby', slug: 'frontify' }, // candidate — verify
  { company: 'Bexio', ats: 'ashby', slug: 'bexio' }, // candidate — verify
  { company: 'Beekeeper', ats: 'ashby', slug: 'beekeeper' }, // candidate — verify
  { company: 'On Running', ats: 'ashby', slug: 'onrunning' }, // candidate — verify
  { company: 'Scandit', ats: 'ashby', slug: 'scandit' }, // candidate — verify
]

/**
 * What the app actually fans out over: the verified core plus every candidate.
 * Candidates that 404 cost nothing but a line in the "skipped" tally.
 */
export const ATS_REGISTRY_DE: AtsEntry[] = [...ATS_VERIFIED_DE, ...ATS_CANDIDATES_DACH]