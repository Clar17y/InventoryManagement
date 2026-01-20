import { ArrowPathRoundedSquareIcon, PlusIcon } from '@heroicons/react/24/outline'
import EtsySyncPanel from '../../../components/EtsySyncPanel'

export default function HampersHeader({
  showForm,
  setShowForm,
  showEtsyPanel,
  setShowEtsyPanel,
  onImportComplete,
}: {
  showForm: boolean
  setShowForm: (value: boolean) => void
  showEtsyPanel: boolean
  setShowEtsyPanel: (value: boolean) => void
  onImportComplete: () => void
}) {
  return (
    <>
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Hampers</h2>
        <div className="flex gap-2">
          {!showForm && (
            <>
              <button
                onClick={() => setShowEtsyPanel(true)}
                className="btn-secondary flex items-center gap-1"
                title="Sync with Etsy"
              >
                <ArrowPathRoundedSquareIcon className="h-5 w-5" />
                Etsy Sync
              </button>
              <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-1">
                <PlusIcon className="h-5 w-5" />
                New Hamper
              </button>
            </>
          )}
        </div>
      </div>

      <EtsySyncPanel
        isOpen={showEtsyPanel}
        onClose={() => setShowEtsyPanel(false)}
        onImportComplete={onImportComplete}
      />
    </>
  )
}

