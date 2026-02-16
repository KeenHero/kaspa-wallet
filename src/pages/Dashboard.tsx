import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Wallet, TrendingUp, TrendingDown, Clock, RefreshCw, Copy, ExternalLink, Zap } from 'lucide-react'
import { useWalletStore } from '../stores/walletStore'
import { formatKaspaAmount } from '../lib/kaspa'

function formatEta(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return 'N/A'
  if (seconds < 60) return `${Math.round(seconds)}s`

  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `~${minutes} min`

  const hours = Math.round((minutes / 60) * 10) / 10
  return `~${hours} h`
}

export default function Dashboard() {
  const { 
    balance, 
    utxos, 
    transactions, 
    network, 
    address,
    wallet,
    selectedAccountId,
    isLoading,
    fetchBalance,
    fetchTransactions,
    feeEstimate
  } = useWalletStore()

  useEffect(() => {
    fetchBalance()
    fetchTransactions()
  }, [fetchBalance, fetchTransactions])

  const recentTransactions = transactions.slice(0, 5)
  const pendingCount = transactions.filter(tx => !tx.blockHash).length
  const activeAccount = wallet?.accounts.find((account) => account.id === selectedAccountId) ?? wallet?.accounts[0]

  const copyAddress = () => {
    navigator.clipboard.writeText(address)
  }

  const explorerUrl = `${network.explorerUrl}/addresses/${address}`

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">
            Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            {activeAccount ? `Active account: ${activeAccount.name}` : 'Welcome to your Kaspa wallet'}
          </p>
        </div>
        <button
          onClick={() => { fetchBalance(); fetchTransactions(); }}
          className="p-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
        >
          <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </motion.div>

      {/* Balance Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-900/50 via-blue-900/50 to-cyan-900/50 border border-white/10"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 to-blue-600/20" />
        <div className="absolute -top-20 -right-20 w-60 h-60 bg-purple-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-blue-500/20 rounded-full blur-3xl" />
        
        <div className="relative p-6 md:p-8">
          <div className="flex items-center gap-2 text-white/60 mb-4">
            <Wallet className="w-5 h-5" />
            <span className="text-sm font-medium">Total Balance</span>
          </div>
          
          <div className="flex items-baseline gap-2">
            <span className="text-4xl md:text-6xl font-bold text-white">
              {formatKaspaAmount(balance)}
            </span>
            <span className="text-xl text-white/60">KAS</span>
          </div>
          
          <div className="flex flex-wrap gap-4 mt-6">
            <div className="flex items-center gap-2 text-white/60">
              <Zap className="w-4 h-4" />
              <span className="text-sm">{utxos.length} UTXOs</span>
            </div>
            {pendingCount > 0 && (
              <div className="flex items-center gap-2 text-yellow-400">
                <Clock className="w-4 h-4" />
                <span className="text-sm">{pendingCount} Pending</span>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Address Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-2xl bg-card border border-border p-6"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Your Address</p>
            <p className="font-mono text-sm md:text-base break-all">{address}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={copyAddress}
              className="p-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
              title="Copy address"
            >
              <Copy className="w-5 h-5" />
            </button>
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
              title="View in explorer"
            >
              <ExternalLink className="w-5 h-5" />
            </a>
          </div>
        </div>
      </motion.div>

      {/* Fee Info */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        <div className="rounded-xl bg-card border border-border p-4">
          <p className="text-sm text-muted-foreground mb-1">Slow Fee</p>
          <p className="text-lg font-semibold">{(feeEstimate.slow / 100000000).toFixed(8)} KAS</p>
          <p className="text-xs text-muted-foreground">{formatEta(feeEstimate.slowSeconds)}</p>
        </div>
        <div className="rounded-xl bg-card border border-border p-4">
          <p className="text-sm text-muted-foreground mb-1">Normal Fee</p>
          <p className="text-lg font-semibold">{(feeEstimate.normal / 100000000).toFixed(8)} KAS</p>
          <p className="text-xs text-muted-foreground">{formatEta(feeEstimate.normalSeconds)}</p>
        </div>
        <div className="rounded-xl bg-card border border-border p-4">
          <p className="text-sm text-muted-foreground mb-1">Fast Fee</p>
          <p className="text-lg font-semibold">{(feeEstimate.fast / 100000000).toFixed(8)} KAS</p>
          <p className="text-xs text-muted-foreground">{formatEta(feeEstimate.fastSeconds)}</p>
        </div>
      </motion.div>

      {/* Recent Transactions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="rounded-2xl bg-card border border-border overflow-hidden"
      >
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold">Recent Transactions</h2>
        </div>
        
        {recentTransactions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <p>No transactions yet</p>
            <p className="text-sm mt-1">Your transaction history will appear here</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recentTransactions.map((tx) => {
              const isOutgoing = tx.inputs.some((input) => input.utxoEntry?.address === address)
              const inputFromWallet = tx.inputs.reduce(
                (sum, input) => sum + (input.utxoEntry?.address === address ? input.utxoEntry.amount : 0),
                0
              )
              const outputToWallet = tx.outputs.reduce(
                (sum, output) => sum + (output.address === address ? output.amount : 0),
                0
              )
              const displayAmount = isOutgoing
                ? Math.max(inputFromWallet - outputToWallet - tx.fee, 0)
                : outputToWallet
              const txUrl = `${network.explorerUrl}/txs/${tx.hash}`
              const txTimestamp = tx.timestamp > 1_000_000_000_000 ? tx.timestamp : tx.timestamp * 1000
              
              return (
                <a
                  key={tx.hash}
                  href={txUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      isOutgoing ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'
                    }`}>
                      {isOutgoing ? <TrendingDown className="w-5 h-5" /> : <TrendingUp className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="font-medium">
                        {isOutgoing ? 'Sent' : 'Received'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {tx.blockHash ? 'Confirmed' : 'Pending'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${isOutgoing ? 'text-red-400' : 'text-green-400'}`}>
                      {isOutgoing ? '-' : '+'}{formatKaspaAmount(displayAmount)} KAS
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(txTimestamp).toLocaleDateString()}
                    </p>
                  </div>
                </a>
              )
            })}
          </div>
        )}
      </motion.div>
    </div>
  )
}
