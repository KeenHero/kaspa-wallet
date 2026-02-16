import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Wallet, AlertCircle, CheckCircle2, ArrowRight, Zap, AlertTriangle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useWalletStore } from '../stores/walletStore'
import { formatKaspaAmount, sompiToKaspa, kaspaToSompi } from '../lib/kaspa'
import { isValidKaspaAddress } from '../lib/wallet'
import { Button } from '../components/ui/Button'

type Step = 'form' | 'confirm' | 'success' | 'error'

function formatEta(seconds?: number): string {
  if (seconds === undefined || seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
    return 'N/A'
  }

  if (seconds < 1) return '<1s'
  if (seconds < 60) return `${Math.round(seconds)}s`

  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `~${minutes} min`

  const hours = Math.round((minutes / 60) * 10) / 10
  return `~${hours} h`
}

function resolvePresetEta(
  tier: 'slow' | 'normal' | 'fast',
  slowSeconds?: number,
  normalSeconds?: number,
  fastSeconds?: number
): number | undefined {
  if (tier === 'slow') return slowSeconds
  if (tier === 'normal') return normalSeconds
  return fastSeconds
}

function resolveCustomEta(
  customFee: number,
  baseline: { slow: number; normal: number; fast: number; slowSeconds?: number; normalSeconds?: number; fastSeconds?: number }
): number | undefined {
  if (customFee >= baseline.fast) return baseline.fastSeconds
  if (customFee >= baseline.normal) return baseline.normalSeconds
  return baseline.slowSeconds
}

