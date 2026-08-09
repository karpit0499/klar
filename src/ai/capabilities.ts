import type {
  AdapterSlot,
  AiCapability,
  AiLanguage,
  ProviderCapabilities,
} from './contracts'

export type CapabilityDefinition = {
  id: AiCapability
  adapter: AdapterSlot
  structuredOutput: 'required' | 'optional' | 'unsupported'
  languages: readonly AiLanguage[]
  maxOutputTokens: number
}

const DEFINITIONS: Record<AiCapability, CapabilityDefinition> = {
  structured_job_extraction: {
    id: 'structured_job_extraction',
    adapter: 'precision',
    structuredOutput: 'required',
    languages: ['de', 'en'],
    maxOutputTokens: 2_048,
  },
  evidence_selection: {
    id: 'evidence_selection',
    adapter: 'precision',
    structuredOutput: 'required',
    languages: ['de', 'en'],
    maxOutputTokens: 2_048,
  },
  recruiter_message: {
    id: 'recruiter_message',
    adapter: 'writer',
    structuredOutput: 'optional',
    languages: ['de', 'en'],
    maxOutputTokens: 768,
  },
  cover_letter: {
    id: 'cover_letter',
    adapter: 'writer',
    structuredOutput: 'optional',
    languages: ['de', 'en'],
    maxOutputTokens: 2_048,
  },
  resume_bullet_revision: {
    id: 'resume_bullet_revision',
    adapter: 'writer',
    structuredOutput: 'required',
    languages: ['de', 'en'],
    maxOutputTokens: 1_024,
  },
}

export const AI_CAPABILITIES = Object.freeze(DEFINITIONS)

export function capabilityDefinition(capability: AiCapability): CapabilityDefinition {
  return DEFINITIONS[capability]
}

export function providerSupports(
  provider: ProviderCapabilities,
  capability: AiCapability,
  language: AiLanguage,
): boolean {
  const definition = capabilityDefinition(capability)
  return (
    provider.capabilities.has(capability) &&
    provider.languages.has(language) &&
    provider.adapters.has(definition.adapter) &&
    (definition.structuredOutput !== 'required' || provider.structuredOutput)
  )
}

export function missingProviderRequirements(
  provider: ProviderCapabilities,
  capability: AiCapability,
  language: AiLanguage,
): string[] {
  const definition = capabilityDefinition(capability)
  const missing: string[] = []
  if (!provider.capabilities.has(capability)) missing.push(`capability:${capability}`)
  if (!provider.languages.has(language)) missing.push(`language:${language}`)
  if (!provider.adapters.has(definition.adapter)) missing.push(`adapter:${definition.adapter}`)
  if (definition.structuredOutput === 'required' && !provider.structuredOutput) {
    missing.push('structured_output')
  }
  return missing
}
