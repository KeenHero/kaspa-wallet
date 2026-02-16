import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Import, ArrowRight, Sparkles, Shield, Copy, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useWalletStore } from '../stores/walletStore'
import { generateMnemonic } from '../lib/wallet'
import { Button } from '../components/ui/Button'

function validatePasswordPair(password: string, confirmPassword: string): string | null {
  if (!password || !confirmPassword) {
    return 'Please enter and confirm your password'
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters'
  }
  if (password !== confirmPassword) {
    return 'Passwords do not match'
  }
  return null
}

type CreateStep = 'form' | 'backup' | 'created'

export default function Welcome() {
  const navigate = useNavigate()
  const {
    importWallet,
    setNetwork,
    network,
    isLoading,
    error: storeError,
    clearError,
  } = useWalletStore()
  const [showImport, setShowImport] = useState(false)
  const [mnemonic, setMnemonic] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createConfirmPassword, setCreateConfirmPassword] = useState('')
  const [createWalletName, setCreateWalletName] = useState('Wallet 1')
  const [generatedMnemonic, setGeneratedMnemonic] = useState('')
  const [hasConfirmedBackup, setHasConfirmedBackup] = useState(false)
  const [seedCopied, setSeedCopied] = useState(false)
  const [importPassword, setImportPassword] = useState('')
  const [importConfirmPassword, setImportConfirmPassword] = useState('')
  const [importWalletName, setImportWalletName] = useState('Wallet 1')
  const [step, setStep] = useState<CreateStep>('form')
  const [localError, setLocalError] = useState('')

  const generatedWords = useMemo(() => generatedMnemonic.split(' ').filter(Boolean), [generatedMnemonic])

  const handlePrepareCreateWallet = () => {
    clearError()
    setLocalError('')
    const passwordError = validatePasswordPair(createPassword, createConfirmPassword)
    if (passwordError) {
      setLocalError(passwordError)
      return
    }

    const seed = generateMnemonic()
    setGeneratedMnemonic(seed)
    setHasConfirmedBackup(false)
    setSeedCopied(false)
    setStep('backup')
  }

  const handleCreateWallet = async () => {
    clearError()
    setLocalError('')

    if (!generatedMnemonic) {
      setLocalError('Missing generated seed phrase. Go back and create again.')
      return
    }

    if (!hasConfirmedBackup) {
      setLocalError('Please confirm you have safely backed up your seed phrase')
      return
    }

    try {
      await importWallet(generatedMnemonic, createPassword, createWalletName)
      setStep('created')
      setTimeout(() => navigate('/'), 1200)
    } catch {
      // Store error is already set.
    }
  }

  const handleImport = async () => {
    clearError()
    setLocalError('')

    if (!mnemonic.trim()) {
      setLocalError('Please enter your seed phrase')
      return
    }

    const passwordError = validatePasswordPair(importPassword, importConfirmPassword)
    if (passwordError) {
      setLocalError(passwordError)
      return
    }

    try {
      await importWallet(mnemonic.trim(), importPassword, importWalletName)
      navigate('/')
    } catch {
      // Store error is already set.
    }
  }

  const copyGeneratedSeed = async () => {
    if (!generatedMnemonic) return
    await navigator.clipboard.writeText(generatedMnemonic)
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
        className="relative w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-purple-500/30">
            <span className="text-white font-bold text-4xl">K</span>
          </div>
          <h1 className="text-3xl font-bold">Kaspa Wallet</h1>
          <p className="text-muted-foreground mt-2">Secure, Fast, Modern</p>
        </div>

        <div className="mb-6">
          <p className="text-sm text-center text-muted-foreground mb-2">Select Network</p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => setNetwork('mainnet')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                network.isTestnet
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-primary text-primary-foreground'
              }`}
            >
              Mainnet
            </button>
            <button
              onClick={() => setNetwork('testnet10')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                !network.isTestnet
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-primary text-primary-foreground'
              }`}
            >
              Testnet
            </button>
          </div>
        </div>

        {(localError || storeError) && (
          <div className="mb-4 p-4 rounded-xl bg-red-500/20 border border-red-500/50 text-red-400 text-sm">
            {localError || storeError}
          </div>
        )}

        {step === 'form' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="p-6 rounded-2xl bg-card border border-border space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-white flex items-center justify-center">
                  <Plus className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-semibold text-lg">Create New Wallet</p>
                  <p className="text-sm text-muted-foreground">Generate and encrypt a new wallet</p>
                </div>
              </div>

              <div className="space-y-3">
                <input
                  type="text"
                  value={createWalletName}
                  onChange={(event) => setCreateWalletName(event.target.value)}
                  placeholder="Wallet name"
                  className="w-full px-3 py-3 rounded-xl bg-muted border border-border focus:border-primary focus:outline-none"
                />
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="password"
                    value={createPassword}
                    onChange={(event) => setCreatePassword(event.target.value)}
                    placeholder="Wallet password"
                    className="w-full pl-10 pr-3 py-3 rounded-xl bg-muted border border-border focus:border-primary focus:outline-none"
                  />
                </div>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="password"
                    value={createConfirmPassword}
                    onChange={(event) => setCreateConfirmPassword(event.target.value)}
                    placeholder="Confirm password"
                    className="w-full pl-10 pr-3 py-3 rounded-xl bg-muted border border-border focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <Button onClick={handlePrepareCreateWallet} disabled={isLoading} className="w-full">
                <span className="flex items-center gap-2">
                  {isLoading ? 'Preparing...' : 'Create Wallet'}
                  <ArrowRight className="w-4 h-4" />
                </span>
              </Button>
            </div>

            <button
              onClick={() => setShowImport((value) => !value)}
              className="w-full p-6 rounded-2xl bg-card border border-border hover:border-primary/50 transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                  <Import className="w-7 h-7 text-muted-foreground" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-lg">Import Existing Wallet</p>
                  <p className="text-muted-foreground text-sm">Use seed phrase and encrypt it</p>
                </div>
                <ArrowRight className="w-5 h-5 ml-auto text-muted-foreground group-hover:translate-x-1 transition-transform" />
              </div>
            </button>

            {showImport && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="p-6 rounded-2xl bg-card border border-border space-y-4"
              >
                <p className="text-sm text-muted-foreground">
                  Enter your 12 or 24 word seed phrase and set a password to encrypt wallet storage.
                </p>
                <textarea
                  value={mnemonic}
                  onChange={(event) => setMnemonic(event.target.value)}
                  placeholder="word1 word2 word3 ..."
                  className="w-full h-28 px-4 py-3 rounded-xl bg-muted border border-border focus:border-primary focus:outline-none resize-none font-mono text-sm"
                />
                <input
                  type="text"
                  value={importWalletName}
                  onChange={(event) => setImportWalletName(event.target.value)}
                  placeholder="Wallet name"
                  className="w-full px-4 py-3 rounded-xl bg-muted border border-border focus:border-primary focus:outline-none"
                />
                <input
                  type="password"
                  value={importPassword}
                  onChange={(event) => setImportPassword(event.target.value)}
                  placeholder="Wallet password"
                  className="w-full px-4 py-3 rounded-xl bg-muted border border-border focus:border-primary focus:outline-none"
                />
                <input
                  type="password"
                  value={importConfirmPassword}
                  onChange={(event) => setImportConfirmPassword(event.target.value)}
                  placeholder="Confirm password"
                  className="w-full px-4 py-3 rounded-xl bg-muted border border-border focus:border-primary focus:outline-none"
                />
                <Button onClick={() => void handleImport()} disabled={isLoading} className="w-full">
                  {isLoading ? 'Importing...' : 'Import Wallet'}
                </Button>
              </motion.div>
            )}
          </motion.div>
        )}

        {step === 'backup' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 rounded-2xl bg-card border border-border space-y-4"
          >
            <div className="flex items-start gap-3 p-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10">
              <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5" />
              <p className="text-sm text-yellow-200/90">
                Write down your seed phrase in order and keep it offline. Anyone with this phrase can control your wallet.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {generatedWords.map((word, index) => (
                <div key={`${word}_${index}`} className="px-3 py-2 rounded-lg bg-muted border border-border text-sm">
                  <span className="text-muted-foreground mr-2">{index + 1}.</span>
                  <span className="font-mono">{word}</span>
                </div>
              ))}
            </div>

            <Button variant="outline" onClick={() => void copyGeneratedSeed()} className="w-full">
              {seedCopied ? (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />
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

            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => setStep('form')} className="w-full">
                Back
              </Button>
              <Button onClick={() => void handleCreateWallet()} className="w-full" disabled={!hasConfirmedBackup || isLoading}>
                {isLoading ? 'Creating...' : 'Continue'}
              </Button>
            </div>
          </motion.div>
        )}

        {step === 'created' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-8 rounded-2xl bg-card border border-border text-center"
          >
            <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
              <Sparkles className="w-10 h-10 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Wallet Created!</h2>
            <p className="text-muted-foreground">Redirecting to your wallet...</p>
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}
