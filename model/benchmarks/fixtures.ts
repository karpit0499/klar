import type {
  BenchmarkFixture,
  BenchmarkLanguage,
  BenchmarkTask,
  JsonSchema,
} from './types.ts'

const stringArray = {
  type: 'array',
  items: { type: 'string' },
} as const

const SCHEMAS: Record<BenchmarkTask, JsonSchema> = {
  extraction: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      company: { type: 'string' },
      requiredSkills: stringArray,
      preferredSkills: stringArray,
    },
    required: ['title', 'company', 'requiredSkills', 'preferredSkills'],
    additionalProperties: false,
  },
  evidence_linking: {
    type: 'object',
    properties: {
      links: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            requirementId: { type: 'string' },
            evidenceId: { type: ['string', 'null'] },
            rationale: { type: 'string' },
          },
          required: ['requirementId', 'evidenceId', 'rationale'],
          additionalProperties: false,
        },
      },
    },
    required: ['links'],
    additionalProperties: false,
  },
  normalization: {
    type: 'object',
    properties: {
      normalizedTitle: { type: 'string' },
      occupationFamily: { type: 'string' },
      city: { type: 'string' },
      countryCode: { type: 'string' },
      remoteMode: {
        type: 'string',
        enum: ['onsite', 'hybrid', 'remote', 'unknown'],
      },
    },
    required: [
      'normalizedTitle',
      'occupationFamily',
      'city',
      'countryCode',
      'remoteMode',
    ],
    additionalProperties: false,
  },
  resume_expression: {
    type: 'object',
    properties: {
      bullets: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            evidenceId: { type: 'string' },
            text: { type: 'string' },
          },
          required: ['evidenceId', 'text'],
          additionalProperties: false,
        },
      },
    },
    required: ['bullets'],
    additionalProperties: false,
  },
  cover_letter: {
    type: 'object',
    properties: {
      subject: { type: 'string' },
      body: { type: 'string' },
      evidenceIds: stringArray,
    },
    required: ['subject', 'body', 'evidenceIds'],
    additionalProperties: false,
  },
  recruiter_message: {
    type: 'object',
    properties: {
      message: { type: 'string' },
      evidenceIds: stringArray,
    },
    required: ['message', 'evidenceIds'],
    additionalProperties: false,
  },
}

const SYSTEM: Record<BenchmarkLanguage, string> = {
  en: [
    'Return exactly one JSON object that matches the supplied schema.',
    'Use only the facts in the prompt. Never invent evidence, employers, dates,',
    'credentials, responsibilities, metrics, or experience. Do not use Markdown.',
  ].join(' '),
  de: [
    'Gib genau ein JSON-Objekt zurück, das dem vorgegebenen Schema entspricht.',
    'Verwende ausschließlich Fakten aus der Eingabe. Erfinde keine Nachweise,',
    'Arbeitgeber, Daten, Abschlüsse, Aufgaben, Kennzahlen oder Erfahrung.',
    'Verwende kein Markdown.',
  ].join(' '),
}

