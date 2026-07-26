import 'fake-indexeddb/auto'
import { strict as assert } from 'node:assert'
import { AppError } from '../src/errors/appError'
import {
  buildChatRequestBody,
  chatComplete,
  isSchemaGenerationFailure,
  recoverFailedGeneration,
  shouldRetryWithJsonObject,
} from '../src/llm/groq'
import {
  DEFAULT_ENGINE,
  invalidateEngineCache,
} from '../src/llm/provider'
import type { StructuredOutputSchema } from '../src/llm/jsonSchemas'

const SIMPLE_OUTPUT: StructuredOutputSchema = {
  name: 'simple_output',
  schema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
    },
    required: ['summary'],
    additionalProperties: false,
  },
}

const strictBody = buildChatRequestBody(DEFAULT_ENGINE, {
  system: 'Return JSON.',
  user: 'Summarize.',
  jsonSchema: SIMPLE_OUTPUT,
})
const jsonObjectBody = buildChatRequestBody(
  DEFAULT_ENGINE,
  {
    system: 'Return JSON.',
    user: 'Summarize.',
    jsonSchema: SIMPLE_OUTPUT,
  },
  'json_object',
)

assert.equal(
  (strictBody.response_format as { type?: string }).type,
  'json_schema',
)
assert.deepEqual(jsonObjectBody.response_format, { type: 'json_object' })
assert.equal(
  shouldRetryWithJsonObject(strictBody, 400, {
    message: 'Generated JSON does not match the expected schema.',
    type: 'invalid_request_error',
    code: 'json_validate_failed',
  }),
  true,
)
assert.equal(
  shouldRetryWithJsonObject(jsonObjectBody, 400, {
    message: 'Generated JSON does not match the expected schema.',
  }),
  false,
)

assert.equal(
  recoverFailedGeneration({
    failed_generation: 'prefix {"summary":"usable"} suffix',
  }),
  '{"summary":"usable"}',
)
assert.equal(recoverFailedGeneration({ failed_generation: '[]' }), null)
assert.equal(recoverFailedGeneration({ failed_generation: '"text"' }), null)
assert.equal(recoverFailedGeneration({ failed_generation: '{broken' }), null)

assert.equal(
  isSchemaGenerationFailure(400, {
    message: "Failed to validate JSON. See 'failed_generation' for more details.",
  }),
  true,
)
assert.equal(
  isSchemaGenerationFailure(400, {
    message: 'This request is too large for the context length.',
    failed_generation: '{"summary":"ignored"}',
  }),
  false,
)
assert.equal(
  isSchemaGenerationFailure(400, {
    message: 'The requested model has been decommissioned.',
    failed_generation: '{"summary":"ignored"}',
  }),
  false,
)
assert.equal(
  isSchemaGenerationFailure(401, {
    message: 'Generated JSON does not match the expected schema.',
    failed_generation: '{"summary":"ignored"}',
  }),
  false,
)
assert.equal(
  isSchemaGenerationFailure(429, {
    message: 'Generated JSON does not match the expected schema.',
    failed_generation: '{"summary":"ignored"}',
  }),
  false,
)

const originalFetch = globalThis.fetch

