// ============================================================================
// Klar's global recoverable-error model (v2.2).
//
// Every surfaced failure answers five questions:
//   1. What failed in plain language?
//   2. Is the user's existing data safe?
//   3. What still works?
//   4. What should the user do next?
//   5. What technical detail can help with support/debugging?
// ============================================================================

export type ErrorCategory =
  | 'credentials'
  | 'rate_limit'
  | 'source'
  | 'network'
  | 'parsing'
  | 'locked'
  | 'storage'
  | 'export'
  | 'import'
  | 'validation'
  | 'unknown'

export type ErrorAction = {
  label: string
  kind:
    | 'retry'
    | 'open_settings'
    | 'unlock'
    | 'choose_file'
    | 'download_backup'
    | 'none'
}

export type AppErrorData = {
  category: ErrorCategory
  message: string
  dataSafe: boolean
  available: string
  action: ErrorAction
  technical?: string
}

export class AppError extends Error implements AppErrorData {
  readonly category: ErrorCategory
  readonly dataSafe: boolean
  readonly available: string
  readonly action: ErrorAction
  readonly technical?: string

  constructor(data: AppErrorData) {
    super(data.message)
    this.name = 'AppError'
    this.category = data.category
    this.dataSafe = data.dataSafe
    this.available = data.available
    this.action = data.action
    this.technical = data.technical
  }

  toJSON(): AppErrorData {
    return serializeAppError(this)
  }
}

export function lockedVaultError(technical?: string): AppError {
  return new AppError({
    category: 'locked',
    message: 'Your encrypted vault is locked.',
    dataSafe: true,
    available: 'The encrypted workspace remains safely stored; unlock is still available.',
    action: { label: 'Unlock vault', kind: 'unlock' },
    technical,
  })
}

export function toAppError(
  error: unknown,
  fallback: Partial<AppErrorData> & Pick<AppErrorData, 'message'>,
): AppError {
  if (error instanceof AppError) return error
  const technical = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return new AppError({
    category: fallback.category ?? 'unknown',
    message: fallback.message,
    dataSafe: fallback.dataSafe ?? true,
    available: fallback.available ?? 'Your existing workspace remains available.',
    action: fallback.action ?? { label: 'Try again', kind: 'retry' },
    technical,
  })
}

export function serializeAppError(error: AppErrorData): AppErrorData {
  return {
    category: error.category,
    message: error.message,
    dataSafe: error.dataSafe,
    available: error.available,
    action: { ...error.action },
    technical: error.technical,
  }
}

export function isAppErrorData(value: unknown): value is AppErrorData {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<AppErrorData>
  return (
    typeof candidate.category === 'string' &&
    typeof candidate.message === 'string' &&
    typeof candidate.dataSafe === 'boolean' &&
    typeof candidate.available === 'string' &&
    !!candidate.action &&
    typeof candidate.action.label === 'string' &&
    typeof candidate.action.kind === 'string'
  )
}