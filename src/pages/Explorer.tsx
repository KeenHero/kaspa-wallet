import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Blocks,
  Clock3,
  Coins,
  Copy,
  Database,
  ExternalLink,
  GitBranch,
  Hash,
  Info,
  Network,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Wallet,
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import {
  kaspaAPI,
  formatAddress,
  formatKaspaAmount,
  type ExplorerAddressDistributionTier,
  type ExplorerBlock,
  type ExplorerCoinSupply,
  type ExplorerHashratePoint,
  type ExplorerHealth,
  type ExplorerRichListEntry,
} from '../lib/kaspa'
import { isValidKaspaAddress } from '../lib/wallet'
import { useWalletStore } from '../stores/walletStore'
import type { AddressInfo, DagInfo, Transaction } from '../types'

type SearchResult =
  | { kind: 'address'; query: string; addressInfo: AddressInfo; transactions: Transaction[]; transactionCount: number }
  | { kind: 'transaction'; query: string; transaction: Transaction }
  | { kind: 'block'; query: string; block: ExplorerBlock }

type LiveChainNode = {
  block: ExplorerBlock
  x: number
  y: number
  lane: number
  radius: number
  isTip: boolean
  isMainChain: boolean
}

type LiveChainEdge = {
  parentHash: string
  childHash: string
  isMainChain: boolean
}

type LiveChainGraphModel = {
  nodes: LiveChainNode[]
  edges: LiveChainEdge[]
  width: number
  height: number
  mainChainCount: number
  tipCount: number
}

function ts(value?: number): number | null {
  if (!value || !Number.isFinite(value)) return null
  return value > 1_000_000_000_000 ? value : value * 1000
}

function fmtDate(value?: number): string {
  const normalized = ts(value)
  return normalized ? new Date(normalized).toLocaleString() : 'Unknown'
}

function fmtAgo(value?: number): string {
  const normalized = ts(value)
  if (!normalized) return 'Unknown'
  const diff = Math.max(0, Math.round((Date.now() - normalized) / 1000))
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
  return `${Math.round(diff / 86400)}d ago`
}

function fmtCompact(value?: number, digits: number = 2): string {
  if (value == null || !Number.isFinite(value)) return 'N/A'
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: digits }).format(value)
}

function fmtUsd(value?: number): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return 'N/A'
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 0 : value >= 1 ? 2 : 6,
  }).format(value)
}

function fmtKasUnits(value?: number): string {
  if (value == null || !Number.isFinite(value) || value < 0) return 'N/A'
  return `${fmtCompact(value, value >= 100 ? 1 : 2)} KAS`
}

