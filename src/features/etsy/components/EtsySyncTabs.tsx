import { ArrowUpTrayIcon, TagIcon, CurrencyDollarIcon } from '@heroicons/react/24/outline'

type EtsySyncTab = 'inventory' | 'skus' | 'prices'

export default function EtsySyncTabs({
  activeTab,
  onSelectInventory,
  onSelectSkus,
  onSelectPrices,
}: {
  activeTab: EtsySyncTab
  onSelectInventory: () => void
  onSelectSkus: () => void
  onSelectPrices: () => void
}) {
  const getTabClass = (tab: EtsySyncTab) =>
    `px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === tab
      ? 'border-primary-500 text-primary-600'
      : 'border-transparent text-gray-500 hover:text-gray-700'
    }`

  return (
    <div className="flex border-b border-gray-200">
      <button onClick={onSelectInventory} className={getTabClass('inventory')}>
        <ArrowUpTrayIcon className="h-4 w-4 inline mr-1" />
        Inventory Sync
      </button>
      <button onClick={onSelectSkus} className={getTabClass('skus')}>
        <TagIcon className="h-4 w-4 inline mr-1" />
        SKU Sync
      </button>
      <button onClick={onSelectPrices} className={getTabClass('prices')}>
        <CurrencyDollarIcon className="h-4 w-4 inline mr-1" />
        Price Sync
      </button>
    </div>
  )
}

