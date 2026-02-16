import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle, AlertTriangle, Check, Copy, KeyRound, Lock, ShieldCheck } from 'lucide-react'
import { useWalletStore } from '../stores/walletStore'
import { generateMnemonic } from '../lib/wallet'
import { Button } from '../components/ui/Button'

export default function UnlockPage() {
  const {
    unlockWallet,
    createWalletFromLocked,
    secureLegacyWallet,
    needsMigration,
    walletProfiles,
    activeWalletId,
    isLoading,
    error,
    clearError,
  } = useWalletStore()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [selectedWalletId, setSelectedWalletId] = useState('')
  const [showCreateWallet, setShowCreateWallet] = useState(false)
  const [newWalletName, setNewWalletName] = useState('')
  const [newWalletMnemonic, setNewWalletMnemonic] = useState('')
  const [hasConfirmedBackup, setHasConfirmedBackup] = useState(false)
  const [seedCopied, setSeedCopied] = useState(false)
  const [localError, setLocalError] = useState('')
  const generatedWords = useMemo(
    () => newWalletMnemonic.split(' ').filter(Boolean),
    [newWalletMnemonic]
  )

  useEffect(() => {
    if (activeWalletId) {
      setSelectedWalletId(activeWalletId)
      return
    }
    if (!selectedWalletId && walletProfiles.length > 0) {
      setSelectedWalletId(walletProfiles[0].id)
    }
  }, [activeWalletId, walletProfiles, selectedWalletId])

  const handleSubmit = async () => {
    clearError()
    setLocalError('')

    try {
      if (needsMigration) {
        if (!password || password.length < 8) {
          setLocalError('Use a password with at least 8 characters')
          return
        }
        if (password !== confirmPassword) {
          setLocalError('Passwords do not match')
          return
        }
        await secureLegacyWallet(password)
        return
      }

      if (!password) {
        setLocalError('Please enter your wallet password')
        return
      }

      await unlockWallet(password, selectedWalletId || undefined)
    } catch {
      // Store error is already set.
    }
  }

  const handlePrepareCreateWallet = () => {
    clearError()
    setLocalError('')

    if (!password) {
      setLocalError('Enter your password first to create and unlock a new wallet')
      return
    }

    setNewWalletMnemonic(generateMnemonic())
    setHasConfirmedBackup(false)
    setSeedCopied(false)
  }

  const handleCreateWallet = async () => {
    clearError()
    setLocalError('')

    if (!newWalletMnemonic) {
      setLocalError('Missing generated seed phrase. Generate it again.')
      return
    }

    if (!hasConfirmedBackup) {
      setLocalError('Please confirm you backed up the seed phrase')
      return
    }

    const fallbackName = `Wallet ${walletProfiles.length + 1}`
    try {
      await createWalletFromLocked(password, newWalletName || fallbackName, newWalletMnemonic)
      setShowCreateWallet(false)
      setNewWalletMnemonic('')
      setHasConfirmedBackup(false)
      setSeedCopied(false)
    } catch {
      // Store error is already set.
    }
  }

  const copyGeneratedSeed = async () => {
    if (!newWalletMnemonic) return
    await navigator.clipboard.writeText(newWalletMnemonic)
    setSeedCopied(true)
    setTimeout(() => setSeedCopied(false), 1500)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md rounded-2xl bg-card border border-border p-6 md:p-8 space-y-6"
      >
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center mx-auto mb-4">
            {needsMigration ? <ShieldCheck className="w-8 h-8 text-white" /> : <Lock className="w-8 h-8 text-white" />}
          </div>
          <h1 className="text-2xl font-bold">
            {needsMigration ? 'Secure Wallet' : 'Unlock Wallet'}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {needsMigration
              ? 'Your wallet was found in legacy unencrypted storage. Set a password to encrypt it now.'
              : 'Enter your password to unlock your encrypted wallet.'}
          </p>
        </div>

        {(localError || error) && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/40 p-3 text-sm text-destructive flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5" />
            <span>{localError || error}</span>
          </div>
        )}

        {!needsMigration && walletProfiles.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Wallet</p>
            <div className="space-y-2 max-h-40 overflow-auto">
              {walletProfiles.map((walletProfile) => (
                <button
                  key={walletProfile.id}
                  onClick={() => setSelectedWalletId(walletProfile.id)}
                  className={`w-full text-left px-3 py-2 rounded-xl border transition-colors ${
                    selectedWalletId === walletProfile.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-muted/40 hover:bg-muted/70'
                  }`}
                >
                  <p className="text-sm font-medium">{walletProfile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Created {new Date(walletProfile.createdAt).toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {!needsMigration && (
          <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-3">
            <button
              onClick={() => {
                setShowCreateWallet((value) => {
                  const next = !value
                  if (!next) {
                    setNewWalletMnemonic('')
                    setHasConfirmedBackup(false)
                    setSeedCopied(false)
                  }
                  return next
                })
              }}
              className="text-sm font-medium text-primary hover:underline"
            >
              {showCreateWallet ? 'Hide Create Wallet' : 'Create a New Wallet'}
            </button>
            {showCreateWallet && (
              <div className="space-y-2">
                <input
                  type="text"
                  value={newWalletName}
                  onChange={(event) => setNewWalletName(event.target.value)}
                  placeholder={`Wallet ${walletProfiles.length + 1}`}
                  className="w-full px-3 py-2 rounded-lg bg-muted border border-border focus:border-primary focus:outline-none"
                />

                {!newWalletMnemonic && (
                  <Button
                    variant="outline"
                    onClick={handlePrepareCreateWallet}
                    className="w-full"
                    disabled={isLoading}
                  >
                    Generate Seed Phrase
                  </Button>
                )}

                {newWalletMnemonic && (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-200/90 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 mt-0.5 text-yellow-400" />
                      <span>Save this seed phrase offline before creating this wallet.</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {generatedWords.map((word, index) => (
                        <div key={`${word}_${index}`} className="px-3 py-2 rounded-lg bg-card border border-border text-sm">
                          <span className="text-muted-foreground mr-2">{index + 1}.</span>
                          <span className="font-mono">{word}</span>
                        </div>
                      ))}
                    </div>

                    <Button variant="outline" onClick={() => void copyGeneratedSeed()} className="w-full">
                      {seedCopied ? (
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
                        checked={hasConfirmedBackup}
                        onChange={(event) => setHasConfirmedBackup(event.target.checked)}
                        className="mt-1"
                      />
                      <span>I saved this seed phrase securely and understand it is required to recover my wallet.</span>
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setNewWalletMnemonic('')
                          setHasConfirmedBackup(false)
                          setSeedCopied(false)
                        }}
                      >
                        Back
                      </Button>
                      <Button
                        onClick={() => void handleCreateWallet()}
                        className="w-full"
                        disabled={isLoading || !hasConfirmedBackup}
                      >
                        {isLoading ? 'Creating...' : 'Create & Login'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">
              {needsMigration ? 'New Password' : 'Password'}
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void handleSubmit()
                  }
                }}
                placeholder={needsMigration ? 'At least 8 characters' : 'Wallet password'}
                className="w-full pl-10 pr-3 py-3 rounded-xl bg-muted border border-border focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {needsMigration && (
            <div>
              <label className="text-sm font-medium mb-2 block">Confirm Password</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      void handleSubmit()
                    }
                  }}
                  placeholder="Repeat password"
                  className="w-full pl-10 pr-3 py-3 rounded-xl bg-muted border border-border focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
          )}
        </div>

        <Button onClick={() => void handleSubmit()} className="w-full h-12" disabled={isLoading}>
          {isLoading ? 'Processing...' : needsMigration ? 'Encrypt & Continue' : 'Unlock'}
        </Button>
      </motion.div>
    </div>
  )
}
