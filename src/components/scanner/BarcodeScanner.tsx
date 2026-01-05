import { useEffect, useRef, useState, useCallback } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
  onError?: (error: string) => void
  onClose?: () => void
}

export default function BarcodeScanner({ onScan, onError, onClose }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isStarting, setIsStarting] = useState(true)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop()
        scannerRef.current.clear()
      } catch {
        // Ignore errors when stopping
      }
      scannerRef.current = null
    }
  }, [])

  useEffect(() => {
    const startScanner = async () => {
      if (!containerRef.current) return

      const scannerId = 'barcode-scanner-container'
      containerRef.current.id = scannerId

      try {
        const html5Qrcode = new Html5Qrcode(scannerId)
        scannerRef.current = html5Qrcode

        await html5Qrcode.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 100 },
          },
          (decodedText) => {
            onScan(decodedText)
          },
          () => {
            // QR code not detected - this is normal, ignore
          }
        )

        setIsStarting(false)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to start camera'
        setCameraError(errorMessage)
        onError?.(errorMessage)
        setIsStarting(false)
      }
    }

    startScanner()

    return () => {
      stopScanner()
    }
  }, [onScan, onError, stopScanner])

  const handleClose = async () => {
    await stopScanner()
    onClose?.()
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-black/80">
        <h2 className="text-white text-lg font-semibold">Scan Barcode</h2>
        <button
          onClick={handleClose}
          className="text-white p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Scanner viewport */}
      <div className="flex-1 relative">
        <div ref={containerRef} className="w-full h-full" />

        {isStarting && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="text-center text-white">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white mx-auto mb-4" />
              <p>Starting camera...</p>
            </div>
          </div>
        )}

        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black p-4">
            <div className="text-center text-white max-w-sm">
              <svg className="w-16 h-16 mx-auto mb-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-lg font-medium mb-2">Camera Access Denied</p>
              <p className="text-sm text-gray-400 mb-4">{cameraError}</p>
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-white text-black rounded-lg font-medium"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Help text */}
      {!cameraError && !isStarting && (
        <div className="p-4 bg-black/80 text-center">
          <p className="text-white/70 text-sm">
            Position the barcode within the frame
          </p>
        </div>
      )}
    </div>
  )
}