export default function SendPage() {
  const navigate = useNavigate()
  const {
    wallet,
    selectedAccountId,
    contacts,
    addContact,
    balance,
    feeEstimate,
    sendFeeEstimate,
    isEstimatingFees,
    estimateSendFees,
    network,
    sendTransaction,
    isLoading,
    error,
    clearError,
  } = useWalletStore()
  
  const [step, setStep] = useState<Step>('form')
  const [toAddress, setToAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [selectedFee, setSelectedFee] = useState<'slow' | 'normal' | 'fast'>('normal')
  const [feeMode, setFeeMode] = useState<'preset' | 'custom'>('preset')
  const [customFeeKas, setCustomFeeKas] = useState('')
  const [selectedContactId, setSelectedContactId] = useState('')
  const [txHash, setTxHash] = useState('')
  const [localError, setLocalError] = useState('')

  const activeAccount = wallet?.accounts.find((account) => account.id === selectedAccountId) ?? wallet?.accounts[0]
  const networkContacts = useMemo(
    () => contacts.filter((contact) => contact.networkId === network.id),
    [contacts, network.id]
  )
  const selectedContact = useMemo(
    () => networkContacts.find((contact) => contact.id === selectedContactId),
    [networkContacts, selectedContactId]
  )
  const normalizedToAddress = toAddress.trim().toLowerCase()
  const isRecipientSaved = networkContacts.some((contact) => contact.address === normalizedToAddress)

  const activeFeeEstimate = sendFeeEstimate ?? feeEstimate
  const presetFee = activeFeeEstimate[selectedFee]
  const customFeeSompi = kaspaToSompi(Number.parseFloat(customFeeKas) || 0)
  const fee = feeMode === 'custom' ? customFeeSompi : presetFee
  const amountSompi = kaspaToSompi(parseFloat(amount) || 0)
  const totalSompi = amountSompi + fee
  const remainingBalance = balance - totalSompi
  const etaSeconds = feeMode === 'custom'
    ? resolveCustomEta(customFeeSompi, activeFeeEstimate)
    : resolvePresetEta(
        selectedFee,
        activeFeeEstimate.slowSeconds,
        activeFeeEstimate.normalSeconds,
        activeFeeEstimate.fastSeconds
      )

  const reviewWarnings = useMemo(() => {
    const warnings: string[] = []
    if (!normalizedToAddress || !activeAccount) {
      return warnings
    }

    if (normalizedToAddress === activeAccount.address.toLowerCase()) {
      warnings.push('Recipient matches your active account. This will be a self-transfer.')
    }

    if (!isRecipientSaved) {
      warnings.push('Recipient is not in your address book. Double-check the address before sending.')
    }

    if (amountSompi > 0 && fee >= amountSompi) {
      warnings.push('Network fee is equal to or higher than the send amount.')
    }

    if (amountSompi > 0 && amountSompi < 1000) {
      warnings.push('Very small send amounts may be uneconomical after fees.')
    }

    return warnings
  }, [normalizedToAddress, activeAccount, isRecipientSaved, amountSompi, fee])

  useEffect(() => {
    const parsedAmount = parseFloat(amount)
    const amountForEstimate = kaspaToSompi(Number.isFinite(parsedAmount) ? parsedAmount : 0)

    const timer = setTimeout(() => {
      void estimateSendFees(toAddress, amountForEstimate)
    }, 350)

    return () => clearTimeout(timer)
  }, [toAddress, amount, estimateSendFees, network.id, feeEstimate.normal])

  useEffect(() => {
    if (!selectedContactId) return
    const selectedContact = networkContacts.find((contact) => contact.id === selectedContactId)
    if (selectedContact) {
      setToAddress(selectedContact.address)
    }
  }, [selectedContactId, networkContacts])

  const validateForm = () => {
    if (!toAddress) {
      setLocalError('Please enter a recipient address')
      return false
    }
    if (!isValidKaspaAddress(toAddress, network)) {
      setLocalError('Invalid Kaspa address')
      return false
    }
    if (!amount || parseFloat(amount) <= 0) {
      setLocalError('Please enter a valid amount')
      return false
    }
    if (feeMode === 'custom') {
      if (!customFeeKas || customFeeSompi <= 0) {
        setLocalError('Please enter a valid custom fee')
        return false
      }
      if (customFeeSompi < 1000) {
        setLocalError('Custom fee must be at least 0.00001000 KAS')
        return false
      }
    }
    if (totalSompi > balance) {
      setLocalError('Insufficient balance')
      return false
    }
    setLocalError('')
    return true
  }

  const handleReview = () => {
    if (!validateForm()) return
    clearError()
    setStep('confirm')
  }

  const handleSend = async () => {
    if (!validateForm()) return
    
    try {
      const txId = await sendTransaction(toAddress, amountSompi, fee)
      setTxHash(txId)
      setStep('success')
    } catch {
      setStep('error')
    }
  }

  const setMaxAmount = () => {
    const max = sompiToKaspa(balance - fee)
    setAmount(Math.max(0, max).toFixed(8))
  }

  const handleSaveRecipient = () => {
    if (!normalizedToAddress || !isValidKaspaAddress(normalizedToAddress, network)) {
      setLocalError('Enter a valid recipient address before saving')
      return
    }

    const defaultName = `Contact ${networkContacts.length + 1}`
    const name = window.prompt('Contact name', defaultName)?.trim()
    if (!name) return

    const added = addContact(name, normalizedToAddress)
    if (added) {
      setLocalError('')
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">
          Send KAS
        </h1>
        <p className="text-muted-foreground mt-1">Send Kaspa to any address</p>
        {activeAccount && (
          <p className="text-xs text-muted-foreground mt-2">
            From: <span className="font-medium">{activeAccount.name}</span>
          </p>
        )}
      </motion.div>

      <AnimatePresence mode="wait">
        {step === 'form' && (
          <motion.div
            key="form"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            {/* Balance Display */}
            <div className="rounded-2xl bg-card border border-border p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
                    <Wallet className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Available Balance</p>
                    <p className="text-2xl font-bold">{formatKaspaAmount(balance)} KAS</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Send Form */}
            <div className="rounded-2xl bg-card border border-border p-6 space-y-6">
              {/* Recipient Address */}
              <div>
                <label className="text-sm font-medium mb-2 block">Recipient Address</label>
                {networkContacts.length > 0 && (
                  <div className="flex gap-2 mb-2">
                    <select
                      value={selectedContactId}
                      onChange={(e) => setSelectedContactId(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-lg bg-muted border border-border focus:border-primary focus:outline-none text-sm"
                    >
                      <option value="">Choose from contacts</option>
                      {networkContacts.map((contact) => (
                        <option key={contact.id} value={contact.id}>
                          {contact.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleSaveRecipient}
                      disabled={isRecipientSaved}
                      className="px-3 py-2 rounded-lg bg-muted border border-border hover:bg-muted/80 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isRecipientSaved ? 'Saved' : 'Save'}
                    </button>
                  </div>
                )}
                <input
                  type="text"
                  value={toAddress}
                  onChange={(e) => setToAddress(e.target.value)}
                  placeholder="kaspa..."
                  className="w-full px-4 py-3 rounded-xl bg-muted border border-border focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono text-sm"
                />
                {networkContacts.length === 0 && (
                  <button
                    onClick={handleSaveRecipient}
                    className="mt-2 text-xs text-primary hover:underline"
                  >
                    Save this address to contacts
                  </button>
                )}
              </div>

              {/* Amount */}
              <div>
                <label className="text-sm font-medium mb-2 block">Amount (KAS)</label>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    step="0.00000001"
                    className="w-full px-4 py-3 pr-24 rounded-xl bg-muted border border-border focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-2xl"
                  />
                  <button
                    onClick={setMaxAmount}
                    className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1 text-xs font-medium bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors"
                  >
                    MAX
                  </button>
                </div>
              </div>

              {/* Fee Selection */}
              <div>
                <label className="text-sm font-medium mb-2 block">Transaction Fee</label>
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setFeeMode('preset')}
                    className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                      feeMode === 'preset' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
                    }`}
                  >
                    Presets
                  </button>
                  <button
                    onClick={() => setFeeMode('custom')}
                    className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                      feeMode === 'custom' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
                    }`}
                  >
                    Advanced
                  </button>
                </div>

                {feeMode === 'preset' ? (
                  <div className="grid grid-cols-3 gap-3">
                    {(['slow', 'normal', 'fast'] as const).map((tier) => (
                      <button
                        key={tier}
                        onClick={() => {
                          setFeeMode('preset')
                          setSelectedFee(tier)
                        }}
                        className={`p-4 rounded-xl border transition-all ${
                          selectedFee === tier
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Zap className={`w-4 h-4 ${tier === 'fast' ? 'text-yellow-400' : 'text-muted-foreground'}`} />
                          <span className="font-medium capitalize">{tier}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {(activeFeeEstimate[tier] / 100000000).toFixed(8)} KAS
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatEta(
                            tier === 'slow'
                              ? activeFeeEstimate.slowSeconds
                              : tier === 'normal'
                                ? activeFeeEstimate.normalSeconds
                                : activeFeeEstimate.fastSeconds
                          )}
                        </p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-2">
                    <label className="text-xs text-muted-foreground block">Custom Fee (KAS)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.00000001"
                      value={customFeeKas}
                      onChange={(e) => setCustomFeeKas(e.target.value)}
                      placeholder="0.00002000"
                      className="w-full px-3 py-2 rounded-lg bg-muted border border-border focus:border-primary focus:outline-none"
                    />
                    <p className="text-xs text-muted-foreground">
                      Minimum recommended fee: 0.00001000 KAS
                    </p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-3">
                  {isEstimatingFees
                    ? 'Estimating transaction mass and required fee...'
                    : sendFeeEstimate
                      ? 'Fee values are estimated for this specific transaction.'
                      : 'Fee values are baseline estimates and may adjust at broadcast.'}
                </p>
              </div>

              {/* Summary */}
              <div className="rounded-xl bg-muted/50 p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Amount</span>
                  <span>{amount || '0'} KAS</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Fee</span>
                  <span>{(fee / 100000000).toFixed(8)} KAS</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Estimated Confirmation</span>
                  <span>{formatEta(etaSeconds)}</span>
                </div>
                <div className="border-t border-border pt-2 flex justify-between font-semibold">
                  <span>Total</span>
                  <span>{sompiToKaspa(totalSompi).toFixed(8)} KAS</span>
                </div>
                {remainingBalance >= 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Remaining</span>
                    <span>{formatKaspaAmount(remainingBalance)} KAS</span>
                  </div>
                )}
              </div>

              {/* Error */}
              {(localError || error) && (
                <div className="flex items-center gap-2 p-4 rounded-xl bg-destructive/10 text-destructive">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <p className="text-sm">{localError || error}</p>
                </div>
              )}

              {/* Send Button */}
              <Button
                onClick={handleReview}
                disabled={isLoading || !toAddress || !amount}
                className="w-full h-14 text-lg"
              >
                <div className="flex items-center gap-2">
                  Review Transaction
                  <ArrowRight className="w-5 h-5" />
                </div>
              </Button>
            </div>
          </motion.div>
        )}

        {step === 'confirm' && (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="rounded-2xl bg-card border border-border p-6 space-y-6"
          >
            <div>
              <h2 className="text-2xl font-bold">Review Transaction</h2>
              <p className="text-muted-foreground text-sm mt-1">
                Confirm the details below before broadcasting to {network.name}.
              </p>
            </div>

            <div className="space-y-3 rounded-xl bg-muted/50 p-4">
              <div className="flex justify-between gap-4">
                <span className="text-sm text-muted-foreground">From</span>
                <span className="text-sm font-medium text-right">{activeAccount?.name || 'Active account'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-sm text-muted-foreground">To</span>
                <span className="text-sm font-medium text-right break-all">
                  {selectedContact?.name ? `${selectedContact.name} (${toAddress})` : toAddress}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-sm text-muted-foreground">Amount</span>
                <span className="text-sm font-medium">{amount || '0'} KAS</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-sm text-muted-foreground">Network Fee</span>
                <span className="text-sm font-medium">{(fee / 100000000).toFixed(8)} KAS</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-sm text-muted-foreground">Estimated Confirmation</span>
                <span className="text-sm font-medium">{formatEta(etaSeconds)}</span>
              </div>
              <div className="border-t border-border pt-3 flex justify-between gap-4 font-semibold">
                <span>Total</span>
                <span>{sompiToKaspa(totalSompi).toFixed(8)} KAS</span>
              </div>
            </div>

            {reviewWarnings.length > 0 && (
              <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-400" />
                  <p className="text-sm font-medium text-yellow-300">Please double-check</p>
                </div>
                <ul className="space-y-1 text-sm text-yellow-200/90">
                  {reviewWarnings.map((warning) => (
                    <li key={warning}>• {warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {(localError || error) && (
              <div className="flex items-center gap-2 p-4 rounded-xl bg-destructive/10 text-destructive">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm">{localError || error}</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => setStep('form')} className="w-full">
                Back
              </Button>
              <Button onClick={handleSend} disabled={isLoading} className="w-full">
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    Confirm & Send
                    <ArrowRight className="w-5 h-5" />
                  </div>
                )}
              </Button>
            </div>
          </motion.div>
        )}

        {step === 'success' && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl bg-card border border-border p-8 text-center"
          >
            <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Transaction Sent!</h2>
            <p className="text-muted-foreground mb-6">Your transaction has been broadcast to the network</p>
            
            <div className="p-4 rounded-xl bg-muted/50 mb-6 text-left">
              <p className="text-xs text-muted-foreground mb-1">Transaction ID</p>
              <p className="font-mono text-sm break-all">{txHash}</p>
            </div>

            <div className="flex gap-4">
              <Button
                variant="outline"
                onClick={() => {
                  setStep('form')
                  setToAddress('')
                  setAmount('')
                  setCustomFeeKas('')
                  setSelectedContactId('')
                  setFeeMode('preset')
                  setSelectedFee('normal')
                  setTxHash('')
                }}
                className="flex-1"
              >
                Send Another
              </Button>
              <Button
                onClick={() => navigate('/history')}
                className="flex-1"
              >
                View History
              </Button>
            </div>
          </motion.div>
        )}

        {step === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl bg-card border border-border p-8 text-center"
          >
            <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-10 h-10 text-red-500" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Transaction Failed</h2>
            <p className="text-muted-foreground mb-6">{error || 'An error occurred while sending your transaction'}</p>
            
            <Button
              onClick={() => {
                setStep('form')
                clearError()
              }}
              className="w-full"
            >
              Try Again
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
