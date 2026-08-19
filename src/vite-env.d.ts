/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WORKER_URL?: string
  readonly VITE_TURNSTILE_SITE_KEY?: string
  /** Development-only opt-in for deterministic source fixtures. Never set in production. */
  readonly VITE_ENABLE_SOURCE_FIXTURES?: string
  readonly VITE_KB_URL?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
