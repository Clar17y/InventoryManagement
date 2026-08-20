interface UpdatingResultsProps {
  updating: boolean
  error: string | null
  onRetry: () => void
  children: React.ReactNode
}

export default function UpdatingResults({
  updating,
  error,
  onRetry,
  children,
}: UpdatingResultsProps) {
  return (
    <div className={`relative ${updating ? 'opacity-60' : ''}`}>
      {children}
      {updating && (
        <div className="absolute inset-0 flex items-start justify-center pt-4">
          <div className="flex items-center gap-2 rounded bg-white/80 px-3 py-2 text-sm text-gray-600 shadow-sm">
            <span
              aria-hidden="true"
              className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-primary-600"
            />
            <span role="status" aria-live="polite">Updating results…</span>
          </div>
        </div>
      )}
      {error && (
        <div role="alert" className="mt-3 flex items-center gap-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={onRetry} className="font-medium underline">
            Retry
          </button>
        </div>
      )}
    </div>
  )
}

export type { UpdatingResultsProps }
