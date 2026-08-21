export type ApiErrorDetails<TField extends string> = { message: string; field?: TField }

// Pulls the server's { error, field } body off a failed request, falling back to the
// thrown error's own message. `fields` limits which field names a form will trust.
export function getApiErrorDetails<TField extends string>(
  error: unknown,
  fields: readonly TField[],
): ApiErrorDetails<TField> {
  const candidate = error as { message?: unknown; body?: unknown } | null
  const body = candidate && typeof candidate.body === 'object' && candidate.body !== null
    ? candidate.body as { error?: unknown; field?: unknown }
    : null
  const message = typeof body?.error === 'string'
    ? body.error
    : typeof candidate?.message === 'string'
      ? candidate.message
      : 'Request failed'
  const field = fields.find((name) => name === body?.field)
  return { message, field }
}
