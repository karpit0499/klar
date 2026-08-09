import { safeDiagnosticDetail } from './redact.mjs'

const EVENT_TYPE = /^[a-z][a-z0-9_.-]{1,63}$/

export class DiagnosticJournal {
  #events = []

  constructor({
    maximumEvents = 200,
    now = () => new Date(),
  } = {}) {
    this.maximumEvents = maximumEvents
    this.now = now
  }

  record(type, detail = {}) {
    if (!EVENT_TYPE.test(type)) throw new Error('Invalid diagnostic event type.')
    this.#events.push({
      timestamp: this.now().toISOString(),
      type,
      detail: safeDiagnosticDetail(detail),
    })
    if (this.#events.length > this.maximumEvents) {
      this.#events.splice(0, this.#events.length - this.maximumEvents)
    }
  }

  report({ appVersion, platform, architecture }) {
    return {
      schemaVersion: 1,
      generatedAt: this.now().toISOString(),
      app: {
        version: String(appVersion),
        platform: String(platform),
        architecture: String(architecture),
      },
      events: this.#events.map((event) => ({
        timestamp: event.timestamp,
        type: event.type,
        detail: { ...event.detail },
      })),
    }
  }
}
