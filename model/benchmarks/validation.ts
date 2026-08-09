import { createHash } from 'node:crypto'
import type {
  BenchmarkFixture,
  BenchmarkTask,
  OutputValidation,
} from './types.ts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
  issues: string[],
): void {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    issues.push(`${label} must contain exactly: ${wanted.join(', ')}.`)
  }
}

function stringField(
  value: Record<string, unknown>,
  key: string,
  issues: string[],
): string | null {
  if (typeof value[key] !== 'string' || !String(value[key]).trim()) {
    issues.push(`${key} must be non-empty text.`)
    return null
  }
  return String(value[key])
}

function stringArrayField(
  value: Record<string, unknown>,
  key: string,
  issues: string[],
): string[] {
  const candidate = value[key]
  if (
    !Array.isArray(candidate) ||
    candidate.some((entry) => typeof entry !== 'string' || !entry.trim())
  ) {
    issues.push(`${key} must be an array of non-empty strings.`)
    return []
  }
  return candidate
}

function exactStringMembership(
  actual: unknown,
  expected: readonly string[],
  label: string,
  issues: string[],
): void {
  if (
    !Array.isArray(actual) ||
    actual.some((entry) => typeof entry !== 'string' || !entry.trim())
  ) {
    return
  }
  const members = actual as string[]
  const duplicates = [...new Set(
    members.filter((entry, index) => members.indexOf(entry) !== index),
  )]
  const missing = expected.filter((entry) => !members.includes(entry))
  const unexpected = members.filter((entry) => !expected.includes(entry))
  if (duplicates.length > 0 || missing.length > 0 || unexpected.length > 0) {
    const details = [
      duplicates.length > 0 ? `duplicates: ${duplicates.join(', ')}` : '',
      missing.length > 0 ? `missing: ${missing.join(', ')}` : '',
      unexpected.length > 0 ? `unexpected: ${unexpected.join(', ')}` : '',
    ].filter(Boolean)
    issues.push(`${label} membership must match fixture truth exactly (${details.join('; ')}).`)
  }
}

function expectedEvidenceLabel(evidenceId: string | null): string {
  return evidenceId === null ? 'null' : evidenceId
}

function validateExactEvidenceLinks(
  links: unknown,
  expected: Readonly<Record<string, string | null>>,
  issues: string[],
): void {
  if (!Array.isArray(links)) return
  const seen = new Set<string>()
  for (const [index, candidate] of links.entries()) {
    if (!isRecord(candidate) || typeof candidate.requirementId !== 'string') {
      continue
    }
    const requirementId = candidate.requirementId
    if (seen.has(requirementId)) {
      issues.push(`links contains duplicate requirement id: ${requirementId}.`)
      continue
    }
    seen.add(requirementId)
    if (!Object.prototype.hasOwnProperty.call(expected, requirementId)) {
      issues.push(`links contains unexpected requirement id: ${requirementId}.`)
      continue
    }
    const expectedEvidenceId = expected[requirementId]
    if (candidate.evidenceId !== expectedEvidenceId) {
      issues.push(
        `${requirementId} must map to ${expectedEvidenceLabel(expectedEvidenceId)}.`,
      )
    }
  }
  for (const requirementId of Object.keys(expected)) {
    if (!seen.has(requirementId)) {
      issues.push(`links omits required requirement id: ${requirementId}.`)
    }
  }
}

function validateShape(
  task: BenchmarkTask,
  value: Record<string, unknown>,
  issues: string[],
): void {
  if (task === 'extraction') {
    exactKeys(
      value,
      ['title', 'company', 'requiredSkills', 'preferredSkills'],
      task,
      issues,
    )
    stringField(value, 'title', issues)
    stringField(value, 'company', issues)
    stringArrayField(value, 'requiredSkills', issues)
    stringArrayField(value, 'preferredSkills', issues)
    return
  }
  if (task === 'normalization') {
    exactKeys(
      value,
      [
        'normalizedTitle',
        'occupationFamily',
        'city',
        'countryCode',
        'remoteMode',
      ],
      task,
      issues,
    )
    stringField(value, 'normalizedTitle', issues)
    stringField(value, 'occupationFamily', issues)
    stringField(value, 'city', issues)
    stringField(value, 'countryCode', issues)
    const remote = stringField(value, 'remoteMode', issues)
    if (
      remote &&
      !new Set(['onsite', 'hybrid', 'remote', 'unknown']).has(remote)
    ) {
      issues.push('remoteMode is outside the allowed values.')
    }
    return
  }
  if (task === 'evidence_linking') {
    exactKeys(value, ['links'], task, issues)
    if (!Array.isArray(value.links) || value.links.length === 0) {
      issues.push('links must be a non-empty array.')
      return
    }
    for (const [index, link] of value.links.entries()) {
      if (!isRecord(link)) {
        issues.push(`links[${index}] must be an object.`)
        continue
      }
      exactKeys(
        link,
        ['requirementId', 'evidenceId', 'rationale'],
        `links[${index}]`,
        issues,
      )
      stringField(link, 'requirementId', issues)
      if (
        link.evidenceId !== null &&
        (typeof link.evidenceId !== 'string' || !link.evidenceId.trim())
      ) {
        issues.push(`links[${index}].evidenceId must be text or null.`)
      }
      stringField(link, 'rationale', issues)
    }
    return
  }
  if (task === 'resume_expression') {
    exactKeys(value, ['bullets'], task, issues)
    if (!Array.isArray(value.bullets) || value.bullets.length !== 1) {
      issues.push('bullets must contain exactly one entry.')
      return
    }
    const bullet = value.bullets[0]
    if (!isRecord(bullet)) {
      issues.push('bullets[0] must be an object.')
      return
    }
    exactKeys(bullet, ['evidenceId', 'text'], 'bullets[0]', issues)
    stringField(bullet, 'evidenceId', issues)
    stringField(bullet, 'text', issues)
    return
  }
  if (task === 'cover_letter') {
    exactKeys(value, ['subject', 'body', 'evidenceIds'], task, issues)
    stringField(value, 'subject', issues)
    stringField(value, 'body', issues)
    stringArrayField(value, 'evidenceIds', issues)
    return
  }
  exactKeys(value, ['message', 'evidenceIds'], task, issues)
  const message = stringField(value, 'message', issues)
  stringArrayField(value, 'evidenceIds', issues)
  if (message && message.length > 500) {
    issues.push('message exceeds the 500-character fixture limit.')
  }
}

