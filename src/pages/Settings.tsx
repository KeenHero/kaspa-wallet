import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Network,
  Key,
  Trash2,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
  UserRound,
  BookUser,
  Plus,
  Edit3,
  Trash,
  Lock,
  LogOut,
  Wallet,
  Import,
  TimerReset,
  ShieldAlert,
  X,
  Eye,
  EyeOff,
} from 'lucide-react'
import { useWalletStore } from '../stores/walletStore'
import { NETWORKS } from '../types'
import { generateMnemonic } from '../lib/wallet'
import { Button } from '../components/ui/Button'

const AUTO_LOCK_PRESETS = [0, 1, 5, 15, 30, 60]

function formatPreset(minutes: number): string {
  if (minutes === 0) return 'Never'
  if (minutes === 1) return '1 min'
  return `${minutes} min`
}

export default function SettingsPage() {
  const {
    network,
    setNetwork,
    lockWallet,
    logout,
    deleteWallet,
    address,
    wallet,
    walletProfiles,
    activeWalletId,
    activeWalletName,
    autoLockMinutes,
    setAutoLockMinutes,
    importAdditionalWallet,
    switchWallet,
    renameWallet,
    revealWalletMnemonic,
    selectedAccountId,
    createAccount,
    switchAccount,
    renameAccount,
    contacts,
    addContact,
    removeContact,
    error,
    clearError,
  } = useWalletStore()
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const [copied, setCopied] = useState(false)
  const [contactName, setContactName] = useState('')
  const [contactAddress, setContactAddress] = useState('')
  const [customAutoLock, setCustomAutoLock] = useState(String(autoLockMinutes))
  const [isManagingWallet, setIsManagingWallet] = useState(false)

  const [showCreateWalletModal, setShowCreateWalletModal] = useState(false)
  const [newWalletName, setNewWalletName] = useState('')
  const [newWalletMnemonic, setNewWalletMnemonic] = useState('')
  const [newWalletConfirmed, setNewWalletConfirmed] = useState(false)
  const [newWalletCopied, setNewWalletCopied] = useState(false)

  const [backupWalletId, setBackupWalletId] = useState(activeWalletId)
  const [backupPassword, setBackupPassword] = useState('')
  const [revealedSeed, setRevealedSeed] = useState('')
  const [revealedSeedCopied, setRevealedSeedCopied] = useState(false)
  const [isRevealingSeed, setIsRevealingSeed] = useState(false)
  const [isSeedVisible, setIsSeedVisible] = useState(false)

  useEffect(() => {
    setCustomAutoLock(String(autoLockMinutes))
  }, [autoLockMinutes])

  useEffect(() => {
    if (activeWalletId) {
      setBackupWalletId(activeWalletId)
      setRevealedSeed('')
      setRevealedSeedCopied(false)
      setIsSeedVisible(false)
    }
  }, [activeWalletId])

  const networkContacts = useMemo(
    () => contacts.filter((contact) => contact.networkId === network.id),
    [contacts, network.id]
  )

  const copyAddress = () => {
    navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleAddContact = () => {
    const added = addContact(contactName, contactAddress)
    if (added) {
      setContactName('')
      setContactAddress('')
    }
  }

  const openCreateWalletModal = () => {
    const defaultName = `Wallet ${walletProfiles.length + 1}`
    setNewWalletName(defaultName)
    setNewWalletMnemonic(generateMnemonic())
    setNewWalletConfirmed(false)
    setNewWalletCopied(false)
    setShowCreateWalletModal(true)
  }

  const copyNewWalletSeed = async () => {
    await navigator.clipboard.writeText(newWalletMnemonic)
    setNewWalletCopied(true)
    setTimeout(() => setNewWalletCopied(false), 1500)
  }

  const confirmCreateWallet = async () => {
    if (!newWalletConfirmed || !newWalletMnemonic) return
    try {
      setIsManagingWallet(true)
      await importAdditionalWallet(newWalletMnemonic, newWalletName)
      setShowCreateWalletModal(false)
    } finally {
      setIsManagingWallet(false)
    }
  }

  const handleImportWallet = async () => {
    const mnemonic = window.prompt('Enter seed phrase (12 or 24 words)')
    if (!mnemonic?.trim()) return
    const defaultName = `Wallet ${walletProfiles.length + 1}`
    const name = window.prompt('Wallet name', defaultName)?.trim()
    if (name === undefined) return

    try {
      setIsManagingWallet(true)
      await importAdditionalWallet(mnemonic.trim(), name || defaultName)
    } finally {
      setIsManagingWallet(false)
    }
  }

  const handleSwitchWallet = async (walletId: string) => {
    if (walletId === activeWalletId) return
    try {
      setIsManagingWallet(true)
      await switchWallet(walletId)
    } finally {
      setIsManagingWallet(false)
    }
  }

  const handleDeleteWallet = async () => {
    try {
      setIsManagingWallet(true)
      await deleteWallet(activeWalletId)
    } finally {
      setIsManagingWallet(false)
    }
  }

  const applyCustomAutoLock = () => {
    const parsed = Number(customAutoLock)
    if (!Number.isFinite(parsed) || parsed < 0) return
    setAutoLockMinutes(parsed)
  }

  const handleRevealSeed = async () => {
    if (!backupWalletId) return
    try {
      setIsRevealingSeed(true)
      clearError()
      const mnemonic = await revealWalletMnemonic(backupWalletId, backupPassword)
      setRevealedSeed(mnemonic)
      setRevealedSeedCopied(false)
      setIsSeedVisible(true)
    } finally {
      setIsRevealingSeed(false)
    }
  }

  const handleCopyRevealedSeed = async () => {
    if (!revealedSeed) return
    await navigator.clipboard.writeText(revealedSeed)
    setRevealedSeedCopied(true)
    setTimeout(() => setRevealedSeedCopied(false), 1500)
  }

  const revealedWords = revealedSeed.split(' ').filter(Boolean)
  const generatedWords = newWalletMnemonic.split(' ').filter(Boolean)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">
          Settings
        </h1>
        <p className="text-muted-foreground mt-1">Manage your wallet preferences</p>
      </motion.div>

      {error && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/40 p-3 text-sm text-destructive flex items-center justify-between">
          <span>{error}</span>
          <button onClick={clearError} className="underline underline-offset-2">
            Dismiss
          </button>
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.03 }}
        className="rounded-2xl bg-card border border-border overflow-hidden"
      >
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
            <Lock className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="font-semibold">Session</h2>
            <p className="text-sm text-muted-foreground">Lock or logout from this wallet session</p>
          </div>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button variant="outline" onClick={lockWallet} className="w-full">
            <Lock className="w-4 h-4 mr-2" />
            Lock Wallet
          </Button>
          <Button variant="outline" onClick={logout} className="w-full">
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-2xl bg-card border border-border overflow-hidden"
      >
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h2 className="font-semibold">Wallets</h2>
            <p className="text-sm text-muted-foreground">Create, import, switch, and rename wallets</p>
          </div>
        </div>
        <div className="p-4 space-y-3">
          {walletProfiles.map((walletProfile) => (
            <div
              key={walletProfile.id}
              className={`w-full p-4 rounded-xl border ${
                activeWalletId === walletProfile.id
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-muted/40'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{walletProfile.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Created {new Date(walletProfile.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => void handleSwitchWallet(walletProfile.id)}
                    disabled={isManagingWallet}
                    className="px-3 py-2 rounded-lg text-xs bg-muted hover:bg-muted/80 transition-colors disabled:opacity-50"
                  >
                    {activeWalletId === walletProfile.id ? 'Active' : 'Login'}
                  </button>
                  <button
                    onClick={() => {
                      const nextName = window.prompt('Rename wallet', walletProfile.name)
                      if (nextName) renameWallet(walletProfile.id, nextName)
                    }}
                    className="p-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                    title="Rename wallet"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button onClick={openCreateWalletModal} variant="outline" className="w-full" disabled={isManagingWallet}>
              <Plus className="w-4 h-4 mr-2" />
              Create Wallet
            </Button>
            <Button onClick={() => void handleImportWallet()} variant="outline" className="w-full" disabled={isManagingWallet}>
              <Import className="w-4 h-4 mr-2" />
              Import Wallet
            </Button>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.07 }}
        className="rounded-2xl bg-card border border-border overflow-hidden"
      >
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h2 className="font-semibold">Seed Backup</h2>
            <p className="text-sm text-muted-foreground">Reveal and backup seed phrase for any wallet</p>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select
              value={backupWalletId}
              onChange={(event) => {
                setBackupWalletId(event.target.value)
                setRevealedSeed('')
                setRevealedSeedCopied(false)
                setIsSeedVisible(false)
              }}
              className="px-3 py-2 rounded-lg bg-muted border border-border focus:border-primary focus:outline-none"
            >
              {walletProfiles.map((walletProfile) => (
                <option key={walletProfile.id} value={walletProfile.id}>
                  {walletProfile.name}
                </option>
              ))}
            </select>
            <input
              type="password"
              value={backupPassword}
              onChange={(event) => setBackupPassword(event.target.value)}
              placeholder="Wallet password"
              className="px-3 py-2 rounded-lg bg-muted border border-border focus:border-primary focus:outline-none"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => void handleRevealSeed()}
            disabled={isRevealingSeed || !backupWalletId}
            className="w-full"
          >
            <Eye className="w-4 h-4 mr-2" />
            {isRevealingSeed ? 'Revealing...' : 'Reveal Seed Phrase'}
          </Button>

          {revealedWords.length > 0 && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsSeedVisible((value) => !value)}
                  className="w-full"
                >
                  {isSeedVisible ? (
                    <>
                      <EyeOff className="w-4 h-4 mr-2" />
                      Hide Seed Phrase
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4 mr-2" />
                      Show Seed Phrase
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={() => void handleCopyRevealedSeed()} className="w-full" disabled={!isSeedVisible}>
                  {revealedSeedCopied ? (
                    <>
                      <Check className="w-4 h-4 mr-2 text-green-500" />
                      Seed Phrase Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-2" />
                      Copy Seed Phrase
                    </>
                  )}
                </Button>
              </div>

              {isSeedVisible ? (
                <div className="grid grid-cols-2 gap-2">
                  {revealedWords.map((word, index) => (
                    <div key={`${word}_${index}`} className="px-3 py-2 rounded-lg bg-muted border border-border text-sm">
                      <span className="text-muted-foreground mr-2">{index + 1}.</span>
                      <span className="font-mono">{word}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                  Seed phrase is hidden. Click &quot;Show Seed Phrase&quot; to view it again.
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="rounded-2xl bg-card border border-border overflow-hidden"
      >
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
            <TimerReset className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h2 className="font-semibold">Auto Lock</h2>
            <p className="text-sm text-muted-foreground">Lock wallet after inactivity</p>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {AUTO_LOCK_PRESETS.map((preset) => (
              <button
                key={preset}
                onClick={() => setAutoLockMinutes(preset)}
                className={`px-3 py-2 rounded-lg text-xs transition-colors ${
                  autoLockMinutes === preset
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:bg-muted/80'
                }`}
              >
                {formatPreset(preset)}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              step={1}
              value={customAutoLock}
              onChange={(event) => setCustomAutoLock(event.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-muted border border-border focus:border-primary focus:outline-none"
              placeholder="Custom minutes"
            />
            <Button variant="outline" onClick={applyCustomAutoLock}>
              Apply
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Current auto-lock: {autoLockMinutes === 0 ? 'Never' : `${autoLockMinutes} minute(s)`}
          </p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl bg-card border border-border overflow-hidden"
      >
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
            <UserRound className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="font-semibold">Accounts</h2>
            <p className="text-sm text-muted-foreground">Create, switch, and rename accounts</p>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {wallet?.accounts.map((account) => (
            <div
              key={account.id}
              className={`w-full p-4 rounded-xl border ${
                selectedAccountId === account.id
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-muted/40'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{account.name}</p>
                  <p className="text-xs text-muted-foreground font-mono break-all mt-1">{account.address}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => switchAccount(account.id)}
                    className="px-3 py-2 rounded-lg text-xs bg-muted hover:bg-muted/80 transition-colors"
                  >
                    {selectedAccountId === account.id ? 'Active' : 'Switch'}
                  </button>
                  <button
                    onClick={() => {
                      const nextName = window.prompt('Rename account', account.name)
                      if (nextName) renameAccount(account.id, nextName)
                    }}
                    className="p-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                    title="Rename account"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          <Button onClick={createAccount} variant="outline" className="w-full">
            <Plus className="w-4 h-4 mr-2" />
            Create New Account
          </Button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="rounded-2xl bg-card border border-border overflow-hidden"
      >
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <Network className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="font-semibold">Network</h2>
            <p className="text-sm text-muted-foreground">Select which network to connect to</p>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {Object.entries(NETWORKS).map(([key, net]) => (
            <button
              key={key}
              onClick={() => setNetwork(key)}
              className={`w-full flex items-center justify-between p-4 rounded-xl transition-all ${
                network.name === net.name
                  ? 'bg-primary/10 border border-primary'
                  : 'bg-muted/50 border border-transparent hover:border-primary/30'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${net.isTestnet ? 'bg-yellow-500' : 'bg-green-500'}`} />
                <div className="text-left">
                  <p className="font-medium">{net.name}</p>
                  <p className="text-xs text-muted-foreground">{net.apiUrl}</p>
                </div>
              </div>
              {network.name === net.name && (
                <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-4 h-4 text-primary-foreground" />
                </div>
              )}
            </button>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-2xl bg-card border border-border overflow-hidden"
      >
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <BookUser className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="font-semibold">Address Book</h2>
            <p className="text-sm text-muted-foreground">Save recipient addresses for {network.name}</p>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Contact name"
              className="px-3 py-2 rounded-lg bg-muted border border-border focus:border-primary focus:outline-none"
            />
            <input
              value={contactAddress}
              onChange={(e) => setContactAddress(e.target.value)}
              placeholder={`${network.prefix}:...`}
              className="px-3 py-2 rounded-lg bg-muted border border-border focus:border-primary focus:outline-none font-mono text-sm"
            />
          </div>
          <Button onClick={handleAddContact} variant="outline" className="w-full">
            <Plus className="w-4 h-4 mr-2" />
            Add Contact
          </Button>

          {networkContacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No contacts saved for this network yet.</p>
          ) : (
            <div className="space-y-2">
              {networkContacts.map((contact) => (
                <div key={contact.id} className="p-3 rounded-lg bg-muted/40 border border-border flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{contact.name}</p>
                    <p className="text-xs text-muted-foreground font-mono break-all mt-1">{contact.address}</p>
                  </div>
                  <button
                    onClick={() => removeContact(contact.id)}
                    className="p-2 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors"
                    title="Remove contact"
                  >
                    <Trash className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-2xl bg-card border border-border overflow-hidden"
      >
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <Key className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h2 className="font-semibold">Wallet Information</h2>
            <p className="text-sm text-muted-foreground">Your active wallet and account details</p>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Active Wallet</p>
            <p className="font-medium">{activeWalletName || 'Wallet'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Address</p>
            <div className="flex items-center gap-2">
              <p className="font-mono text-sm bg-muted p-3 rounded-lg flex-1 break-all">{address}</p>
              <button onClick={copyAddress} className="p-3 rounded-lg bg-muted hover:bg-muted/80 transition-colors">
                {copied ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div>
            <p className="text-sm text-muted-foreground mb-1">Created</p>
            <p className="font-medium">{wallet?.createdAt ? new Date(wallet.createdAt).toLocaleString() : 'Unknown'}</p>
          </div>

          <div>
            <p className="text-sm text-muted-foreground mb-1">Account Type</p>
            <p className="font-medium">Standard (BIP39)</p>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="rounded-2xl bg-card border border-destructive/30 overflow-hidden"
      >
        <div className="p-4 border-b border-destructive/30 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-destructive/20 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <h2 className="font-semibold text-destructive">Danger Zone</h2>
            <p className="text-sm text-muted-foreground">Delete active wallet profile</p>
          </div>
        </div>

        <div className="p-4">
          {!showConfirmDelete ? (
            <Button variant="destructive" onClick={() => setShowConfirmDelete(true)} className="w-full" disabled={isManagingWallet}>
              <Trash2 className="w-5 h-5 mr-2" />
              Delete Active Wallet
            </Button>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-destructive">
                Are you sure you want to delete <strong>{activeWalletName}</strong>? This action cannot be undone.
                Make sure you have backed up your seed phrase.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setShowConfirmDelete(false)} className="flex-1">
                  Cancel
                </Button>
                <Button variant="destructive" onClick={() => void handleDeleteWallet()} className="flex-1" disabled={isManagingWallet}>
                  Yes, Delete
                </Button>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-2xl bg-card border border-border p-4"
      >
        <div className="flex flex-col sm:flex-row gap-3">
          <a
            href={network.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-muted hover:bg-muted/80 transition-colors"
          >
            <ExternalLink className="w-5 h-5" />
            Block Explorer
          </a>
          <a
            href="https://kaspa.org"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-muted hover:bg-muted/80 transition-colors"
          >
            <ExternalLink className="w-5 h-5" />
            Official Website
          </a>
        </div>
      </motion.div>

      {showCreateWalletModal && (
        <div className="fixed inset-0 z-50 bg-black/60 p-4 md:p-8" onClick={() => setShowCreateWalletModal(false)}>
          <div
            className="max-w-2xl mx-auto mt-4 md:mt-8 rounded-2xl bg-card border border-border overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Create Wallet Backup</h2>
                <p className="text-sm text-muted-foreground">Save this seed phrase before continuing</p>
              </div>
              <button onClick={() => setShowCreateWalletModal(false)} className="p-2 rounded-lg hover:bg-muted transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-200/90 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 text-yellow-400" />
                <span>Store this phrase offline. Anyone with it can access your funds.</span>
              </div>

              <input
                type="text"
                value={newWalletName}
                onChange={(event) => setNewWalletName(event.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-muted border border-border focus:border-primary focus:outline-none"
                placeholder="Wallet name"
              />

              <div className="grid grid-cols-2 gap-2">
                {generatedWords.map((word, index) => (
                  <div key={`${word}_${index}`} className="px-3 py-2 rounded-lg bg-muted border border-border text-sm">
                    <span className="text-muted-foreground mr-2">{index + 1}.</span>
                    <span className="font-mono">{word}</span>
                  </div>
                ))}
              </div>

              <Button variant="outline" onClick={() => void copyNewWalletSeed()} className="w-full">
                {newWalletCopied ? (
                  <>
                    <Check className="w-4 h-4 mr-2 text-green-500" />
                    Seed Phrase Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Seed Phrase
                  </>
                )}
              </Button>

              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={newWalletConfirmed}
                  onChange={(event) => setNewWalletConfirmed(event.target.checked)}
                  className="mt-1"
                />
                <span>I saved this seed phrase and understand this is required to recover this wallet.</span>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" onClick={() => setShowCreateWalletModal(false)}>
                  Cancel
                </Button>
                <Button onClick={() => void confirmCreateWallet()} disabled={!newWalletConfirmed || isManagingWallet}>
                  {isManagingWallet ? 'Creating...' : 'Create Wallet'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
