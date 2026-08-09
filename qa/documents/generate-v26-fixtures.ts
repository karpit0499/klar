import { Packer } from 'docx'
import { unzipSync } from 'fflate'
import {
  mkdir,
  readdir,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import {
  coverLetterDocument,
  createCoverLetterModel,
  inspectCoverLetterDocx,
} from '../../src/application/coverLetterDocx'
import { applicationPacketZip } from '../../src/packets/download'
import {
  ARTIFACT_GENERATOR_CONTRACTS,
  currentArtifactProvenance,
} from '../../src/packets/types'
import { normalizeResume } from '../../src/resume/canonical'
import {
  RESUME_LAB_PRESETS,
  parsePackedResumeDocx,
  resumeLabDocument,
} from '../../src/resume/designLab'
import type { ResumeLanguage } from '../../src/resume/types'
import type { NormalizedJob } from '../../src/types'

const outputValue = process.argv[2]
if (!outputValue || process.argv.length !== 3) {
  throw new Error('Usage: npx tsx qa/documents/generate-v26-fixtures.ts <output-directory>')
}
const output = path.resolve(outputValue)
await mkdir(output, { recursive: true, mode: 0o700 })

const resume = normalizeResume({
  contact: {
    name: 'Alex Example',
    email: 'alex@example.invalid',
    phone: '+49 30 555 0100',
    location: 'Berlin, Germany',
    links: [{ label: 'Portfolio', url: 'https://example.invalid/alex' }],
  },
  summary: 'Industrial engineer and data analyst who translates operational questions into practical reporting, process changes, and documented decisions.',
  experience: [
    {
      title: 'Operations Data Analyst',
      company: 'Example Manufacturing GmbH',
      city: 'Berlin',
      start: '01/2024',
      current: true,
      bullets: [
        'Built weekly SQL and Power BI reporting for production and logistics reviews.',
        'Documented metric definitions with planning, quality, and operations partners.',
        'Mapped a recurring handoff problem and tested a clearer escalation workflow.',
        'Prepared decision notes that separated verified findings from open questions.',
      ],
    },
    {
      title: 'Industrial Engineering Working Student',
      company: 'Sample Systems AG',
      city: 'Potsdam',
      start: '04/2022',
      end: '12/2023',
      bullets: [
        'Maintained Excel planning models for capacity and material-flow discussions.',
        'Supported time-study documentation and reviewed inconsistent source records.',
        'Created a simple dashboard for weekly backlog and throughput conversations.',
      ],
    },
    {
      title: 'Operations Intern',
      company: 'Demonstration Logistics SE',
      city: 'Leipzig',
      start: '07/2021',
      end: '12/2021',
      bullets: [
        'Compared process observations with standard work documentation.',
        'Organized workshop findings and follow-up actions for the project team.',
      ],
    },
  ],
  education: [{
    degree: 'MSc',
    field: 'Industrial Engineering',
    institution: 'Example University',
    city: 'Berlin',
    start: '10/2021',
    end: '12/2023',
  }],
  skills: [
    { group: 'Analysis', items: ['SQL', 'Power BI', 'Excel', 'Data validation'] },
    { group: 'Operations', items: ['Process mapping', 'Capacity planning', 'Metric documentation'] },
  ],
  languages: [
    { lang: 'German', level: 'C1' },
    { lang: 'English', level: 'C1' },
  ],
  projects: [
    {
      name: 'Demand and capacity dashboard',
      summary: 'A planning prototype that made assumptions and refresh dates visible.',
      tech: ['SQL', 'Power BI'],
    },
    {
      name: 'Production handoff study',
      summary: 'A structured comparison of current practice and documented standard work.',
      tech: ['Process mapping', 'Excel'],
    },
  ],
  certifications: [{ name: 'Microsoft Power BI Data Analyst — study programme' }],
})

const job: NormalizedJob = {
  id: 'fixture-job',
  source: 'greenhouse',
  source_id: 'fixture-job',
  title: 'Operations Data Analyst',
  company: 'Example Mobility GmbH',
  location: { city: 'Berlin', country: 'DE', remote: false },
  description: 'Use SQL and Power BI to support operational planning and clear decisions.',
  url: 'https://example.invalid/jobs/operations-data-analyst',
  salary: {},
  tags: ['SQL', 'Power BI', 'operations'],
  fetched_at: '2026-07-31T00:00:00.000Z',
}

const summary: Record<string, unknown> = {
  generatedAt: new Date().toISOString(),
  source: 'authored synthetic fixture; no supplied résumé sample is embedded',
  resumeDocuments: {},
  coverLetters: {},
  packet: {},
}

for (const preset of RESUME_LAB_PRESETS) {
  for (const language of ['en', 'de'] as ResumeLanguage[]) {
    const filename = `resume-lab-${preset.id}-${language}.docx`
    const bytes = new Uint8Array(
      await Packer.toBuffer(resumeLabDocument(resume, language, preset.id)),
    )
    await writeFile(path.join(output, filename), bytes, { mode: 0o600 })
    ;(summary.resumeDocuments as Record<string, unknown>)[filename] = {
      bytes: bytes.length,
      ...parsePackedResumeDocx(bytes),
    }
  }
}

const longResume = structuredClone(resume)
longResume.experience.push(
  {
    id: 'fixture-role-4',
    title: 'Process Improvement Assistant',
    company: 'Illustration Components GmbH',
    city: 'Dresden',
    start: '01/2020',
    end: '06/2021',
    current: false,
    bullets: [
      {
        id: 'fixture-bullet-4-1',
        text: 'Prepared structured observations for a material-flow workshop.',
        evidenceRefs: [],
      },
      {
        id: 'fixture-bullet-4-2',
        text: 'Updated work-instruction references after approved process changes.',
        evidenceRefs: [],
      },
      {
        id: 'fixture-bullet-4-3',
        text: 'Compared weekly issue categories without turning missing data into assumptions.',
        evidenceRefs: [],
      },
    ],
    evidenceRefs: [],
  },
  {
    id: 'fixture-role-5',
    title: 'Student Project Coordinator',
    company: 'Example University Laboratory',
    city: 'Berlin',
    start: '04/2019',
    end: '12/2019',
    current: false,
    bullets: [
      {
        id: 'fixture-bullet-5-1',
        text: 'Coordinated a small simulation study and documented its input assumptions.',
        evidenceRefs: [],
      },
      {
        id: 'fixture-bullet-5-2',
        text: 'Presented limitations and open questions alongside the project findings.',
        evidenceRefs: [],
      },
      {
        id: 'fixture-bullet-5-3',
        text: 'Maintained the source list and version notes used by the student team.',
        evidenceRefs: [],
      },
    ],
    evidenceRefs: [],
  },
)
for (let index = 0; index < 6; index += 1) {
  longResume.experience.push({
    id: `fixture-extended-role-${index}`,
    title: `Earlier Operations Assignment ${index + 1}`,
    company: `Synthetic Reference Employer ${index + 1}`,
    city: index % 2 === 0 ? 'Berlin' : 'Hamburg',
    start: `01/${2013 + index}`,
    end: `12/${2013 + index}`,
    current: false,
    bullets: Array.from({ length: 3 }, (_, bulletIndex) => ({
      id: `fixture-extended-bullet-${index}-${bulletIndex}`,
      text: [
        'Recorded a defined operational observation without adding unsupported interpretation.',
        'Organized source notes so another reviewer could follow the decision path.',
        'Compared the approved process description with the observed handoff sequence.',
      ][bulletIndex],
      evidenceRefs: [],
    })),
    evidenceRefs: [],
  })
}
const longResumeFilename = 'resume-lab-classic-de-two-page-fixture.docx'
const longResumeBytes = new Uint8Array(
  await Packer.toBuffer(resumeLabDocument(longResume, 'de', 'classic')),
)
await writeFile(path.join(output, longResumeFilename), longResumeBytes, { mode: 0o600 })
;(summary.resumeDocuments as Record<string, unknown>)[longResumeFilename] = {
  bytes: longResumeBytes.length,
  ...parsePackedResumeDocx(longResumeBytes),
}

const coverBodies: Record<ResumeLanguage, string> = {
  en: [
    'The Operations Data Analyst role at Example Mobility GmbH connects directly with my work translating operational questions into practical reporting and documented decisions.',
    'At Example Manufacturing GmbH, I build weekly SQL and Power BI reporting for production and logistics reviews. I also document metric definitions with planning, quality, and operations partners so that a number can be traced to a shared meaning.',
    'I would welcome a conversation about how that grounded approach could support your operational planning work.',
  ].join('\n\n'),
  de: [
    'Die Position Operations Data Analyst bei Example Mobility GmbH verbindet sich direkt mit meiner Arbeit an praktischen Auswertungen und nachvollziehbar dokumentierten Entscheidungen.',
    'Bei Example Manufacturing GmbH erstelle ich wöchentliche Berichte mit SQL und Power BI für Produktions- und Logistikrunden. Gemeinsam mit Planung, Qualität und Betrieb dokumentiere ich Kennzahlendefinitionen, damit Zahlen auf eine gemeinsame Bedeutung zurückgeführt werden können.',
    'Gern würde ich in einem Gespräch klären, wie dieser sachliche Ansatz Ihre operative Planung unterstützen kann.',
  ].join('\n\n'),
}

const letterModels = Object.fromEntries(
  (['en', 'de'] as ResumeLanguage[]).map((language) => [
    language,
    createCoverLetterModel({
      body: coverBodies[language],
      resume,
      job,
      language,
      details: {
        recipientName: language === 'de' ? 'Frau Dr. Beispiel' : 'Dr. Example',
        recipientAddress: 'Mobility Street 12\n10115 Berlin',
        place: 'Berlin',
        dateIso: '2026-07-31',
      },
    }),
  ]),
)

for (const language of ['en', 'de'] as ResumeLanguage[]) {
  const filename = `cover-letter-${language}.docx`
  const bytes = new Uint8Array(
    await Packer.toBuffer(coverLetterDocument(letterModels[language])),
  )
  await writeFile(path.join(output, filename), bytes, { mode: 0o600 })
  ;(summary.coverLetters as Record<string, unknown>)[filename] = {
    bytes: bytes.length,
    ...inspectCoverLetterDocx(bytes),
  }
}

const longBody = Array.from({ length: 11 }, (_, index) =>
  `Evidence paragraph ${index + 1}. ` +
  'This intentionally long rendering fixture uses selectable text to test stable page breaks across Word, LibreOffice, PDF conversion, and headless extraction. ' +
  'It is not a generated claim or a production application. The content repeats its explicit test purpose so reviewers can recognize every page as a controlled QA artifact. ' +
  'The document remains single-column and avoids text boxes, tables, images, internal identifiers, placeholders, and prompt fragments.',
).join('\n\n')
const longModel = createCoverLetterModel({
  body: longBody,
  resume,
  job,
  language: 'en',
  details: {
    recipientAddress: 'Mobility Street 12\n10115 Berlin',
    place: 'Berlin',
    dateIso: '2026-07-31',
  },
})
const longBytes = new Uint8Array(
  await Packer.toBuffer(coverLetterDocument(longModel)),
)
await writeFile(path.join(output, 'cover-letter-en-two-page-fixture.docx'), longBytes, {
  mode: 0o600,
})
;(summary.coverLetters as Record<string, unknown>)['cover-letter-en-two-page-fixture.docx'] = {
  bytes: longBytes.length,
  ...inspectCoverLetterDocx(longBytes),
}

const packetBlob = await applicationPacketZip(
  resume,
  'en',
  'klar-alex-example-operations-data-analyst',
  letterModels.en,
  currentArtifactProvenance(ARTIFACT_GENERATOR_CONTRACTS.coverLetter),
)
const packetBytes = new Uint8Array(await packetBlob.arrayBuffer())
await writeFile(path.join(output, 'application-packet-en.zip'), packetBytes, {
  mode: 0o600,
})

// Read the archive back instead of asserting its shape. The members are also
// written out individually so the rendering and Word-compatibility checks cover
// exactly the two files a user receives, not only the standalone fixtures.
const packetEntries = unzipSync(packetBytes)
const packetFilenames = Object.keys(packetEntries).sort()
for (const entry of packetFilenames) {
  await writeFile(path.join(output, entry), packetEntries[entry], { mode: 0o600 })
}
summary.packet = {
  filename: 'application-packet-en.zip',
  bytes: packetBytes.length,
  entries: packetFilenames,
  containsTxt: packetFilenames.some((entry) => entry.toLowerCase().endsWith('.txt')),
  containsResumeDocx: packetFilenames.some(
    (entry) => entry.toLowerCase().endsWith('.docx') && !/cover-letter/i.test(entry),
  ),
  containsCoverLetterDocx: packetFilenames.some((entry) => /cover-letter.*\.docx$/i.test(entry)),
}

await writeFile(
  path.join(output, 'generation-summary.json'),
  `${JSON.stringify(summary, null, 2)}\n`,
  { encoding: 'utf8', mode: 0o600 },
)
const written = (await readdir(output)).sort()
console.log(JSON.stringify({
  output,
  files: written.length,
  docx: written.filter((entry) => entry.endsWith('.docx')).length,
  source: summary.source,
}, null, 2))