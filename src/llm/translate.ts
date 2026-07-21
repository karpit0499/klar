// ============================================================================
// Job-description translation (feature 16).
//
// Best fit for the privacy-first model: the browser's on-device Translator API
// where supported (free, private, no key, many pairs), falling back to Groq
// (already wired) elsewhere. The Translator API is still rolling out, so we
// FEATURE-DETECT it at runtime and degrade gracefully — never assume it exists.
//
// The Groq prompt builder is pure (unit-testable); the browser path is guarded
// behind capability checks. `translateText` picks the best available route.
// ============================================================================
import { groqChat } from './groq'

// Minimal ambient shape for the emerging Translator API (not yet in lib.dom).
type TranslatorAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available'
type TranslatorLike = { translate: (input: string) => Promise<string> }
type TranslatorStatic = {
  availability: (o: { sourceLanguage: string; targetLanguage: string }) => Promise<TranslatorAvailability>
  create: (o: { sourceLanguage: string; targetLanguage: string }) => Promise<TranslatorLike>
}

export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', de: 'German', fr: 'French', es: 'Spanish', it: 'Italian',
  nl: 'Dutch', pl: 'Polish', pt: 'Portuguese', tr: 'Turkish', uk: 'Ukrainian',
  ru: 'Russian', ar: 'Arabic', zh: 'Chinese',
}

/** The on-device Translator, if this browser exposes it. */
function translatorApi(): TranslatorStatic | null {
  const t = (globalThis as unknown as { Translator?: TranslatorStatic }).Translator
  return t && typeof t.availability === 'function' ? t : null
}

/** Is on-device translation usable for this pair? (false in Node / older browsers.) */
export async function canTranslateOnDevice(sourceLang: string, targetLang: string): Promise<boolean> {
  const api = translatorApi()
  if (!api || sourceLang === targetLang) return false
  try {
    const a = await api.availability({ sourceLanguage: sourceLang, targetLanguage: targetLang })
    return a === 'available' || a === 'downloadable' || a === 'downloading'
  } catch {
    return false
  }
}

/** Translate on-device (may trigger a one-time model download). Throws if unusable. */
export async function translateOnDevice(text: string, sourceLang: string, targetLang: string): Promise<string> {
  const api = translatorApi()
  if (!api) throw new Error('On-device translation is not available in this browser.')
  const translator = await api.create({ sourceLanguage: sourceLang, targetLanguage: targetLang })
  return translator.translate(text)
}

/** Deterministic, testable Groq translation prompt. */
export function buildTranslatePrompt(targetLang: string): string {
  const name = LANGUAGE_NAMES[targetLang] ?? targetLang
  return [
    `Translate the following job posting into ${name}.`,
    'Preserve the meaning, structure, and any lists. Keep technology names and',
    'company names unchanged. Output ONLY the translation — no notes, no preamble.',
  ].join('\n')
}

/** Translate via Groq (the fallback path). */
export async function translateViaGroq(
  text: string, targetLang: string, apiKey: string, signal?: AbortSignal,
): Promise<string> {
  const out = await groqChat({
    apiKey,
    system: buildTranslatePrompt(targetLang),
    user: text.slice(0, 6000),
    temperature: 0,
    maxTokens: 2048,
    signal,
  })
  return out.trim()
}

export type TranslationResult = { text: string; via: 'on-device' | 'groq' }

/**
 * Translate a posting to `targetLang`, preferring the private on-device path and
 * falling back to Groq. `sourceLang` defaults to German (most DE postings); the
 * Groq fallback doesn't need it (the model detects the source).
 */
export async function translateText(
  text: string,
  targetLang: string,
  apiKey: string,
  opts: { sourceLang?: string; signal?: AbortSignal } = {},
): Promise<TranslationResult> {
  const sourceLang = opts.sourceLang ?? 'de'
  if (await canTranslateOnDevice(sourceLang, targetLang)) {
    try {
      return { text: await translateOnDevice(text, sourceLang, targetLang), via: 'on-device' }
    } catch {
      /* fall through to Groq */
    }
  }
  return { text: await translateViaGroq(text, targetLang, apiKey, opts.signal), via: 'groq' }
}