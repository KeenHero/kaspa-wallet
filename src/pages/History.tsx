import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { History, Search, TrendingUp, TrendingDown, Clock, ChevronRight, Copy, ExternalLink, X, Check } from 'lucide-react'
import { useWalletStore } from '../stores/walletStore'
import { formatKaspaAmount } from '../lib/kaspa'
import { Transaction } from '../types'
import { Button } from '../components/ui/Button'

export default function HistoryPage() {
  const { transactions, network, address, fetchTransactions, isLoading } = useWalletStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'received' | 'sent' | 'pending'>('all')
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)
  const [copiedHash, setCopiedHash] = useState(false)

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  const filteredTransactions = transactions.filter((tx) => {
    const matchesSearch = tx.hash.toLowerCase().includes(searchQuery.toLowerCase())
    const isSent = tx.inputs.some((i) => i.utxoEntry?.address === address)
    const isReceived = !isSent && tx.outputs.some((o) => o.address === address)
    const isPending = !tx.blockHash
    
    if (filter === 'received') return matchesSearch && isReceived
    if (filter === 'sent') return matchesSearch && isSent
    if (filter === 'pending') return matchesSearch && isPending
    return matchesSearch
  })

  const getTransactionType = (tx: Transaction) => {
    const received = tx.outputs.reduce((sum, o) => sum + (o.address === address ? o.amount : 0), 0)
    const inputFromWallet = tx.inputs.reduce(
      (sum, i) => sum + (i.utxoEntry?.address === address ? i.utxoEntry.amount : 0),
      0
    )
    const sent = Math.max(inputFromWallet - received - tx.fee, 0)
    if (sent > 0) return 'sent'
    if (received > 0) return 'received'
    return 'transfer'
  }

  const getTransactionAmount = (tx: Transaction) => {
    const received = tx.outputs.reduce((sum, o) => sum + (o.address === address ? o.amount : 0), 0)
    const inputFromWallet = tx.inputs.reduce(
      (sum, i) => sum + (i.utxoEntry?.address === address ? i.utxoEntry.amount : 0),
      0
    )
    const sent = Math.max(inputFromWallet - received - tx.fee, 0)
    return sent > 0 ? sent : received
  }

  const explorerUrl = (hash: string) => `${network.explorerUrl}/txs/${hash}`
  const selectedTxType = selectedTx ? getTransactionType(selectedTx) : null
  const selectedTxAmount = selectedTx ? getTransactionAmount(selectedTx) : 0
  const selectedTxPending = selectedTx ? !selectedTx.blockHash : false
  const selectedTxTimestamp = selectedTx
    ? selectedTx.timestamp > 1_000_000_000_000
      ? selectedTx.timestamp
      : selectedTx.timestamp * 1000
    : null

  const selectedCounterparty = useMemo(() => {
    if (!selectedTx || !selectedTxType) return null
    if (selectedTxType === 'sent') {
      return selectedTx.outputs.find((output) => output.address && output.address !== address)?.address ?? 'Unknown'
    }
    if (selectedTxType === 'received') {
      return selectedTx.inputs.find((input) => input.utxoEntry?.address && input.utxoEntry.address !== address)?.utxoEntry?.address ?? 'Unknown'
    }
    return 'Internal transfer'
  }, [selectedTx, selectedTxType, address])

  const copySelectedHash = () => {
    if (!selectedTx) return
    navigator.clipboard.writeText(selectedTx.hash)
    setCopiedHash(true)
    setTimeout(() => setCopiedHash(false), 1500)
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">
          Transaction History
        </h1>
        <p className="text-muted-foreground mt-1">View all your past transactions</p>
      </motion.div>

      {/* Search and Filter */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex flex-col md:flex-row gap-4"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by transaction ID..."
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-card border border-border focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'received', 'sent', 'pending'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                filter === f
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Transactions List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-2xl bg-card border border-border overflow-hidden"
      >
        {isLoading && transactions.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading transactions...</p>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="p-8 text-center">
            <History className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium">No transactions found</p>
            <p className="text-sm text-muted-foreground mt-1">
              {searchQuery || filter !== 'all' 
                ? 'Try adjusting your search or filter' 
                : 'Your transaction history will appear here'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            <AnimatePresence>
              {filteredTransactions.map((tx, index) => {
                const type = getTransactionType(tx)
                const amount = getTransactionAmount(tx)
                const isPending = !tx.blockHash
                const txTimestamp = tx.timestamp > 1_000_000_000_000 ? tx.timestamp : tx.timestamp * 1000
                
                return (
                  <motion.button
                    key={tx.hash}
                    onClick={() => {
                      setSelectedTx(tx)
                      setCopiedHash(false)
                    }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors group text-left"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                        type === 'received' 
                          ? 'bg-green-500/20 text-green-400' 
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {type === 'received' ? (
                          <TrendingUp className="w-6 h-6" />
                        ) : (
                          <TrendingDown className="w-6 h-6" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">
                          {type === 'received' ? 'Received' : type === 'sent' ? 'Sent' : 'Transfer'}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {isPending ? (
                            <span className="flex items-center gap-1 text-yellow-500">
                              <Clock className="w-3 h-3" />
                              Pending
                            </span>
                          ) : (
                            <span>{new Date(txTimestamp).toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className={`font-semibold ${
                          type === 'received' ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {type === 'received' ? '+' : '-'}{formatKaspaAmount(amount)} KAS
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Fee: {formatKaspaAmount(tx.fee)} KAS
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </div>
                  </motion.button>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {selectedTx && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm p-4 md:p-8"
            onClick={() => setSelectedTx(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              onClick={(event) => event.stopPropagation()}
              className="max-w-2xl mx-auto mt-4 md:mt-10 rounded-2xl bg-card border border-border overflow-hidden"
            >
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Transaction Details</h2>
                  <p className="text-sm text-muted-foreground">{selectedTxType === 'received' ? 'Incoming' : selectedTxType === 'sent' ? 'Outgoing' : 'Transfer'}</p>
                </div>
                <button onClick={() => setSelectedTx(null)} className="p-2 rounded-lg hover:bg-muted transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                <div className="rounded-xl bg-muted/40 p-4 space-y-3">
                  <div className="flex justify-between gap-4">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <span className={`text-sm font-medium ${selectedTxPending ? 'text-yellow-500' : 'text-green-500'}`}>
                      {selectedTxPending ? 'Pending' : 'Confirmed'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-sm text-muted-foreground">Amount</span>
                    <span className={`text-sm font-semibold ${selectedTxType === 'received' ? 'text-green-400' : 'text-red-400'}`}>
                      {selectedTxType === 'received' ? '+' : '-'}{formatKaspaAmount(selectedTxAmount)} KAS
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-sm text-muted-foreground">Network Fee</span>
                    <span className="text-sm font-medium">{formatKaspaAmount(selectedTx.fee)} KAS</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-sm text-muted-foreground">Date</span>
                    <span className="text-sm font-medium">{selectedTxTimestamp ? new Date(selectedTxTimestamp).toLocaleString() : 'Unknown'}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-sm text-muted-foreground">Counterparty</span>
                    <span className="text-sm font-medium text-right break-all">{selectedCounterparty}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Transaction Hash</p>
                  <div className="rounded-xl border border-border bg-muted/30 p-3 flex items-center gap-2">
                    <p className="font-mono text-xs md:text-sm break-all flex-1">{selectedTx.hash}</p>
                    <button
                      onClick={copySelectedHash}
                      className="p-2 rounded-lg hover:bg-muted transition-colors"
                      title="Copy transaction hash"
                    >
                      {copiedHash ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    onClick={() => window.open(explorerUrl(selectedTx.hash), '_blank', 'noopener,noreferrer')}
                    className="w-full"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open in Explorer
                  </Button>
                  <Button variant="ghost" onClick={() => setSelectedTx(null)} className="w-full">
                    Close
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
