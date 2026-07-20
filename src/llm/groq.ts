// ============================================================================
// Groq client — called DIRECTLY from the browser (OpenAI-compatible API,
// verified CORS allow-origin *). The user's key never touches our Worker.
// ============================================================================
import { GROQ } from '../lib/config'

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

  const res = await fetch(`${GROQ.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  })

  const data = (await res.json().catch(() => ({}))) as GroqResponse
  if (!res.ok) {
    const msg = data.error?.message || `Groq HTTP ${res.status}`
    throw new Error(msg)
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
    if (start === -1) throw new Error('No JSON found in model reply')
    const openCh = t[start]
    const closeCh = openCh === '{' ? '}' : ']'
    const end = t.lastIndexOf(closeCh)
    if (end === -1) throw new Error('Unterminated JSON in model reply')
    t = t.slice(start, end + 1)
  }
  try {
    return JSON.parse(t) as T
  } catch (e) {
    throw new Error('Model returned invalid JSON: ' + (e instanceof Error ? e.message : String(e)))
  }
}

/** Tiny call used by the in-app "✓ Key works" validation ping. */
export async function pingGroqKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const reply = await groqChat({
      apiKey,
      system: 'You reply with a single word.',
      user: 'Reply with the word OK.',
      maxTokens: 5,
      temperature: 0,
    })
    return { ok: reply.toUpperCase().includes('OK') || reply.length > 0 }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}