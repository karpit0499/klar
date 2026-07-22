// ============================================================================
// Groq client — called DIRECTLY from the browser (OpenAI-compatible API,
// verified CORS allow-origin *). The user's key never touches our Worker.
// ============================================================================
import { GROQ } from '../lib/config'
import { AppError, serializeAppError, toAppError, type AppErrorData } from '../errors/appError'

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

type GroqResponse = {
  choices?: { message?: { content?: string } }[]
  error?: { message?: string }
}

export type ChatOptions = {
  system: string
  user: string
  apiKey: string
  model?: string
  temperature?: number
  /** Ask Groq for a strict JSON object (OpenAI-compatible json_object mode). */
  json?: boolean
  maxTokens?: number
  signal?: AbortSignal
}

/** One chat completion. Returns the raw assistant text. Throws on API errors. */
export async function groqChat(opts: ChatOptions): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: opts.system },
    { role: 'user', content: opts.user },
  ]
  const body: Record<string, unknown> = {
    model: opts.model ?? GROQ.model,
    messages,
    temperature: opts.temperature ?? 0,
    max_tokens: opts.maxTokens ?? 2048,
  }
  if (opts.json) body.response_format = { type: 'json_object' }

  let res: Response
  try {
    res = await fetch(`${GROQ.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new AppError({
      category: 'network',
      message: 'Klar could not reach Groq.',
      dataSafe: true,
      available: 'Local search, filters, tracker, backups, and exports still work.',
      action: { label: 'Check the connection and retry', kind: 'retry' },
      technical: error instanceof Error ? error.message : String(error),
    })
  }

  const data = (await res.json().catch(() => ({}))) as GroqResponse
  if (!res.ok) {
    const msg = data.error?.message || `Groq HTTP ${res.status}`
    const category = res.status === 429 ? 'rate_limit' : res.status === 401 || res.status === 403 ? 'credentials' : 'source'
    throw new AppError({
      category,
      message:
        category === 'rate_limit'
          ? 'Groq has reached its current request limit.'
          : category === 'credentials'
            ? 'Groq rejected this API key.'
            : 'Groq could not complete this request.',
      dataSafe: true,
      available: 'Local search, filters, tracker, backups, and exports still work.',
      action: {
        label: category === 'credentials' ? 'Update the Groq key' : 'Try again',
        kind: category === 'credentials' ? 'open_settings' : 'retry',
      },
      technical: msg,
    })
  }
  return data.choices?.[0]?.message?.content ?? ''
}

/**
 * Parse a JSON object out of an LLM reply, tolerating stray prose or ```json
 * fences. Returns the parsed value or throws with a clear message.
 */
export function extractJson<T>(text: string): T {
  let t = text.trim()
  // Strip a ```json … ``` or ``` … ``` fence if present.
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) t = fence[1].trim()
  // If there's leading/trailing prose, grab the outermost {...} or [...].
  if (!(t.startsWith('{') || t.startsWith('['))) {
    const objStart = t.indexOf('{')
    const arrStart = t.indexOf('[')
    const start =
      objStart === -1 ? arrStart : arrStart === -1 ? objStart : Math.min(objStart, arrStart)
    if (start === -1) throw parsingError('No JSON found in model reply')
    const openCh = t[start]
    const closeCh = openCh === '{' ? '}' : ']'
    const end = t.lastIndexOf(closeCh)
    if (end === -1) throw parsingError('Unterminated JSON in model reply')
    t = t.slice(start, end + 1)
  }
  try {
    return JSON.parse(t) as T
  } catch (e) {
    throw parsingError('Model returned invalid JSON: ' + (e instanceof Error ? e.message : String(e)))
  }
}

function parsingError(technical: string): AppError {
  return new AppError({
    category: 'parsing',
    message: 'The AI response could not be read safely.',
    dataSafe: true,
    available: 'Your existing profile and workspace are unchanged.',
    action: { label: 'Retry the action', kind: 'retry' },
    technical,
  })
}

/** Tiny call used by the in-app "✓ Key works" validation ping. */
export async function pingGroqKey(apiKey: string): Promise<{ ok: true } | { ok: false; error: AppErrorData }> {
  try {
    const reply = await groqChat({
      apiKey,
      system: 'You reply with a single word.',
      user: 'Reply with the word OK.',
      maxTokens: 5,
      temperature: 0,
    })
    if (reply.toUpperCase().includes('OK') || reply.length > 0) return { ok: true }
    return {
      ok: false,
      error: serializeAppError(new AppError({
        category: 'credentials',
        message: 'Groq accepted the request but returned an empty response.',
        dataSafe: true,
        available: 'Local features remain available.',
        action: { label: 'Try validation again', kind: 'retry' },
      })),
    }
  } catch (e) {
    return {
      ok: false,
      error: serializeAppError(toAppError(e, {
        category: 'credentials',
        message: 'That Groq key could not be validated.',
        dataSafe: true,
        available: 'Local features remain available.',
        action: { label: 'Check the key and try again', kind: 'open_settings' },
      })),
    }
  }
}