try {
  // A valid object in failed_generation is returned immediately. Groq has
  // already generated it, so recovery must not spend a second request.
  {
    const requestBodies: Record<string, unknown>[] = []
    globalThis.fetch = (async (_input, init) => {
      requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return jsonResponse({
        error: {
          message: 'Generated JSON does not match the expected schema.',
          type: 'invalid_request_error',
          code: 'json_validate_failed',
          failed_generation: '{"summary":"recovered without retry"}',
        },
      }, 400)
    }) as typeof fetch

    invalidateEngineCache()
    const output = await chatComplete(chatOptions())
    assert.equal(output, '{"summary":"recovered without retry"}')
    assert.equal(requestBodies.length, 1)
    assert.equal(
      (requestBodies[0].response_format as { type?: string }).type,
      'json_schema',
    )
  }

  // Invalid or non-object failed_generation falls back exactly once, changing
  // only response_format; the same prompt/model/options remain in force.
  {
    const requestBodies: Record<string, unknown>[] = []
    globalThis.fetch = (async (_input, init) => {
      requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      if (requestBodies.length === 1) {
        return jsonResponse({
          error: {
            message: "Failed to validate JSON. See 'failed_generation'.",
            type: 'invalid_request_error',
            code: 'json_validate_failed',
            failed_generation: '[]',
          },
        }, 400)
      }
      return jsonResponse({
        choices: [{ message: { content: '{"summary":"fallback succeeded"}' } }],
      })
    }) as typeof fetch

    invalidateEngineCache()
    const output = await chatComplete(chatOptions())
    assert.equal(output, '{"summary":"fallback succeeded"}')
    assert.equal(requestBodies.length, 2)
    assert.equal(
      (requestBodies[0].response_format as { type?: string }).type,
      'json_schema',
    )
    assert.deepEqual(requestBodies[1].response_format, { type: 'json_object' })
    assert.deepEqual(requestBodies[1].messages, requestBodies[0].messages)
    assert.equal(requestBodies[1].model, requestBodies[0].model)
  }

  // A failed compatibility request is surfaced after two calls, never looped,
  // and keeps Groq's type/code/failed_generation for diagnosis.
  {
    let calls = 0
    globalThis.fetch = (async () => {
      calls += 1
      if (calls === 1) {
        return jsonResponse({
          error: {
            message: 'Generated JSON does not match the expected schema.',
            type: 'invalid_request_error',
            code: 'json_validate_failed',
            failed_generation: 'not-json',
          },
        }, 400)
      }
      return jsonResponse({
        error: {
          message: 'Fallback unavailable.',
          type: 'server_error',
          code: 'overloaded',
        },
      }, 500)
    }) as typeof fetch

    invalidateEngineCache()
    await assert.rejects(
      chatComplete(chatOptions()),
      (caught: unknown) => {
        assert.ok(caught instanceof AppError)
        assert.match(caught.technical ?? '', /invalid_request_error/)
        assert.match(caught.technical ?? '', /json_validate_failed/)
        assert.match(caught.technical ?? '', /failed_generation_present/)
        assert.doesNotMatch(caught.technical ?? '', /not-json/)
        assert.match(caught.technical ?? '', /server_error/)
        assert.match(caught.technical ?? '', /overloaded/)
        return true
      },
    )
    assert.equal(calls, 2)
  }

  // These failure classes never receive a structured-output compatibility call.
  await assertNoRetry(
    jsonResponse({
      error: {
        message: 'Invalid API key.',
        type: 'invalid_request_error',
        code: 'invalid_api_key',
      },
    }, 401),
    'credentials',
  )
  await assertNoRetry(
    jsonResponse({
      error: {
        message: 'Rate limit reached.',
        type: 'rate_limit_error',
        code: 'rate_limit_exceeded',
      },
    }, 429),
    'rate_limit',
  )
  await assertNoRetry(
    jsonResponse({
      error: {
        message: 'This request is too large for the maximum context length.',
        type: 'invalid_request_error',
        code: 'request_too_large',
        failed_generation: '{"summary":"must not be used"}',
      },
    }, 400),
    'validation',
  )
  await assertNoRetry(
    jsonResponse({
      error: {
        message: 'The requested model has been decommissioned.',
        type: 'invalid_request_error',
        code: 'model_decommissioned',
      },
    }, 400),
    'validation',
  )

  {
    let calls = 0
    globalThis.fetch = (async () => {
      calls += 1
      throw new TypeError('offline')
    }) as typeof fetch
    invalidateEngineCache()
    await assert.rejects(
      chatComplete(chatOptions()),
      (caught: unknown) => {
        assert.ok(caught instanceof AppError)
        assert.equal(caught.category, 'network')
        return true
      },
    )
    assert.equal(calls, 1)
  }

  {
    let calls = 0
    const abort = new DOMException('cancelled', 'AbortError')
    globalThis.fetch = (async () => {
      calls += 1
      throw abort
    }) as typeof fetch
    invalidateEngineCache()
    await assert.rejects(chatComplete(chatOptions()), (caught: unknown) => caught === abort)
    assert.equal(calls, 1)
  }
} finally {
  globalThis.fetch = originalFetch
}

console.log('v2532-groq-recovery.test.ts: all tests passed')

function chatOptions() {
  return {
    system: 'Return JSON.',
    user: 'Summarize.',
    apiKey: 'test-key',
    jsonSchema: SIMPLE_OUTPUT,
    maxTokens: 250,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function assertNoRetry(response: Response, category: AppError['category']): Promise<void> {
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    return response.clone()
  }) as typeof fetch
  invalidateEngineCache()
  await assert.rejects(
    chatComplete(chatOptions()),
    (caught: unknown) => {
      assert.ok(caught instanceof AppError)
      assert.equal(caught.category, category)
      return true
    },
  )
  assert.equal(calls, 1)
}