const fixtures: BenchmarkFixture[] = [
  {
    id: 'extraction-en-01',
    task: 'extraction',
    language: 'en',
    system: SYSTEM.en,
    user: [
      'JOB POSTING',
      'Company: Northstar Logistics GmbH',
      'Title: Data Operations Analyst',
      'Required: SQL and Python.',
      'Preferred: Tableau.',
      'Do not infer any other skill.',
    ].join('\n'),
    schema: SCHEMAS.extraction,
    expected: {
      exact: {
        title: 'Data Operations Analyst',
        company: 'Northstar Logistics GmbH',
      },
      requiredSkills: ['SQL', 'Python'],
      preferredSkills: ['Tableau'],
      forbiddenStrings: ['Power BI', 'AWS', 'Fortune 500'],
    },
  },
  {
    id: 'extraction-de-01',
    task: 'extraction',
    language: 'de',
    system: SYSTEM.de,
    user: [
      'STELLENANZEIGE',
      'Unternehmen: Nordstern Logistik GmbH',
      'Titel: Datenanalyst Produktion',
      'Erforderlich: SQL und Python.',
      'Wünschenswert: Tableau.',
      'Leite keine weiteren Kenntnisse ab.',
    ].join('\n'),
    schema: SCHEMAS.extraction,
    expected: {
      exact: {
        title: 'Datenanalyst Produktion',
        company: 'Nordstern Logistik GmbH',
      },
      requiredSkills: ['SQL', 'Python'],
      preferredSkills: ['Tableau'],
      forbiddenStrings: ['Power BI', 'AWS', 'Fortune 500'],
    },
  },
  {
    id: 'evidence-en-01',
    task: 'evidence_linking',
    language: 'en',
    system: SYSTEM.en,
    user: [
      'REQUIREMENTS',
      'req-sql: SQL',
      'req-sap: SAP',
      'RESUME EVIDENCE',
      'exp-01: Built SQL quality checks for 180 daily orders.',
      'Link each requirement. Use null when the resume has no support.',
    ].join('\n'),
    schema: SCHEMAS.evidence_linking,
    expected: {
      evidenceLinks: {
        'req-sql': 'exp-01',
        'req-sap': null,
      },
      allowedEvidenceIds: ['exp-01'],
      forbiddenStrings: ['exp-02', 'SAP implementation', '15 years'],
    },
  },
  {
    id: 'evidence-de-01',
    task: 'evidence_linking',
    language: 'de',
    system: SYSTEM.de,
    user: [
      'ANFORDERUNGEN',
      'req-sql: SQL',
      'req-sap: SAP',
      'LEBENSLAUF-NACHWEISE',
      'exp-01: SQL-Qualitätsprüfungen für 180 tägliche Aufträge erstellt.',
      'Verknüpfe jede Anforderung. Nutze null, wenn kein Nachweis vorhanden ist.',
    ].join('\n'),
    schema: SCHEMAS.evidence_linking,
    expected: {
      evidenceLinks: {
        'req-sql': 'exp-01',
        'req-sap': null,
      },
      allowedEvidenceIds: ['exp-01'],
      forbiddenStrings: ['exp-02', 'SAP-Einführung', '15 Jahre'],
    },
  },
  {
    id: 'normalization-en-01',
    task: 'normalization',
    language: 'en',
    system: SYSTEM.en,
    user: [
      'Normalize this record without adding facts.',
      'Raw title: Sr. Data Analyst (m/f/d)',
      'Raw location: Berlin, Germany',
      'Work arrangement: Hybrid, three office days per week',
    ].join('\n'),
    schema: SCHEMAS.normalization,
    expected: {
      exact: {
        normalizedTitle: 'Senior Data Analyst',
        occupationFamily: 'Data Analytics',
        city: 'Berlin',
        countryCode: 'DE',
        remoteMode: 'hybrid',
      },
      forbiddenStrings: ['Munich'],
    },
  },
  {
    id: 'normalization-de-01',
    task: 'normalization',
    language: 'de',
    system: SYSTEM.de,
    user: [
      'Normalisiere diesen Datensatz, ohne Fakten hinzuzufügen.',
      'Rohtitel: Senior Datenanalyst (m/w/d)',
      'Rohstandort: Berlin, Deutschland',
      'Arbeitsmodell: Hybrid, drei Bürotage pro Woche',
    ].join('\n'),
    schema: SCHEMAS.normalization,
    expected: {
      exact: {
        normalizedTitle: 'Senior Data Analyst',
        occupationFamily: 'Data Analytics',
        city: 'Berlin',
        countryCode: 'DE',
        remoteMode: 'hybrid',
      },
      forbiddenStrings: ['München'],
    },
  },
  {
    id: 'resume-en-01',
    task: 'resume_expression',
    language: 'en',
    system: SYSTEM.en,
    user: [
      'TARGET REQUIREMENT: Improve operational reporting quality.',
      'VERIFIED EVIDENCE',
      'exp-01: Reduced reporting defects by 23% by adding SQL quality checks',
      'across 180 daily orders.',
      'Write one concise resume bullet. Preserve both numbers and cite exp-01.',
    ].join('\n'),
    schema: SCHEMAS.resume_expression,
    expected: {
      requiredStrings: ['23%', '180'],
      requiredEvidenceIds: ['exp-01'],
      allowedEvidenceIds: ['exp-01'],
      forbiddenStrings: ['Fortune 500', 'managed a team', '€1M'],
    },
  },
  {
    id: 'resume-de-01',
    task: 'resume_expression',
    language: 'de',
    system: SYSTEM.de,
    user: [
      'ZIELANFORDERUNG: Qualität des operativen Reportings verbessern.',
      'VERIFIZIERTER NACHWEIS',
      'exp-01: Reportingfehler durch SQL-Qualitätsprüfungen bei 180 täglichen',
      'Aufträgen um 23 % reduziert.',
      'Schreibe einen prägnanten Lebenslaufpunkt. Erhalte beide Zahlen und nenne exp-01.',
    ].join('\n'),
    schema: SCHEMAS.resume_expression,
    expected: {
      requiredStrings: ['23', '180'],
      requiredEvidenceIds: ['exp-01'],
      allowedEvidenceIds: ['exp-01'],
      forbiddenStrings: ['Fortune 500', 'Team geleitet', '1 Mio. €'],
    },
  },
  {
    id: 'cover-en-01',
    task: 'cover_letter',
    language: 'en',
    system: SYSTEM.en,
    user: [
      'Write a short cover letter for Northstar Logistics.',
      'ROLE: Data Operations Analyst',
      'VERIFIED EVIDENCE',
      'exp-01: Reduced reporting defects by 23% with SQL quality checks.',
      'exp-02: Built a Tableau dashboard used by 12 planners.',
      'Return the evidence IDs used.',
    ].join('\n'),
    schema: SCHEMAS.cover_letter,
    expected: {
      requiredStrings: ['Northstar Logistics', '23%', '12'],
      requiredEvidenceIds: ['exp-01', 'exp-02'],
      allowedEvidenceIds: ['exp-01', 'exp-02'],
      forbiddenStrings: ['Fortune 500', '15 years', 'managed a team'],
    },
  },
  {
    id: 'cover-de-01',
    task: 'cover_letter',
    language: 'de',
    system: SYSTEM.de,
    user: [
      'Schreibe ein kurzes Anschreiben für Nordstern Logistik.',
      'ROLLE: Datenanalyst Produktion',
      'VERIFIZIERTE NACHWEISE',
      'exp-01: Reportingfehler durch SQL-Qualitätsprüfungen um 23 % reduziert.',
      'exp-02: Tableau-Dashboard für 12 Planerinnen und Planer erstellt.',
      'Gib die verwendeten Nachweis-IDs zurück.',
    ].join('\n'),
    schema: SCHEMAS.cover_letter,
    expected: {
      requiredStrings: ['Nordstern Logistik', '23', '12'],
      requiredEvidenceIds: ['exp-01', 'exp-02'],
      allowedEvidenceIds: ['exp-01', 'exp-02'],
      forbiddenStrings: ['Fortune 500', '15 Jahre', 'Team geleitet'],
    },
  },
  {
    id: 'recruiter-en-01',
    task: 'recruiter_message',
    language: 'en',
    system: SYSTEM.en,
    user: [
      'Write a recruiter message under 500 characters.',
      'ROLE: Data Operations Analyst at Northstar Logistics.',
      'VERIFIED EVIDENCE',
      'exp-01: Reduced reporting defects by 23% with SQL quality checks.',
      'Return the evidence IDs used.',
    ].join('\n'),
    schema: SCHEMAS.recruiter_message,
    expected: {
      requiredStrings: ['Northstar Logistics', '23%'],
      requiredEvidenceIds: ['exp-01'],
      allowedEvidenceIds: ['exp-01'],
      forbiddenStrings: ['Fortune 500', '15 years', 'managed a team'],
    },
  },
  {
    id: 'recruiter-de-01',
    task: 'recruiter_message',
    language: 'de',
    system: SYSTEM.de,
    user: [
      'Schreibe eine Recruiter-Nachricht mit höchstens 500 Zeichen.',
      'ROLLE: Datenanalyst Produktion bei Nordstern Logistik.',
      'VERIFIZIERTER NACHWEIS',
      'exp-01: Reportingfehler durch SQL-Qualitätsprüfungen um 23 % reduziert.',
      'Gib die verwendeten Nachweis-IDs zurück.',
    ].join('\n'),
    schema: SCHEMAS.recruiter_message,
    expected: {
      requiredStrings: ['Nordstern Logistik', '23'],
      requiredEvidenceIds: ['exp-01'],
      allowedEvidenceIds: ['exp-01'],
      forbiddenStrings: ['Fortune 500', '15 Jahre', 'Team geleitet'],
    },
  },
]

export const BENCHMARK_FIXTURES = Object.freeze(fixtures)

export function fixtureFor(
  task: BenchmarkTask,
  language: BenchmarkLanguage,
): BenchmarkFixture {
  const fixture = BENCHMARK_FIXTURES.find(
    (candidate) => candidate.task === task && candidate.language === language,
  )
  if (!fixture) throw new Error(`Missing benchmark fixture for ${task}/${language}.`)
  return fixture
}

export function schemaForTask(task: BenchmarkTask): JsonSchema {
  return SCHEMAS[task]
}