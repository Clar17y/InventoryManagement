import { useEffect, useRef, useState, useCallback } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
  onError?: (error: string) => void
  onClose?: () => void
}

// Retail barcode formats only - reduces false positives
const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.QR_CODE,
]

export default function BarcodeScanner({ onScan, onError, onClose }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const hasScannedRef = useRef(false)
  const [isStarting, setIsStarting] = useState(true)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<string>('')

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState()
        if (state === 2) { // Html5QrcodeScannerState.SCANNING
          await scannerRef.current.stop()
        }
      } catch {
        // Ignore stop errors
      }
      scannerRef.current = null
    }
  }, [])

  const handleSuccessfulScan = useCallback((decodedText: string) => {
    if (hasScannedRef.current) return
    hasScannedRef.current = true

    // Vibrate on successful scan (mobile feedback)
    if (navigator.vibrate) {
      navigator.vibrate(200)
    }

    stopScanner()
    onScan(decodedText)
  }, [onScan, stopScanner])

  useEffect(() => {
    const startScanner = async () => {
      // Check secure context
      if (!navigator.mediaDevices?.getUserMedia) {
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        const errorMsg = isLocalhost
          ? 'Camera API is not available in this browser.'
          : 'Camera access requires HTTPS. Please access this page via HTTPS or use localhost.'
        setCameraError(errorMsg)
        onError?.(errorMsg)
        setIsStarting(false)
        return
      }

      try {
        const scanner = new Html5Qrcode('barcode-reader', {
          formatsToSupport: SUPPORTED_FORMATS,
          verbose: false,
        })
        scannerRef.current = scanner

        // Get cameras and prefer back camera
        const cameras = await Html5Qrcode.getCameras()
        setDebugInfo(`Found ${cameras.length} cameras`)

        if (cameras.length === 0) {
          throw new Error('No cameras found on this device')
        }

        const backCamera = cameras.find(c =>
          c.label.toLowerCase().includes('back') ||
          c.label.toLowerCase().includes('rear') ||
          c.label.toLowerCase().includes('environment')
        )
        const selectedCamera = backCamera ?? cameras[0]
        setDebugInfo(`Using: ${selectedCamera?.label || 'default camera'}`)

        // Start scanning with optimized config for barcodes
        await scanner.start(
          selectedCamera?.id ?? { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 280, height: 120 }, // Rectangular for linear barcodes
            aspectRatio: 1.777778, // 16:9
            disableFlip: true, // Barcodes don't need flip detection
          },
          handleSuccessfulScan,
          () => {
            // Ignore scan failures - just means no barcode in frame
          }
        )

        setIsStarting(false)
      } catch (err) {
        console.error('Scanner start error:', err)
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
  }, [onError, handleSuccessfulScan, stopScanner])

  const handleClose = () => {
    stopScanner()
    onClose?.()
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-black/80">
        <h2 className="text-white text-lg font-semibold">Scan Barcode</h2>
        <button
          type="button"
          onClick={handleClose}
          className="text-white p-2 hover:bg-white/10 rounded-lg transition-colors"
          aria-label="Close scanner"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Scanner viewport */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-black">
        {/* html5-qrcode renders into this div */}
        <div
          id="barcode-reader"
          className="w-full h-full"
          style={{ maxWidth: '100%', maxHeight: '100%' }}
        />

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
              <p className="text-lg font-medium mb-2">Camera Access Error</p>
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

      {/* Help text with debug info */}
      {!cameraError && !isStarting && (
        <div className="p-4 bg-black/80 text-center">
          <p className="text-white/70 text-sm">
            Position the barcode within the frame
          </p>
          {debugInfo && (
            <p className="text-white/40 text-xs mt-1">{debugInfo}</p>
          )}
        </div>
      )}
    </div>
  )
}