function fmtHashrate(hashrateKh?: number): string {
  if (hashrateKh == null || !Number.isFinite(hashrateKh) || hashrateKh <= 0) return 'N/A'
  const units = ['KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s', 'EH/s']
  let value = hashrateKh
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit += 1
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(digits)} ${units[unit]}`
}

function isHexHash(value: string): boolean {
  return /^[a-fA-F0-9]{64}$/.test(value)
}

function copyText(value: string) {
  void navigator.clipboard.writeText(value)
}

function InfoPopover({
  label,
  title,
  body,
}: {
  label: string
  title: string
  body: string
}) {
  return (
    <details className="group relative shrink-0">
      <summary
        className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-full border border-border bg-muted/30 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        aria-label={label}
      >
        <Info className="h-3.5 w-3.5" />
      </summary>
      <div className="absolute right-0 top-9 z-20 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-popover p-4 shadow-2xl">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
      </div>
    </details>
  )
}

function nextLane(index: number): number {
  const magnitude = Math.floor(index / 2) + 1
  return index % 2 === 0 ? -magnitude : magnitude
}

function buildLiveChainGraph(blocks: ExplorerBlock[], tipHashes: string[]): LiveChainGraphModel {
  if (blocks.length === 0) {
    return {
      nodes: [],
      edges: [],
      width: 880,
      height: 340,
      mainChainCount: 0,
      tipCount: 0,
    }
  }

  const blockMap = new Map(blocks.map((block) => [block.hash, block]))
  const ordered = [...blocks].sort((left, right) => left.blueScore - right.blueScore || left.timestamp - right.timestamp)
  const tipSet = new Set(tipHashes.filter((hash) => blockMap.has(hash)))
  const mainTip =
    [...tipSet]
      .map((hash) => blockMap.get(hash))
      .filter((block): block is ExplorerBlock => Boolean(block))
      .sort((left, right) => right.blueScore - left.blueScore || right.timestamp - left.timestamp)[0] ??
    [...blocks].sort((left, right) => right.blueScore - left.blueScore || right.timestamp - left.timestamp)[0]

  const mainChainHashes = new Set<string>()
  let cursor: ExplorerBlock | undefined = mainTip
  while (cursor && !mainChainHashes.has(cursor.hash)) {
    mainChainHashes.add(cursor.hash)
    cursor = cursor.selectedParentHash ? blockMap.get(cursor.selectedParentHash) : undefined
  }

  const laneByHash = new Map<string, number>()
  let branchIndex = 0

  for (const block of ordered) {
    if (mainChainHashes.has(block.hash)) {
      laneByHash.set(block.hash, 0)
      continue
    }

    const parentLane =
      block.selectedParentHash && laneByHash.has(block.selectedParentHash)
        ? laneByHash.get(block.selectedParentHash)
        : undefined

    if (parentLane != null && block.selectedParentHash && !mainChainHashes.has(block.selectedParentHash)) {
      laneByHash.set(block.hash, parentLane)
      continue
    }

    laneByHash.set(block.hash, nextLane(branchIndex))
    branchIndex += 1
  }

  const maxAbsLane = Math.max(...[0, ...laneByHash.values()].map((lane) => Math.abs(lane)))
  const width = Math.max(920, ordered.length * 104)
  const height = Math.max(360, 250 + maxAbsLane * 120)
  const leftPadding = 80
  const rightPadding = 100
  const middleY = height / 2
  const stepX = ordered.length === 1 ? 0 : (width - leftPadding - rightPadding) / (ordered.length - 1)

  const nodeMap = new Map<string, LiveChainNode>()
  const nodes = ordered.map((block, index) => {
    const lane = laneByHash.get(block.hash) ?? 0
    const node: LiveChainNode = {
      block,
      x: leftPadding + stepX * index,
      y: middleY + lane * 88,
      lane,
      radius: 9 + Math.min(block.transactionCount, 20) * 0.22,
      isTip: tipSet.has(block.hash),
      isMainChain: mainChainHashes.has(block.hash),
    }
    nodeMap.set(block.hash, node)
    return node
  })

  const edges = nodes.flatMap((node) => {
    const parentHash = node.block.selectedParentHash
    if (!parentHash || !nodeMap.has(parentHash)) return []
    return [
      {
        parentHash,
        childHash: node.block.hash,
        isMainChain: mainChainHashes.has(parentHash) && node.isMainChain,
      },
    ]
  })

  return {
    nodes,
    edges,
    width,
    height,
    mainChainCount: mainChainHashes.size,
    tipCount: tipSet.size,
  }
}

function getTxView(transaction: Transaction, subjectAddress: string) {
  const received = transaction.outputs.reduce((sum, output) => sum + (output.address === subjectAddress ? output.amount : 0), 0)
  const sent = Math.max(
    transaction.inputs.reduce((sum, input) => sum + (input.utxoEntry?.address === subjectAddress ? input.utxoEntry.amount : 0), 0) - received - transaction.fee,
    0
  )
  const kind = sent > 0 ? 'sent' : received > 0 ? 'received' : 'transfer'
  const amount = sent > 0 ? sent : received
  const counterparty = kind === 'sent'
    ? transaction.outputs.find((output) => output.address && output.address !== subjectAddress)?.address
    : transaction.inputs.find((input) => input.utxoEntry?.address && input.utxoEntry.address !== subjectAddress)?.utxoEntry?.address

  return { kind, amount, counterparty: counterparty ?? 'Unknown' }
}

function resultUrl(explorerUrl: string, result: SearchResult): string {
  if (result.kind === 'address') return `${explorerUrl}/addresses/${result.addressInfo.address}`
  if (result.kind === 'transaction') return `${explorerUrl}/txs/${result.transaction.hash}`
  return `${explorerUrl}/blocks/${result.block.hash}`
}

function Card({
  title,
  subtitle,
  info,
  children,
}: {
  title: string
  subtitle: string
  info?: string
  children: ReactNode
}) {
  return (
    <div className="self-start rounded-2xl border border-border bg-card/80 p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold sm:text-lg">{title}</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {info && <InfoPopover label={`${title} info`} title={title} body={info} />}
      </div>
      {children}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, hint }: { icon: typeof Activity; label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card/80 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 break-words text-xl font-semibold sm:text-2xl">{value}</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary sm:h-11 sm:w-11">
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{hint}</p>
    </div>
  )
}

function HashrateChart({ points }: { points: ExplorerHashratePoint[] }) {
  if (points.length === 0) return <div className="flex h-48 items-center justify-center rounded-xl bg-muted/30 text-sm text-muted-foreground">No hashrate history available.</div>

  const width = 720
  const height = 220
  const padding = 24
  const values = points.map((point) => point.hashrateKh)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(max - min, 1)
  const stepX = points.length === 1 ? 0 : (width - padding * 2) / (points.length - 1)
  const coords = points.map((point, index) => ({
    x: padding + stepX * index,
    y: height - padding - ((point.hashrateKh - min) / range) * (height - padding * 2),
  }))
  const line = coords.map(({ x, y }) => `${x},${y}`).join(' ')
  const area = [`${padding},${height - padding}`, ...coords.map(({ x, y }) => `${x},${y}`), `${width - padding},${height - padding}`].join(' ')
  const latest = points[points.length - 1]

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
        <span className="text-muted-foreground">Current</span>
        <span className="font-medium">{fmtHashrate(latest.hashrateKh)}</span>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-muted/20 p-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full sm:h-52">
          <defs><linearGradient id="hashrate-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="rgba(59,130,246,0.35)" /><stop offset="100%" stopColor="rgba(59,130,246,0.02)" /></linearGradient></defs>
          <polygon points={area} fill="url(#hashrate-fill)" />
          <polyline points={line} fill="none" stroke="rgb(96,165,250)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          {coords.map(({ x, y }, index) => <circle key={index} cx={x} cy={y} r="3" fill="rgb(191,219,254)" />)}
        </svg>
      </div>
      <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span className="break-words">{points[0]?.dateTime || fmtDate(points[0]?.timestamp)}</span>
        <span className="break-words sm:text-right">{latest.dateTime || fmtDate(latest.timestamp)}</span>
      </div>
    </div>
  )
}

function DistributionBars({ tiers }: { tiers: ExplorerAddressDistributionTier[] }) {
  if (tiers.length === 0) return <div className="flex h-48 items-center justify-center rounded-xl bg-muted/30 text-sm text-muted-foreground">No distribution data available.</div>

  const topTiers = [...tiers].sort((left, right) => right.amount - left.amount).slice(0, 8)
  const maxAmount = Math.max(...topTiers.map((tier) => tier.amount), 1)

  return (
    <div className="space-y-3">
      {topTiers.map((tier) => (
        <div key={tier.tier} className="space-y-1">
          <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="font-medium">Tier {tier.tier}</span>
            <span className="text-muted-foreground">{fmtCompact(tier.count, 1)} holders</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-muted/40"><div className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500" style={{ width: `${Math.max((tier.amount / maxAmount) * 100, 6)}%` }} /></div>
          <div className="text-xs text-muted-foreground">{fmtKasUnits(tier.amount)}</div>
        </div>
      ))}
    </div>
  )
}

function LiveChainView({
  blocks,
  tipHashes,
  isRefreshing,
  lastUpdatedAt,
  onSelect,
}: {
  blocks: ExplorerBlock[]
  tipHashes: string[]
  isRefreshing: boolean
  lastUpdatedAt: number | null
  onSelect: (blockHash: string) => void
}) {
  const graph = useMemo(() => buildLiveChainGraph(blocks, tipHashes), [blocks, tipHashes])
  const nodeLookup = useMemo(() => new Map(graph.nodes.map((node) => [node.block.hash, node])), [graph.nodes])
  const tipBlocks = useMemo(
    () =>
      blocks
        .filter((block) => tipHashes.includes(block.hash))
        .sort((left, right) => right.blueScore - left.blueScore || right.timestamp - left.timestamp)
        .slice(0, 6),
    [blocks, tipHashes]
  )

  if (graph.nodes.length === 0) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-2xl border border-border bg-slate-950/50 text-sm text-muted-foreground">
        Waiting for live chain data.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Visible Blocks</p>
          <p className="mt-2 text-xl font-semibold">{graph.nodes.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Active Tips</p>
          <p className="mt-2 text-xl font-semibold">{graph.tipCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Main Chain Depth</p>
          <p className="mt-2 text-xl font-semibold">{graph.mainChainCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Live Update</p>
          <p className="mt-2 text-xl font-semibold">{lastUpdatedAt ? fmtAgo(lastUpdatedAt) : 'Loading'}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
          selected chain
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          live tip
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          side branch
        </span>
        <span className="inline-flex items-center gap-2">
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          auto-refresh every 12s
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-slate-950/60 p-3 sm:p-4">
        <svg viewBox={`0 0 ${graph.width} ${graph.height}`} className="h-[280px] min-w-full sm:h-[340px] lg:h-[380px]">
          <defs>
            <linearGradient id="live-chain-bg" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(14,116,144,0.08)" />
              <stop offset="100%" stopColor="rgba(30,64,175,0.02)" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width={graph.width} height={graph.height} fill="url(#live-chain-bg)" rx="20" />
          <line
            x1="40"
            x2={graph.width - 40}
            y1={graph.height / 2}
            y2={graph.height / 2}
            stroke="rgba(148,163,184,0.12)"
            strokeDasharray="6 6"
          />

          {graph.edges.map((edge) => {
            const parentNode = nodeLookup.get(edge.parentHash)
            const childNode = nodeLookup.get(edge.childHash)
            if (!parentNode || !childNode) return null

            const controlX = (parentNode.x + childNode.x) / 2
            const path = `M ${parentNode.x} ${parentNode.y} C ${controlX} ${parentNode.y}, ${controlX} ${childNode.y}, ${childNode.x} ${childNode.y}`

            return (
              <path
                key={`${edge.parentHash}-${edge.childHash}`}
                d={path}
                fill="none"
                stroke={edge.isMainChain ? 'rgba(34,211,238,0.9)' : 'rgba(245,158,11,0.55)'}
                strokeWidth={edge.isMainChain ? 3.2 : 2}
                strokeLinecap="round"
              />
            )
          })}

          {graph.nodes.map((node) => {
            const extraParents = Math.max(node.block.parentHashes.length - 1, 0)
            const fill = node.isTip
              ? 'rgb(52,211,153)'
              : node.isMainChain
                ? 'rgb(34,211,238)'
                : 'rgb(251,191,36)'
            const stroke = node.isMainChain ? 'rgba(125,211,252,0.95)' : 'rgba(254,240,138,0.85)'

            return (
              <g key={node.block.hash} onClick={() => onSelect(node.block.hash)} className="cursor-pointer">
                {node.isTip && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.radius + 4}
                    fill="none"
                    stroke="rgba(16,185,129,0.7)"
                    strokeWidth="2"
                  >
                    <animate attributeName="r" values={`${node.radius + 4};${node.radius + 12};${node.radius + 4}`} dur="2.2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.55;0.12;0.55" dur="2.2s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle cx={node.x} cy={node.y} r={node.radius} fill={fill} stroke={stroke} strokeWidth="2.4" />
                <text
                  x={node.x}
                  y={node.y - node.radius - 12}
                  textAnchor="middle"
                  fill="rgba(226,232,240,0.92)"
                  fontSize="11"
                  fontFamily="monospace"
                >
                  {formatAddress(node.block.hash, 14)}
                </text>
                <text
                  x={node.x}
                  y={node.y + node.radius + 16}
                  textAnchor="middle"
                  fill="rgba(148,163,184,0.88)"
                  fontSize="10"
                >
                  {node.block.transactionCount} tx
                </text>
                {extraParents > 0 && (
                  <text
                    x={node.x + node.radius + 10}
                    y={node.y - node.radius - 2}
                    textAnchor="start"
                    fill="rgba(253,224,71,0.9)"
                    fontSize="10"
                  >
                    +{extraParents}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {tipBlocks.length === 0 ? (
          <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground lg:col-span-3">
            No live tip blocks available.
          </div>
        ) : (
          tipBlocks.map((block) => (
            <button
              key={block.hash}
              onClick={() => onSelect(block.hash)}
              className="rounded-xl border border-border bg-muted/20 p-4 text-left transition-colors hover:bg-muted/35"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs uppercase tracking-[0.18em] text-emerald-400">Live Tip</span>
                <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-300">
                  blue {fmtCompact(block.blueScore, 1)}
                </span>
              </div>
              <p className="mt-3 break-all font-mono text-xs sm:text-sm">{block.hash}</p>
              <div className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span>{block.transactionCount} txs</span>
                <span>{fmtAgo(block.timestamp)}</span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
export default function ExplorerPage() {
  const { network, address } = useWalletStore()
  const [searchInput, setSearchInput] = useState('')
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [isLoadingOverview, setIsLoadingOverview] = useState(true)
  const [isRefreshingLiveChain, setIsRefreshingLiveChain] = useState(false)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [dagInfo, setDagInfo] = useState<DagInfo | null>(null)
  const [coinSupply, setCoinSupply] = useState<ExplorerCoinSupply | null>(null)
  const [price, setPrice] = useState<number | null>(null)
  const [marketcap, setMarketcap] = useState<number | null>(null)
  const [hashrate, setHashrate] = useState<number | null>(null)
  const [blockReward, setBlockReward] = useState<number | null>(null)
  const [health, setHealth] = useState<ExplorerHealth | null>(null)
  const [hashrateHistory, setHashrateHistory] = useState<ExplorerHashratePoint[]>([])
  const [distribution, setDistribution] = useState<ExplorerAddressDistributionTier[]>([])
  const [richList, setRichList] = useState<ExplorerRichListEntry[]>([])
  const [recentBlocks, setRecentBlocks] = useState<ExplorerBlock[]>([])
  const [lastLiveChainUpdate, setLastLiveChainUpdate] = useState<number | null>(null)
  const searchResultRef = useRef<HTMLDivElement | null>(null)

  const scrollToSearchResult = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (!searchResultRef.current) return

    searchResultRef.current.scrollIntoView({
      behavior,
      block: 'start',
    })

    window.requestAnimationFrame(() => {
      searchResultRef.current?.focus({ preventScroll: true })
    })
  }, [])

  const refreshLiveChain = useCallback(async () => {
    setIsRefreshingLiveChain(true)

    const [dagResult, blocksResult, healthResult] = await Promise.allSettled([
      kaspaAPI.getDagInfo(),
      kaspaAPI.getRecentBlocks(18, true),
      kaspaAPI.getHealth(),
    ])

    if (dagResult.status === 'fulfilled') setDagInfo(dagResult.value)
    if (blocksResult.status === 'fulfilled') setRecentBlocks(blocksResult.value)
    if (healthResult.status === 'fulfilled') setHealth(healthResult.value)

    if (dagResult.status === 'fulfilled' || blocksResult.status === 'fulfilled') {
      setLastLiveChainUpdate(Date.now())
    }

    setIsRefreshingLiveChain(false)
  }, [])

  const loadExplorerData = useCallback(async () => {
    setIsLoadingOverview(true)
    setOverviewError(null)

    const monthKey = new Date().toISOString().slice(0, 7)
    const results = await Promise.allSettled([
      kaspaAPI.getDagInfo(),
      kaspaAPI.getCoinSupply(),
      kaspaAPI.getPrice(),
      kaspaAPI.getMarketcap(),
      kaspaAPI.getHashrate(),
      kaspaAPI.getBlockReward(),
      kaspaAPI.getHealth(),
      kaspaAPI.getHashrateHistory(monthKey, '1h'),
      kaspaAPI.getAddressDistribution(24),
      kaspaAPI.getRichList(),
      kaspaAPI.getRecentBlocks(18, true),
    ])

    const [dagResult, supplyResult, priceResult, marketcapResult, hashrateResult, rewardResult, healthResult, historyResult, distributionResult, richListResult, blocksResult] = results

    if (dagResult.status === 'fulfilled') setDagInfo(dagResult.value)
    if (supplyResult.status === 'fulfilled') setCoinSupply(supplyResult.value)
    if (priceResult.status === 'fulfilled') setPrice(priceResult.value)
    if (marketcapResult.status === 'fulfilled') setMarketcap(marketcapResult.value)
    if (hashrateResult.status === 'fulfilled') setHashrate(hashrateResult.value)
    if (rewardResult.status === 'fulfilled') setBlockReward(rewardResult.value)
    if (healthResult.status === 'fulfilled') setHealth(healthResult.value)
    if (historyResult.status === 'fulfilled') setHashrateHistory(historyResult.value)
    if (distributionResult.status === 'fulfilled') setDistribution(distributionResult.value)
    if (richListResult.status === 'fulfilled') setRichList(richListResult.value)
    if (blocksResult.status === 'fulfilled') setRecentBlocks(blocksResult.value)

    if (dagResult.status === 'fulfilled' || blocksResult.status === 'fulfilled') {
      setLastLiveChainUpdate(Date.now())
    }

    if (results.every((result) => result.status === 'rejected')) {
      setOverviewError('Explorer data could not be loaded for the selected network.')
    }

    setIsLoadingOverview(false)
  }, [])

  useEffect(() => {
    kaspaAPI.setNetwork(network)
    void loadExplorerData()
  }, [network, loadExplorerData])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshLiveChain()
    }, 12000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [network, refreshLiveChain])

  useEffect(() => {
    if (!searchResult) return

    const frameId = window.requestAnimationFrame(() => {
      scrollToSearchResult('smooth')
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [searchResult, scrollToSearchResult])

  const runSearch = useCallback(async (rawQuery?: string) => {
    const query = (rawQuery ?? searchInput).trim()
    if (!query) {
      setSearchError('Enter a Kaspa address, transaction hash, or block hash.')
      setSearchResult(null)
      return
    }

    setSearchInput(query)
    setSearchError(null)
    setIsSearching(true)

    try {
      if (isValidKaspaAddress(query, network)) {
        const [addressInfoResult, transactionCountResult, transactionsResult] = await Promise.allSettled([
          kaspaAPI.getAddressInfo(query),
          kaspaAPI.getAddressTransactionCount(query),
          kaspaAPI.getTransactions(query, 20),
        ])

        if (addressInfoResult.status !== 'fulfilled') {
          throw addressInfoResult.reason
        }

        setSearchResult({
          kind: 'address',
          query,
          addressInfo: addressInfoResult.value,
          transactions: transactionsResult.status === 'fulfilled' ? transactionsResult.value : [],
          transactionCount: transactionCountResult.status === 'fulfilled' ? transactionCountResult.value : 0,
        })
        return
      }

      if (isHexHash(query)) {
        try {
          const transaction = await kaspaAPI.getTransaction(query)
          setSearchResult({ kind: 'transaction', query, transaction })
          return
        } catch {
          const block = await kaspaAPI.getBlock(query, true)
          setSearchResult({ kind: 'block', query, block })
          return
        }
      }

      throw new Error('Unsupported search. Use a valid Kaspa address, transaction hash, or block hash.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed.'
      setSearchError(message)
      setSearchResult(null)
    } finally {
      setIsSearching(false)
    }
  }, [network, searchInput])

  const healthStatus = useMemo(() => {
    if (!health) return { label: 'Unknown', className: 'text-muted-foreground' }
    const isHealthy = health.kaspadSynced && health.databaseSynced && health.blueScoreDiff <= 20
    return { label: isHealthy ? 'Synced' : 'Lagging', className: isHealthy ? 'text-emerald-400' : 'text-amber-400' }
  }, [health])

  const highlightedBlocks = useMemo(() => recentBlocks.slice(0, 6), [recentBlocks])
  const latestBlock = recentBlocks[0]

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-blue-950 p-5 sm:p-6 md:p-8">
        <div className="absolute -left-16 top-0 h-48 w-48 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="absolute -right-10 bottom-0 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/80">Network Intelligence</p>
            <h1 className="mt-3 text-3xl font-bold text-white md:text-4xl">Kaspa Explorer</h1>
            <p className="mt-3 text-sm text-slate-300 md:text-base">Built-in explorer for {network.name}. Search addresses, transactions, and blocks, and view live metrics directly inside the wallet.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:min-w-[320px]">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm"><p className="text-xs uppercase tracking-[0.2em] text-slate-400">Latest Block</p><p className="mt-2 text-lg font-semibold text-white">{latestBlock ? fmtCompact(latestBlock.blueScore, 1) : '...'}</p><p className="mt-1 text-xs text-slate-400">{latestBlock ? fmtAgo(latestBlock.timestamp) : 'Loading'}</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm"><p className="text-xs uppercase tracking-[0.2em] text-slate-400">Health</p><p className={`mt-2 text-lg font-semibold ${healthStatus.className}`}>{healthStatus.label}</p><p className="mt-1 text-xs text-slate-400">{health ? `${health.host} | v${health.serverVersion}` : 'Waiting for API'}</p></div>
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="rounded-2xl border border-border bg-card/80 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <form className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row" onSubmit={(event) => { event.preventDefault(); void runSearch() }}>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <input type="text" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search address, transaction hash, or block hash" className="h-12 w-full rounded-xl border border-border bg-background pl-11 pr-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
            </div>
            <Button type="submit" className="h-12 w-full px-6 md:w-auto" disabled={isSearching}><Search className="mr-2 h-4 w-4" />{isSearching ? 'Searching...' : 'Search'}</Button>
          </form>
          <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-[repeat(2,minmax(0,1fr))_auto] lg:flex lg:items-center">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => void runSearch(address)}><Wallet className="mr-2 h-4 w-4" />My Address</Button>
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => void loadExplorerData()} disabled={isLoadingOverview}><RefreshCw className={`mr-2 h-4 w-4 ${isLoadingOverview ? 'animate-spin' : ''}`} />Refresh Data</Button>
            <InfoPopover
              label="Search help"
              title="Search formats"
              body="The explorer accepts full Kaspa addresses, 64-character transaction hashes, and 64-character block hashes. On mobile, use the quick actions to open your own address or refresh the live data."
            />
          </div>
        </div>
        {searchError && <p className="mt-3 text-sm text-red-400">{searchError}</p>}
        {searchResult && !searchError && (
          <div className="mt-3 flex flex-col gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Search Result Ready</p>
              <p className="mt-1 text-sm text-emerald-100">
                {searchResult.kind[0].toUpperCase() + searchResult.kind.slice(1)} result loaded for{' '}
                <span className="break-all font-mono text-xs sm:text-sm">{searchResult.query}</span>
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full border-emerald-500/30 bg-emerald-500/5 text-emerald-100 hover:bg-emerald-500/10 sm:w-auto"
              onClick={() => scrollToSearchResult('smooth')}
            >
              Jump to Result
            </Button>
          </div>
        )}
      </motion.div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard icon={Network} label="Blue Score" value={fmtCompact(dagInfo?.virtualSelectedParentBlueScore, 1)} hint={dagInfo?.networkName ?? network.name} />
        <StatCard icon={Activity} label="Hashrate" value={fmtHashrate(hashrate ?? undefined)} hint={blockReward != null ? `Block reward: ${blockReward.toFixed(8)} KAS` : 'Reward unavailable'} />
        <StatCard icon={Coins} label="Price" value={fmtUsd(price ?? undefined)} hint={marketcap != null ? `Market cap: ${fmtUsd(marketcap)}` : 'Market cap unavailable'} />
        <StatCard icon={Coins} label="Circulating Supply" value={fmtKasUnits(coinSupply?.circulatingSupply)} hint={coinSupply ? `Max supply: ${fmtCompact(coinSupply.maxSupply, 1)} KAS` : 'Supply unavailable'} />
        <StatCard icon={Blocks} label="Blocks Indexed" value={fmtCompact(dagInfo?.blockCount, 1)} hint={dagInfo ? `Headers: ${fmtCompact(dagInfo.headerCount, 1)}` : 'Header count unavailable'} />
        <StatCard icon={ShieldCheck} label="Node Health" value={healthStatus.label} hint={health ? `Blue score diff: ${health.blueScoreDiff} | Accepted tx lag: ${health.acceptedTxBlockTimeDiff}s` : 'Health unavailable'} />
      </div>
      {overviewError && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{overviewError}</div>}

      <Card
        title="Live Chain Monitor"
        subtitle="Auto-refreshing chain view built from live tip hashes and selected-parent relations."
        info="The graph updates every 12 seconds. Cyan nodes belong to the selected chain, amber nodes are side branches, and green nodes are current live tips. Tap or click any node or tip card to open full block details."
      >
        <div className="mb-4 flex items-center gap-2 text-sm text-cyan-300">
          <GitBranch className="h-4 w-4" />
          <span>Live DAG and selected-chain visualization</span>
        </div>
        <LiveChainView
          blocks={recentBlocks}
          tipHashes={dagInfo?.tipHashes ?? []}
          isRefreshing={isRefreshingLiveChain}
          lastUpdatedAt={lastLiveChainUpdate}
          onSelect={(blockHash) => {
            void runSearch(blockHash)
          }}
        />
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card
          title="Hashrate History"
          subtitle="Hourly network hashrate for the current month."
          info="This chart uses the current month of hashrate history from the public Kaspa API. It is useful for spotting short-term network acceleration or slowdowns."
        >
          <HashrateChart points={hashrateHistory} />
        </Card>
        <Card
          title="Address Distribution"
          subtitle="Largest balance tiers by amount held."
          info="Distribution tiers group addresses by balance size. Larger filled bars mean more KAS is concentrated in that balance band."
        >
          <DistributionBars tiers={distribution} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:items-start xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)]">
        <Card
          title="Recent Block Flow"
          subtitle="Fresh blocks fetched from current tips and selected parents."
          info="This strip is a compact, linear summary of the freshest blocks. Use it for quick scanning, while the Live Chain Monitor above shows the full branching structure."
        >
          <>
            <div className="overflow-x-auto pb-2 md:hidden">
              <div className="flex min-w-max items-center gap-3">
                {highlightedBlocks.map((block, index) => (
                  <div key={block.hash} className="flex items-center gap-3">
                    <button
                      onClick={() => void runSearch(block.hash)}
                      className="min-w-[190px] rounded-2xl border border-border bg-muted/25 p-4 text-left transition-colors hover:bg-muted/45"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Block</span>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${block.isChainBlock ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                          {block.isChainBlock ? 'Chain' : 'DAG'}
                        </span>
                      </div>
                      <p className="mt-3 font-mono text-sm">{formatAddress(block.hash, 18)}</p>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <span>Blue score</span>
                        <span className="text-right text-foreground">{fmtCompact(block.blueScore, 1)}</span>
                        <span>Transactions</span>
                        <span className="text-right text-foreground">{block.transactionCount}</span>
                      </div>
                    </button>
                    {index < highlightedBlocks.length - 1 && <div className="h-px w-10 bg-border" />}
                  </div>
                ))}
              </div>
            </div>

            <div className="hidden gap-3 md:grid md:grid-cols-2 2xl:grid-cols-3">
              {highlightedBlocks.map((block) => (
                <button
                  key={block.hash}
                  onClick={() => void runSearch(block.hash)}
                  className="rounded-2xl border border-border bg-muted/25 p-4 text-left transition-colors hover:bg-muted/45"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Block</span>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${block.isChainBlock ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                      {block.isChainBlock ? 'Chain' : 'DAG'}
                    </span>
                  </div>
                  <p className="mt-3 font-mono text-sm">{formatAddress(block.hash, 18)}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <span>Blue score</span>
                    <span className="text-right text-foreground">{fmtCompact(block.blueScore, 1)}</span>
                    <span>Transactions</span>
                    <span className="text-right text-foreground">{block.transactionCount}</span>
                  </div>
                </button>
              ))}
            </div>
          </>
        </Card>

        <Card
          title="Latest Blocks"
          subtitle="Click any block to inspect it."
          info="These are the newest blocks currently loaded into the explorer. Parent count is especially useful in Kaspa because blocks can reference multiple parents in the DAG."
        >
          <div className="space-y-3">{recentBlocks.length === 0 ? <div className="flex h-44 items-center justify-center rounded-xl bg-muted/30 text-sm text-muted-foreground">Loading blocks...</div> : recentBlocks.slice(0, 8).map((block) => <button key={block.hash} onClick={() => void runSearch(block.hash)} className="flex w-full flex-col gap-3 rounded-xl border border-border bg-muted/20 p-4 text-left transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="font-mono text-sm">{formatAddress(block.hash, 18)}</p><p className="mt-1 text-xs text-muted-foreground">Blue score {fmtCompact(block.blueScore, 1)} | {fmtAgo(block.timestamp)}</p></div><div className="text-left sm:text-right"><p className="text-sm font-medium">{block.transactionCount} txs</p><p className="text-xs text-muted-foreground">{block.parentHashes.length} parents</p></div></button>)}</div>
        </Card>
      </div>

      <Card
        title="Rich List"
        subtitle="Top network addresses from the public Kaspa API snapshot."
        info="The rich list is a snapshot of the largest known addresses returned by the explorer API. On smaller screens it switches to cards so the full balance and address remain readable."
      >
        {richList.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No rich list data available.</div>
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {richList.slice(0, 12).map((entry) => (
                <button
                  key={`${entry.rank}-${entry.address}`}
                  onClick={() => void runSearch(entry.address)}
                  className="w-full rounded-xl border border-border bg-muted/20 p-4 text-left transition-colors hover:bg-muted/35"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                      #{entry.rank + 1}
                    </span>
                    <span className="text-sm font-semibold">{fmtKasUnits(entry.amount)}</span>
                  </div>
                  <p className="mt-3 break-all font-mono text-xs text-cyan-300">{entry.address}</p>
                </button>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  <tr>
                    <th className="pb-3 pr-4">Rank</th>
                    <th className="pb-3 pr-4">Address</th>
                    <th className="pb-3 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {richList.slice(0, 12).map((entry) => (
                    <tr key={`${entry.rank}-${entry.address}`}>
                      <td className="py-3 pr-4 font-medium">#{entry.rank + 1}</td>
                      <td className="py-3 pr-4">
                        <button
                          onClick={() => void runSearch(entry.address)}
                          className="font-mono text-left text-cyan-300 transition-colors hover:text-cyan-200"
                        >
                          {formatAddress(entry.address, 26)}
                        </button>
                      </td>
                      <td className="py-3 text-right font-medium">{fmtKasUnits(entry.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {searchResult && (
        <motion.div
          ref={searchResultRef}
          tabIndex={-1}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-primary/30 bg-card/90 p-4 outline-none ring-1 ring-primary/10 sm:p-5"
        >
          <div className="flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Search Result</p>
              <div className="mt-2 flex items-start gap-2">
                <h2 className="text-2xl font-semibold capitalize">{searchResult.kind}</h2>
                <InfoPopover
                  label="Search result info"
                  title="Search Result"
                  body="Result cards switch layout depending on what you searched for. Addresses show balance and recent transactions, transaction hashes show inputs and outputs, and block hashes show topology and included transactions."
                />
              </div>
              <p className="mt-2 break-all font-mono text-sm text-muted-foreground">{searchResult.query}</p>
            </div>
            <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2">
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => copyText(searchResult.query)}><Copy className="mr-2 h-4 w-4" />Copy</Button>
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => window.open(resultUrl(network.explorerUrl, searchResult), '_blank', 'noopener,noreferrer')}><ExternalLink className="mr-2 h-4 w-4" />Open External</Button>
            </div>
          </div>

          {searchResult.kind === 'address' && <div className="mt-5 space-y-5"><div className="grid grid-cols-1 gap-4 md:grid-cols-3"><StatCard icon={Wallet} label="Balance" value={`${formatKaspaAmount(searchResult.addressInfo.balance)} KAS`} hint="Confirmed address balance" /><StatCard icon={Database} label="UTXOs" value={String(searchResult.addressInfo.utxos.length)} hint="Spendable outputs for this address" /><StatCard icon={BarChart3} label="Transactions" value={fmtCompact(searchResult.transactionCount, 1)} hint="Count reported by explorer API" /></div><Card title="Latest Address Transactions" subtitle="Recent activity for this address." info="This list shows the latest resolved transactions for the selected address. Amounts are calculated from that address perspective, so outgoing and incoming values stay readable even on mobile."><div className="space-y-3">{searchResult.transactions.length === 0 ? <div className="py-6 text-center text-sm text-muted-foreground">No transactions available for this address.</div> : searchResult.transactions.map((transaction) => { const txView = getTxView(transaction, searchResult.addressInfo.address); return <button key={transaction.hash} onClick={() => void runSearch(transaction.hash)} className="flex flex-col gap-3 rounded-xl border border-border bg-background/60 p-4 text-left transition-colors hover:bg-background sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className={`flex h-10 w-10 items-center justify-center rounded-full ${txView.kind === 'received' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>{txView.kind === 'received' ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}</div><div className="min-w-0"><p className="font-medium capitalize">{txView.kind}</p><p className="break-all text-xs text-muted-foreground">{formatAddress(txView.counterparty, 24)} | {fmtAgo(transaction.timestamp)}</p></div></div><div className="text-left sm:text-right"><p className={`font-semibold ${txView.kind === 'received' ? 'text-emerald-400' : 'text-red-400'}`}>{txView.kind === 'received' ? '+' : txView.kind === 'sent' ? '-' : ''}{formatKaspaAmount(txView.amount)} KAS</p><p className="text-xs text-muted-foreground">Fee {formatKaspaAmount(transaction.fee)} KAS</p></div></button> })}</div></Card></div>}

          {searchResult.kind === 'transaction' && <div className="mt-5 space-y-5"><div className="grid grid-cols-1 gap-4 md:grid-cols-3"><StatCard icon={Hash} label="Status" value={searchResult.transaction.blockHash ? 'Confirmed' : 'Pending'} hint={searchResult.transaction.blockHash ? `Block ${formatAddress(searchResult.transaction.blockHash, 18)}` : 'Awaiting inclusion'} /><StatCard icon={Server} label="Network Fee" value={`${formatKaspaAmount(searchResult.transaction.fee)} KAS`} hint={`${searchResult.transaction.inputs.length} inputs | ${searchResult.transaction.outputs.length} outputs`} /><StatCard icon={Clock3} label="Timestamp" value={fmtAgo(searchResult.transaction.timestamp)} hint={fmtDate(searchResult.transaction.timestamp)} /></div><div className="grid grid-cols-1 gap-5 xl:grid-cols-2"><Card title="Inputs" subtitle="Resolved previous outpoints when available." info="Inputs are previous outputs that this transaction spends. When the explorer API can resolve them, you also see the original amount and address."><div className="space-y-3">{searchResult.transaction.inputs.map((input, index) => <button key={`${input.previousOutpointHash}:${input.previousOutpointIndex}:${index}`} onClick={() => input.utxoEntry?.address && void runSearch(input.utxoEntry.address)} className="w-full rounded-xl border border-border bg-background/60 p-3 text-left transition-colors hover:bg-background"><p className="break-all font-mono text-xs text-muted-foreground">{formatAddress(input.previousOutpointHash, 22)}:{input.previousOutpointIndex}</p><p className="mt-1 text-sm font-medium">{input.utxoEntry?.address ? formatAddress(input.utxoEntry.address, 30) : 'Unknown address'}</p><p className="mt-1 text-xs text-muted-foreground">{input.utxoEntry ? `${formatKaspaAmount(input.utxoEntry.amount)} KAS` : 'Previous outpoint unresolved'}</p></button>)}</div></Card><Card title="Outputs" subtitle="Destination outputs and script payloads." info="Outputs show the value created by the transaction. Tap an output address to jump directly into that address view."><div className="space-y-3">{searchResult.transaction.outputs.map((output, index) => <button key={`${output.scriptPubKey}:${index}`} onClick={() => output.address && void runSearch(output.address)} className="w-full rounded-xl border border-border bg-background/60 p-3 text-left transition-colors hover:bg-background"><p className="text-sm font-medium">{output.address ? formatAddress(output.address, 30) : 'Script output'}</p><p className="mt-1 break-all text-xs text-muted-foreground">{output.scriptPubKey}</p><p className="mt-1 text-sm font-semibold">{formatKaspaAmount(output.amount)} KAS</p></button>)}</div></Card></div></div>}

          {searchResult.kind === 'block' && <div className="mt-5 space-y-5"><div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"><StatCard icon={Blocks} label="Blue Score" value={fmtCompact(searchResult.block.blueScore, 1)} hint={`DAA score ${fmtCompact(searchResult.block.daaScore, 1)}`} /><StatCard icon={Clock3} label="Timestamp" value={fmtAgo(searchResult.block.timestamp)} hint={fmtDate(searchResult.block.timestamp)} /><StatCard icon={Database} label="Transactions" value={String(searchResult.block.transactionCount)} hint={`${searchResult.block.parentHashes.length} parent hashes`} /><StatCard icon={ShieldCheck} label="Difficulty" value={fmtCompact(searchResult.block.difficulty, 2)} hint={searchResult.block.isChainBlock ? 'Selected chain block' : 'Non-chain DAG block'} /></div><div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.9fr_1.1fr]"><Card title="Block Topology" subtitle="Selected parent and parent hashes." info="Kaspa blocks can reference multiple parents. The selected parent is the one used for the main chain relation, while the other parents reflect the DAG structure."><div className="space-y-4 text-sm"><div><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Selected Parent</p>{searchResult.block.selectedParentHash ? <button className="mt-2 break-all font-mono text-cyan-300 hover:text-cyan-200" onClick={() => void runSearch(searchResult.block.selectedParentHash!)}>{searchResult.block.selectedParentHash}</button> : <p className="mt-2 text-muted-foreground">No selected parent reported.</p>}</div><div><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Parents</p><div className="mt-2 space-y-2">{searchResult.block.parentHashes.length === 0 ? <p className="text-muted-foreground">No parent hashes available.</p> : searchResult.block.parentHashes.slice(0, 12).map((parentHash) => <button key={parentHash} className="block break-all font-mono text-cyan-300 hover:text-cyan-200" onClick={() => void runSearch(parentHash)}>{parentHash}</button>)}</div></div></div></Card><Card title="Transactions In Block" subtitle="Latest transactions returned by the API." info="Blocks can contain many transactions. This section shows the most recent transaction details returned by the API for the currently selected block."><div className="space-y-3">{searchResult.block.transactions.length === 0 ? <div className="py-6 text-center text-sm text-muted-foreground">No block transaction details returned by the API.</div> : searchResult.block.transactions.slice(0, 15).map((transaction) => <button key={transaction.hash} onClick={() => void runSearch(transaction.hash)} className="flex flex-col gap-3 rounded-xl border border-border bg-background/60 p-3 text-left transition-colors hover:bg-background sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="font-mono text-sm">{formatAddress(transaction.hash, 20)}</p><p className="mt-1 text-xs text-muted-foreground">{transaction.inputsCount} inputs | {transaction.outputsCount} outputs</p></div><div className="text-left sm:text-right"><p className="text-sm font-medium">{formatKaspaAmount(transaction.totalOutput)} KAS</p><p className="text-xs text-muted-foreground">{transaction.recipients[0] ? formatAddress(transaction.recipients[0], 18) : 'Recipient unavailable'}</p></div></button>)}</div></Card></div></div>}
        </motion.div>
      )}
    </div>
  )
}
