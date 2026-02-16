import { useState } from 'react'
import { motion } from 'framer-motion'
import { QrCode, Copy, Check } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useWalletStore } from '../stores/walletStore'

export default function ReceivePage() {
  const { address, network } = useWalletStore()
  const [copied, setCopied] = useState(false)

  const copyAddress = () => {
    navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const explorerUrl = `${network.explorerUrl}/addresses/${address}`

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">
          Receive KAS
        </h1>
        <p className="text-muted-foreground mt-1">Share your address to receive Kaspa</p>
      </motion.div>

      {/* QR Code Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl bg-card border border-border p-8"
      >
        <div className="flex flex-col items-center">
          {/* QR Code */}
          <div className="relative p-4 bg-white rounded-2xl mb-6">
            <QRCodeSVG
              value={address}
              size={240}
              level="H"
              includeMargin={false}
              bgColor="ffffff"
              fgColor="000000"
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-blue-600 rounded-xl flex items-center justify-center">
                <span className="text-white font-bold text-2xl">K</span>
              </div>
            </div>
          </div>

          {/* Address */}
          <div className="text-center mb-6">
            <p className="text-sm text-muted-foreground mb-2">Your Address</p>
            <p className="font-mono text-sm md:text-base break-all px-4">
              {address}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={copyAddress}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-5 h-5 text-green-500" />
                  <span className="text-green-500">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-5 h-5" />
                  Copy
                </>
              )}
            </button>
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 transition-colors"
            >
              <QrCode className="w-5 h-5" />
              View in Explorer
            </a>
          </div>
        </div>
      </motion.div>

      {/* Info Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-2xl bg-card border border-border p-6"
      >
        <h3 className="font-semibold mb-4">Receiving Information</h3>
        <ul className="space-y-3 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
            <span>Send only Kaspa (KAS) to this address</span>
          </li>
          <li className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
            <span>Transactions require a small network fee</span>
          </li>
          <li className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
            <span>Wait for at least 1 confirmation before considering the transaction final</span>
          </li>
          <li className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
            <span>Do not send tokens or NFTs - this is a native KAS address only</span>
          </li>
        </ul>
      </motion.div>

      {/* Network Badge */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex justify-center"
      >
        <div className={`px-4 py-2 rounded-full text-sm font-medium ${
          network.isTestnet 
            ? 'bg-yellow-500/20 text-yellow-500' 
            : 'bg-green-500/20 text-green-500'
        }`}>
          {network.name}
        </div>
      </motion.div>
    </div>
  )
}
