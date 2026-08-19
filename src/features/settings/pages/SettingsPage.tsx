import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { settings, etsy, suppliers, EtsyFeeConfig, PackagingOverhead, PostageTier, EtsyAccount, Supplier } from '../../../lib/api'
import EtsyAccessManagementSection from '../components/EtsyAccessManagementSection'
import EtsyFeesSection from '../components/EtsyFeesSection'
import PackagingOverheadSection from '../components/PackagingOverheadSection'
import PostageTiersSection from '../components/PostageTiersSection'
import SettingsLinksList from '../components/SettingsLinksList'
import SettingsSectionNav, { settingsSections, type SettingsSection } from '../components/SettingsSectionNav'
import SupplierManagementSection from '../components/SupplierManagementSection'

const settingsLinks = [
  {
    to: '/sales',
    title: 'Sales',
    description: 'View and manage sales records',
  },
  {
    to: '/analytics',
    title: 'Analytics',
    description: 'Charts and insights on inventory and sales',
  },
  {
    to: '/shopping-list',
    title: 'Shopping List',
    description: 'View low-stock products by supplier for restocking trips',
  },
  {
    to: '/categories',
    title: 'Categories',
    description: 'Manage component categories (Hand Cream, Chocolate, etc.)',
  },
  {
    to: '/products',
    title: 'Products',
    description: 'Manage products and their barcodes',
  },
  {
    to: '/expenses',
    title: 'Business Expenses',
    description: 'Track advertising, postage, packaging, and other costs',
  },
]

