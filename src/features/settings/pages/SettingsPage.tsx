import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { settings, etsy, suppliers, EtsyFeeConfig, PackagingOverhead, PostageTier, EtsyAccount, Supplier, SettingsAuditEntry } from '../../../lib/api'
import type { PackagingOverheadCreateBody, PackagingOverheadUpdateBody, PostageTierCreateBody, PostageTierUpdateBody } from '#contracts/routes/settings'
import type { SupplierCreateBody, SupplierUpdateBody } from '#contracts/routes/suppliers'
import EtsyAccessManagementSection from '../components/EtsyAccessManagementSection'
import EtsyFeesSection from '../components/EtsyFeesSection'
import PackagingOverheadSection from '../components/PackagingOverheadSection'
import PostageTiersSection from '../components/PostageTiersSection'
import SettingsLinksList from '../components/SettingsLinksList'
import SettingsSectionNav, { settingsSections, type SettingsSection } from '../components/SettingsSectionNav'
import SupplierManagementSection from '../components/SupplierManagementSection'
import AuditHistorySection from '../components/AuditHistorySection'

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

  // Postage tiers
  const [postageTiers, setPostageTiers] = useState<PostageTier[]>([])

  // Suppliers
  const [suppliersList, setSuppliersList] = useState<Supplier[]>([])
  const [auditEntries, setAuditEntries] = useState<SettingsAuditEntry[]>([])

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

  const reloadPostageTiers = async () => {
    const tiers = await settings.getPostageTiers({ includeArchived: true })
    setPostageTiers(tiers)
  }

  const reloadPackagingOverheads = async () => {
    const overheads = await settings.getPackagingOverhead({ includeArchived: true })
    setPackagingOverheads(overheads.overheads)
    setPackagingTotal(overheads.totalPerOrder)
  }

  const reloadSuppliers = async () => {
    setSuppliersList(await suppliers.list({ includeArchived: true }))
  }

  const reloadAuditHistory = async () => {
    setAuditEntries(await settings.getAuditHistory())
  }

  const loadSettings = async () => {
    try {
      setLoading(true)
      const [feesData, overheadData, tiersData, suppliersData, auditData] = await Promise.all([
        settings.getEtsyFees(),
        settings.getPackagingOverhead({ includeArchived: true }),
        settings.getPostageTiers({ includeArchived: true }),
        suppliers.list({ includeArchived: true }),
        settings.getAuditHistory(),
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
      setAuditEntries(auditData)
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

  const handleCreateOverhead = async (data: PackagingOverheadCreateBody) => {
    const result = await settings.createPackagingOverhead(data)
    await reloadPackagingOverheads()
    await reloadAuditHistory()
    return result
  }
  const handleUpdateOverhead = async (id: string, data: PackagingOverheadUpdateBody) => {
    const result = await settings.updatePackagingOverhead(id, data)
    await reloadPackagingOverheads()
    await reloadAuditHistory()
    return result
  }
  const handleArchiveOverhead = async (id: string) => {
    await settings.deletePackagingOverhead(id)
    await reloadPackagingOverheads()
    await reloadAuditHistory()
  }
  const handleRestoreOverhead = async (id: string) => {
    const result = await settings.restorePackagingOverhead(id)
    await reloadPackagingOverheads()
    await reloadAuditHistory()
    return result
  }

  const handleCreatePostageTier = async (data: PostageTierCreateBody) => {
    const result = await settings.createPostageTier(data)
    await reloadPostageTiers()
    await reloadAuditHistory()
    return result
  }

  const handleUpdatePostageTier = async (id: string, data: PostageTierUpdateBody) => {
    const result = await settings.updatePostageTier(id, data)
    await reloadPostageTiers()
    await reloadAuditHistory()
    return result
  }

  const handleArchivePostageTier = async (id: string) => {
    await settings.deletePostageTier(id)
    await reloadPostageTiers()
    await reloadAuditHistory()
  }

  const handleRestorePostageTier = async (id: string) => {
    const result = await settings.restorePostageTier(id)
    await reloadPostageTiers()
    await reloadAuditHistory()
    return result
  }

  const handleCreateSupplier = async (data: SupplierCreateBody) => {
    const result = await suppliers.create(data)
    await reloadSuppliers()
    await reloadAuditHistory()
    return result
  }
  const handleUpdateSupplier = async (id: string, data: SupplierUpdateBody) => {
    const result = await suppliers.update(id, data)
    await reloadSuppliers()
    await reloadAuditHistory()
    return result
  }
  const handleArchiveSupplier = async (id: string) => {
    await suppliers.delete(id)
    await reloadSuppliers()
    await reloadAuditHistory()
  }
  const handleRestoreSupplier = async (id: string) => {
    const result = await suppliers.restore(id)
    await reloadSuppliers()
    await reloadAuditHistory()
    return result
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
              onCreate={handleCreateOverhead}
              onUpdate={handleUpdateOverhead}
              onArchive={handleArchiveOverhead}
              onRestore={handleRestoreOverhead}
            />
          )}

          {activeSection === 'postage' && (
            <PostageTiersSection
              tiers={postageTiers}
              onCreate={handleCreatePostageTier}
              onUpdate={handleUpdatePostageTier}
              onArchive={handleArchivePostageTier}
              onRestore={handleRestorePostageTier}
            />
          )}

          {activeSection === 'suppliers' && (
            <SupplierManagementSection
              suppliersList={suppliersList}
              onCreate={handleCreateSupplier}
              onUpdate={handleUpdateSupplier}
              onArchive={handleArchiveSupplier}
              onRestore={handleRestoreSupplier}
            />
          )}

          {activeSection === 'audit' && (
            <AuditHistorySection entries={auditEntries} />
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
