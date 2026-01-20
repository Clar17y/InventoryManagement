import { LinkIcon, XMarkIcon } from '@heroicons/react/24/outline'
import type { EtsyAccount } from '../../../lib/api'

export default function EtsyAccessManagementSection({
  etsyAccounts,
  loadingAccounts,
  accountsError,
  onConnectEtsy,
  onSetDefaultAccount,
  onRemoveAccount,
}: {
  etsyAccounts: EtsyAccount[]
  loadingAccounts: boolean
  accountsError: string | null
  onConnectEtsy: () => void
  onSetDefaultAccount: (userId: string) => void
  onRemoveAccount: (userId: string, shopName: string) => void
}) {
  return (
    <section className="card space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-medium">Etsy Access Management</h3>
        {loadingAccounts && <span className="text-sm text-gray-500">Loading...</span>}
      </div>
      <p className="text-sm text-gray-500">
        Manage connected Etsy accounts and provisional users (up to 5 users for app testing)
      </p>

      {accountsError && <div className="alert-danger">{accountsError}</div>}

      {/* Connected Accounts */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-700">Connected Accounts</h4>
        {etsyAccounts.length === 0 ? (
          <div className="text-center py-6 text-gray-500">
            <LinkIcon className="h-10 w-10 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No Etsy accounts connected</p>
          </div>
        ) : (
          <div className="space-y-2">
            {etsyAccounts.map((account) => (
              <div key={account.userId} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {account.shopName}
                    {account.isAppOwner && (
                      <span className="text-xs bg-info-100 text-info-700 px-1.5 py-0.5 rounded">App Owner</span>
                    )}
                    {account.isDefault && (
                      <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Default</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">{account.loginName || `User ${account.userId}`}</div>
                </div>
                <div className="flex items-center gap-2">
                  {!account.isDefault && (
                    <button
                      onClick={() => onSetDefaultAccount(account.userId)}
                      className="text-sm text-primary-600 hover:text-primary-700"
                    >
                      Set Default
                    </button>
                  )}
                  <button
                    onClick={() => onRemoveAccount(account.userId, account.shopName)}
                    className="p-1 text-gray-400 hover:text-red-600"
                    title="Remove account"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <button onClick={onConnectEtsy} className="btn-primary text-sm">
          Connect Etsy Account
        </button>
      </div>

      {/* Info about multi-user access */}
      <div className="pt-4 border-t">
        <p className="text-xs text-gray-500">
          <strong>Note:</strong> Each user needs to click &quot;Connect Etsy Account&quot; to authorize this app. Personal
          access allows up to 5 connected shops. Set the shop you want to use as &quot;Default&quot;.
        </p>
      </div>
    </section>
  )
}