// Default Etsy fee rates (as of Jan 2024)
const DEFAULT_ETSY_FEES = {
  name: 'UK Etsy Fees 2024',
  transactionFee: 0.065, // 6.5%
  regulatoryFee: 0.0032, // 0.32%
  paymentFeePercent: 0.04, // 4%
  paymentFeeFixed: 0.20, // £0.20
  vatRate: 0.20, // 20%
  listingFee: 0.15, // £0.15
}

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [etsyFees, setEtsyFees] = useState<EtsyFeeConfig | null>(null)
  const [packagingOverheads, setPackagingOverheads] = useState<PackagingOverhead[]>([])
  const [packagingTotal, setPackagingTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Etsy fee editing
  const [editingEtsy, setEditingEtsy] = useState(false)
  const [etsyForm, setEtsyForm] = useState(DEFAULT_ETSY_FEES)

  // Packaging overhead editing
  const [newOverheadName, setNewOverheadName] = useState('')
  const [newOverheadCost, setNewOverheadCost] = useState('')

  // Postage tiers
  const [postageTiers, setPostageTiers] = useState<PostageTier[]>([])
  const [newEtsyCharge, setNewEtsyCharge] = useState('')
  const [newActualCost, setNewActualCost] = useState('')

  // Suppliers
  const [suppliersList, setSuppliersList] = useState<Supplier[]>([])
  const [newSupplierName, setNewSupplierName] = useState('')

  // Etsy Access Management
  const [etsyAccounts, setEtsyAccounts] = useState<EtsyAccount[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [accountsError, setAccountsError] = useState<string | null>(null)

  const requestedSection = searchParams.get('section')
  const activeSection: SettingsSection = settingsSections.some(({ id }) => id === requestedSection)
    ? requestedSection as SettingsSection
    : 'postage'

  const handleSectionChange = (section: SettingsSection) => {
    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.set('section', section)
    setSearchParams(nextSearchParams)
  }

  const loadSettings = async () => {
    try {
      setLoading(true)
      const [feesData, overheadData, tiersData, suppliersData] = await Promise.all([
        settings.getEtsyFees(),
        settings.getPackagingOverhead(),
        settings.getPostageTiers(),
        suppliers.list(),
      ])

      // Get the active config (first one since ordered by effectiveFrom desc)
      const activeConfig = feesData.find(f => f.isActive) || feesData[0] || null
      setEtsyFees(activeConfig)

      if (activeConfig) {
        setEtsyForm({
          name: activeConfig.name,
          transactionFee: Number(activeConfig.transactionFee),
          regulatoryFee: Number(activeConfig.regulatoryFee),
          paymentFeePercent: Number(activeConfig.paymentFeePercent),
          paymentFeeFixed: Number(activeConfig.paymentFeeFixed),
          vatRate: Number(activeConfig.vatRate),
          listingFee: Number(activeConfig.listingFee),
        })
      }

      setPackagingOverheads(overheadData.overheads)
      setPackagingTotal(overheadData.totalPerOrder)
      setPostageTiers(tiersData)
      setSuppliersList(suppliersData)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSettings()
  }, [])

  const handleSaveEtsyFees = async () => {
    setSaving(true)
    setError(null)
    try {
      await settings.createEtsyFees(etsyForm)
      setEditingEtsy(false)
      await loadSettings()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save Etsy fees')
    } finally {
      setSaving(false)
    }
  }

  const handleSetDefaultEtsyFees = async () => {
    setSaving(true)
    setError(null)
    try {
      await settings.createEtsyFees(DEFAULT_ETSY_FEES)
      await loadSettings()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set default fees')
    } finally {
      setSaving(false)
    }
  }

  const handleAddOverhead = async () => {
    if (!newOverheadName.trim() || !newOverheadCost) return

    setSaving(true)
    setError(null)
    try {
      await settings.createPackagingOverhead({
        name: newOverheadName.trim(),
        costPerOrder: parseFloat(newOverheadCost),
      })
      setNewOverheadName('')
      setNewOverheadCost('')
      await loadSettings()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add overhead')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteOverhead = async (id: string) => {
    if (!confirm('Delete this packaging overhead?')) return

    try {
      await settings.deletePackagingOverhead(id)
      await loadSettings()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete overhead')
    }
  }

  const handleAddPostageTier = async () => {
    if (!newEtsyCharge || !newActualCost) return
    setSaving(true)
    setError(null)
    try {
      await settings.createPostageTier({
        etsyCharge: parseFloat(newEtsyCharge),
        actualCost: parseFloat(newActualCost),
      })
      setNewEtsyCharge('')
      setNewActualCost('')
      await loadSettings()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add postage tier')
    } finally {
      setSaving(false)
    }
  }

  const handleDeletePostageTier = async (id: string) => {
    if (!confirm('Delete this postage tier?')) return
    try {
      await settings.deletePostageTier(id)
      await loadSettings()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete postage tier')
    }
  }

  const handleAddSupplier = async () => {
    if (!newSupplierName.trim()) return
    setSaving(true)
    setError(null)
    try {
      await suppliers.create({ name: newSupplierName.trim() })
      setNewSupplierName('')
      await loadSettings()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add supplier')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteSupplier = async (id: string) => {
    if (!confirm('Delete this supplier?')) return
    try {
      await suppliers.delete(id)
      await loadSettings()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete supplier')
    }
  }

  // Etsy Access Management handlers
  const loadEtsyAccounts = async () => {
    setLoadingAccounts(true)
    setAccountsError(null)
    try {
      const accountsRes = await etsy.getAccounts()
      setEtsyAccounts(accountsRes.accounts)
    } catch (err) {
      setAccountsError(err instanceof Error ? err.message : 'Failed to load Etsy accounts')
    } finally {
      setLoadingAccounts(false)
    }
  }

  useEffect(() => {
    loadEtsyAccounts()
  }, [])

  const handleConnectEtsy = async () => {
    try {
      const { authUrl } = await etsy.initiateAuth()
      window.location.href = authUrl
    } catch (err) {
      setAccountsError(err instanceof Error ? err.message : 'Failed to initiate Etsy connection')
    }
  }

  const handleSetDefaultAccount = async (userId: string) => {
    try {
      await etsy.setDefaultAccount(userId)
      await loadEtsyAccounts()
    } catch (err) {
      setAccountsError(err instanceof Error ? err.message : 'Failed to set default account')
    }
  }

  const handleRemoveAccount = async (userId: string, shopName: string) => {
    if (!confirm(`Remove ${shopName} from connected accounts?`)) return

    try {
      await etsy.removeAccount(userId)
      await loadEtsyAccounts()
    } catch (err) {
      setAccountsError(err instanceof Error ? err.message : 'Failed to remove account')
    }
  }

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Settings & More</h2>

      {error && (
        <div className="alert-danger">{error}</div>
      )}

      <SettingsLinksList links={settingsLinks} />

      <div className="grid gap-4 md:grid-cols-[12rem_minmax(0,1fr)] md:items-start">
        <SettingsSectionNav active={activeSection} onChange={handleSectionChange} />

        <section
          id={`settings-panel-${activeSection}`}
          role="tabpanel"
          aria-labelledby={`settings-tab-${activeSection}`}
          tabIndex={0}
        >
          {activeSection === 'etsy-fees' && (
            <EtsyFeesSection
              etsyFees={etsyFees}
              editing={editingEtsy}
              etsyForm={etsyForm}
              setEtsyForm={setEtsyForm}
              saving={saving}
              onStartEdit={() => setEditingEtsy(true)}
              onCancelEdit={() => setEditingEtsy(false)}
              onSave={handleSaveEtsyFees}
              onUseDefaults={handleSetDefaultEtsyFees}
            />
          )}

          {activeSection === 'packaging' && (
            <PackagingOverheadSection
              packagingOverheads={packagingOverheads}
              packagingTotal={packagingTotal}
              newOverheadName={newOverheadName}
              newOverheadCost={newOverheadCost}
              onNewOverheadNameChange={setNewOverheadName}
              onNewOverheadCostChange={setNewOverheadCost}
              saving={saving}
              onAddOverhead={handleAddOverhead}
              onDeleteOverhead={handleDeleteOverhead}
            />
          )}

          {activeSection === 'postage' && (
            <PostageTiersSection
              tiers={postageTiers}
              newEtsyCharge={newEtsyCharge}
              newActualCost={newActualCost}
              onNewEtsyChargeChange={setNewEtsyCharge}
              onNewActualCostChange={setNewActualCost}
              saving={saving}
              onAddTier={handleAddPostageTier}
              onDeleteTier={handleDeletePostageTier}
            />
          )}

          {activeSection === 'suppliers' && (
            <SupplierManagementSection
              suppliersList={suppliersList}
              newSupplierName={newSupplierName}
              onNewSupplierNameChange={setNewSupplierName}
              saving={saving}
              onAddSupplier={handleAddSupplier}
              onDeleteSupplier={handleDeleteSupplier}
            />
          )}

          {activeSection === 'audit' && (
            <section className="card space-y-2">
              <h3 className="font-medium">Audit History</h3>
              <p className="text-sm text-gray-500">Recent settings changes will appear here.</p>
            </section>
          )}
        </section>
      </div>

      <EtsyAccessManagementSection
        etsyAccounts={etsyAccounts}
        loadingAccounts={loadingAccounts}
        accountsError={accountsError}
        onConnectEtsy={handleConnectEtsy}
        onSetDefaultAccount={handleSetDefaultAccount}
        onRemoveAccount={handleRemoveAccount}
      />
    </div>
  )
}