function collectEvidenceIds(
  task: BenchmarkTask,
  parsed: Record<string, unknown>,
): string[] {
  if (task === 'evidence_linking') {
    if (!Array.isArray(parsed.links)) return []
    return parsed.links.flatMap((entry) =>
      isRecord(entry) && typeof entry.evidenceId === 'string'
        ? [entry.evidenceId]
        : [],
    )
  }
  if (task === 'resume_expression') {
    if (!Array.isArray(parsed.bullets)) return []
    return parsed.bullets.flatMap((entry) =>
      isRecord(entry) && typeof entry.evidenceId === 'string'
        ? [entry.evidenceId]
        : [],
    )
  }
  if (
    (task === 'cover_letter' || task === 'recruiter_message') &&
    Array.isArray(parsed.evidenceIds)
  ) {
    return parsed.evidenceIds.filter(
      (entry): entry is string => typeof entry === 'string',
    )
  }
  return []
}

export function validateBenchmarkOutput(
  fixture: BenchmarkFixture,
  output: string,
): OutputValidation {
  const issues: string[] = []
  let parsed: unknown
  try {
    parsed = JSON.parse(output.trim())
  } catch {
    return {
      validStructuredOutput: false,
      evidenceGrounded: false,
      issues: ['Output is not one directly parseable JSON object.'],
    }
  }
  if (!isRecord(parsed)) {
    return {
      validStructuredOutput: false,
      evidenceGrounded: false,
      issues: ['Output root must be an object.'],
    }
  }
  validateShape(fixture.task, parsed, issues)
  const shapeIssueCount = issues.length
  const encoded = JSON.stringify(parsed)
  for (const required of fixture.expected.requiredStrings ?? []) {
    if (!encoded.toLocaleLowerCase().includes(required.toLocaleLowerCase())) {
      issues.push(`Missing required grounded value: ${required}.`)
    }
  }
  for (const [key, expected] of Object.entries(fixture.expected.exact ?? {})) {
    if (parsed[key] !== expected) {
      issues.push(`${key} does not match the fixture truth.`)
    }
  }
  if (fixture.task === 'extraction') {
    if (fixture.expected.requiredSkills) {
      exactStringMembership(
        parsed.requiredSkills,
        fixture.expected.requiredSkills,
        'requiredSkills',
        issues,
      )
    }
    if (fixture.expected.preferredSkills) {
      exactStringMembership(
        parsed.preferredSkills,
        fixture.expected.preferredSkills,
        'preferredSkills',
        issues,
      )
    }
  }
  if (
    fixture.task === 'evidence_linking' &&
    fixture.expected.evidenceLinks
  ) {
    validateExactEvidenceLinks(
      parsed.links,
      fixture.expected.evidenceLinks,
      issues,
    )
  }
  for (const forbidden of fixture.expected.forbiddenStrings ?? []) {
    if (encoded.toLocaleLowerCase().includes(forbidden.toLocaleLowerCase())) {
      issues.push(`Output contains forbidden unsupported value: ${forbidden}.`)
    }
  }
  const evidenceIds = collectEvidenceIds(fixture.task, parsed)
  const allowed = new Set(fixture.expected.allowedEvidenceIds ?? [])
  if (allowed.size > 0) {
    for (const evidenceId of evidenceIds) {
      if (!allowed.has(evidenceId)) {
        issues.push(`Output cites unknown evidence id: ${evidenceId}.`)
      }
    }
  }
  for (const requiredId of fixture.expected.requiredEvidenceIds ?? []) {
    if (!evidenceIds.includes(requiredId)) {
      issues.push(`Output omits required evidence id: ${requiredId}.`)
    }
  }
  return {
    validStructuredOutput: shapeIssueCount === 0,
    evidenceGrounded: issues.length === 0,
    issues,
    parsed,
  }
}

export function outputSha256(output: string): string {
  return createHash('sha256').update(output, 'utf8').digest('hex')
}
