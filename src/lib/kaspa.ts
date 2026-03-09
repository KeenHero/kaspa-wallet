import type { IBlock, IGetBlockDagInfoResponse, IGetCoinSupplyResponse, IGetServerInfoResponse, ITransaction, RpcClient as KaspaRpcClient } from '@kasdk/web-rpc'
import kaspaRpcWasmUrl from '@kasdk/web-rpc/kaspa_bg.wasm?url'
import {
  NETWORKS,
  type KaspaNetwork,
  type UTXO,
  type Transaction,
  type AddressInfo,
  type FeeEstimate,
  type DagInfo,
  type Krc20Operation,
  type Krc20PortfolioToken,
  type Krc20TokenBalance,
  type Krc20TokenInfo,
} from '../types'
import { type SignedTransactionPayload } from './transaction'

const KASPA_DECIMALS = 100000000
const LIVE_RECENT_BLOCK_LIMIT = 18
const LIVE_RPC_NETWORK_IDS: Record<string, string> = {
  mainnet: 'mainnet',
  testnet10: 'testnet-10',
  testnet11: 'testnet-11',
}
const LIVE_RPC_URLS: Record<string, string> = {
  mainnet: 'wss://luna.kaspa.blue/kaspa/mainnet/wrpc/borsh',
  testnet10: 'wss://baryon-10.kaspa.green/kaspa/testnet-10/wrpc/borsh',
  testnet11: 'wss://meson-11.kaspa.green/kaspa/testnet-11/wrpc/borsh',
}
const LIVE_RPC_EVENT_NAMES = {
  connect: 'connect',
  disconnect: 'disconnect',
  blockAdded: 'block-added',
  virtualChainChanged: 'virtual-chain-changed',
} as const

type KaspaRpcModule = typeof import('@kasdk/web-rpc')

let kaspaRpcModulePromise: Promise<KaspaRpcModule> | null = null

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'bigint') {
    const converted = Number(value)
    return Number.isFinite(converted) ? converted : fallback
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

function toNumericString(value: unknown, fallback = '0'): string {
  if (typeof value === 'bigint') {
    return value.toString()
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.trunc(value).toString() : fallback
  }
  if (typeof value === 'string' && value.length > 0) {
    return value
  }
  return fallback
}

function normalizeAddressPath(address: string): string {
  return encodeURIComponent(address)
}

function normalizeKrc20Tick(value?: string): string {
  return (value ?? '').trim().toUpperCase()
}

function normalizeKrc20Lookup(value: string): string {
  return value.trim()
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function sompiBigintToKaspa(value: bigint | number | string | undefined): number {
  if (typeof value === 'bigint') {
    const whole = value / BigInt(KASPA_DECIMALS)
    const fraction = value % BigInt(KASPA_DECIMALS)
    return Number(whole) + Number(fraction) / KASPA_DECIMALS
  }

  return sompiToKaspa(toNumber(value))
}

function normalizeTimestamp(value: unknown): number {
  const timestamp = toNumber(value)
  if (!timestamp) return 0
  return timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000
}

function normalizeNodeHost(value?: string): string {
  if (!value) return 'wRPC node'

  try {
    const parsed = new URL(value.includes('://') ? value : `wss://${value}`)
    return parsed.hostname || value
  } catch {
    return value.replace(/^wss?:\/\//, '').split('/')[0] || value
  }
}

function toBooleanish(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

function toBigInt(value: bigint | number | string | undefined): bigint {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') return Number.isFinite(value) ? BigInt(Math.trunc(value)) : 0n
  if (typeof value === 'string' && value.trim().length > 0) {
    try {
      return BigInt(value.trim())
    } catch {
      return 0n
    }
  }
  return 0n
}

function compareNumericStrings(left: string, right: string): number {
  const leftValue = toBigInt(left)
  const rightValue = toBigInt(right)
  if (leftValue === rightValue) return 0
  return leftValue > rightValue ? 1 : -1
}

async function loadKaspaRpcModule(): Promise<KaspaRpcModule> {
  if (!kaspaRpcModulePromise) {
    kaspaRpcModulePromise = import('@kasdk/web-rpc').then(async (module) => {
      await module.default({ module_or_path: kaspaRpcWasmUrl })
      return module
    })
  }

  return kaspaRpcModulePromise
}

function isTransientBroadcastError(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('websocket disconnected') ||
    normalized.includes('connection closed') ||
    normalized.includes('connection reset') ||
    normalized.includes('service unavailable') ||
    normalized.includes('gateway timeout') ||
    normalized.includes('timeout') ||
    normalized.includes('502') ||
    normalized.includes('503') ||
    normalized.includes('504')
  )
}

function dedupeStrings(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))]
}

interface ApiBalanceResponse {
  address: string
  balance: number | string
}

interface ApiUtxoResponse {
  address: string
  outpoint: {
    transactionId: string
    index: number
  }
  utxoEntry: {
    amount: number | string
    scriptPublicKey?: {
      scriptPublicKey: string
    }
    isCoinbase: boolean
  }
}

interface ApiTxInput {
  previous_outpoint_hash: string
  previous_outpoint_index: string | number
  signature_script?: string
  previous_outpoint_address?: string
  previous_outpoint_amount?: string | number
}

interface ApiTxOutput {
  amount: string | number
  script_public_key: string
  script_public_key_address?: string
}

interface ApiTxModel {
  hash?: string
  transaction_id?: string
  subnetwork_id?: string
  payload?: string | null
  block_hash?: string[]
  block_time?: number
  accepting_block_hash?: string
  accepting_block_time?: number
  inputs?: ApiTxInput[]
  outputs?: ApiTxOutput[]
}

interface ApiFeeEstimateResponse {
  priorityBucket?: {
    feerate?: number
    estimatedSeconds?: number
  }
  normalBuckets?: Array<{
    feerate?: number
    estimatedSeconds?: number
  }>
  lowBuckets?: Array<{
    feerate?: number
    estimatedSeconds?: number
  }>
}

interface ApiSubmitTransactionResponse {
  transactionId?: string
  error?: string
}

interface ApiCoinSupplyResponse {
  circulatingSupply?: number | string
  maxSupply?: number | string
}

interface ApiHashrateResponse {
  hashrate?: number | string
}

interface ApiPriceResponse {
  price?: number | string
}

interface ApiMarketcapResponse {
  marketcap?: number | string
}

interface ApiBlockRewardResponse {
  blockreward?: number | string
}

interface ApiHealthServer {
  kaspadHost?: string
  serverVersion?: string
  isUtxoIndexed?: boolean
  isSynced?: boolean
  p2pId?: string
  blueScore?: number | string
}

interface ApiHealthDatabase {
  isSynced?: boolean
  blueScore?: number | string
  blueScoreDiff?: number | string
  acceptedTxBlockTime?: number | string
  acceptedTxBlockTimeDiff?: number | string
}

interface ApiHealthResponse {
  kaspadServers?: ApiHealthServer[]
  database?: ApiHealthDatabase
}

interface ApiHashrateHistoryResponse {
  daaScore?: number | string
  blueScore?: number | string
  timestamp?: number | string
  date_time?: string
  bits?: number | string
  difficulty?: number | string
  hashrate_kh?: number | string
}

interface ApiDistributionTier {
  tier?: number | string
  count?: number | string
  amount?: number | string
}

interface ApiDistributionSnapshot {
  timestamp?: number | string
  tiers?: ApiDistributionTier[]
}

interface ApiRichListEntry {
  rank?: number | string
  address?: string
  amount?: number | string
}

interface ApiRichListSnapshot {
  timestamp?: number | string
  ranking?: ApiRichListEntry[]
}

interface KasplexListResponse<T> {
  message?: string
  prev?: string
  next?: string
  result?: T[]
}

interface ApiKrc20BalanceItem {
  tick?: string
  ca?: string
  balance?: number | string
  locked?: number | string
  dec?: number | string
  opScoreMod?: number | string
}

interface ApiKrc20TokenInfoItem {
  tick?: string
  ca?: string
  name?: string
  max?: number | string
  lim?: number | string
  pre?: number | string
  to?: string
  dec?: number | string
  mod?: string
  minted?: number | string
  burned?: number | string
  state?: string
  hashRev?: string
  opScoreAdd?: number | string
  opScoreMod?: number | string
  mtsAdd?: number | string
  holderTotal?: number | string
  transferTotal?: number | string
  mintTotal?: number | string
}

interface ApiKrc20OperationItem {
  p?: string
  op?: string
  tick?: string
  ca?: string
  amt?: number | string
  from?: string
  to?: string
  price?: number | string
  feeRev?: number | string
  opScore?: number | string
  hashRev?: string
  txAccept?: boolean | number | string
  opAccept?: boolean | number | string
  opError?: string
  checkpoint?: string
  mtsAdd?: number | string
  mtsMod?: number | string
}

interface ApiAddressTransactionCountResponse {
  total?: number | string
  transactionsCount?: number | string
  count?: number | string
}

interface ApiBlockParentSet {
  parentHashes?: string[]
}

interface ApiBlockTxInput {
  previousOutpoint?: {
    transactionId?: string
    index?: number | string
  }
  signatureScript?: string
  sequence?: number | string
}

interface ApiBlockTxOutput {
  amount?: number | string
  scriptPublicKey?: {
    scriptPublicKey?: string
  }
  verboseData?: {
    scriptPublicKeyAddress?: string
  }
}

interface ApiBlockTxModel {
  inputs?: ApiBlockTxInput[]
  outputs?: ApiBlockTxOutput[]
  subnetworkId?: string
  payload?: string
  verboseData?: {
    transactionId?: string
    hash?: string
    computeMass?: number | string
    blockHash?: string
    blockTime?: number | string
  }
}

interface ApiBlockHeader {
  timestamp?: number | string
  bits?: number | string
  daaScore?: number | string
  blueScore?: number | string
  parents?: ApiBlockParentSet[]
}

interface ApiBlockVerboseData {
  hash?: string
  difficulty?: number | string
  selectedParentHash?: string
  transactionIds?: string[]
  blueScore?: number | string
  childrenHashes?: string[]
  mergeSetBluesHashes?: string[]
  mergeSetRedsHashes?: string[]
  isChainBlock?: boolean
}

interface ApiBlockModel {
  header: ApiBlockHeader
  transactions?: ApiBlockTxModel[]
  verboseData: ApiBlockVerboseData
}

export interface ExplorerCoinSupply {
  circulatingSupply: number
  maxSupply: number
}

export interface ExplorerHealth {
  kaspadSynced: boolean
  databaseSynced: boolean
  blueScoreDiff: number
  acceptedTxBlockTimeDiff: number
  serverVersion: string
  host: string
}

export interface ExplorerHashratePoint {
  daaScore: number
  blueScore: number
  timestamp: number
  dateTime: string
  difficulty: number
  hashrateKh: number
}

export interface ExplorerAddressDistributionTier {
  tier: number
  count: number
  amount: number
}

export interface ExplorerRichListEntry {
  rank: number
  address: string
  amount: number
}

export interface ExplorerBlockTransaction {
  hash: string
  blockHash?: string
  blockTime?: number
  inputsCount: number
  outputsCount: number
  totalOutput: number
  recipients: string[]
}

export interface ExplorerBlock {
  hash: string
  timestamp: number
  bits: number
  daaScore: number
  blueScore: number
  difficulty: number
  selectedParentHash?: string
  parentHashes: string[]
  childHashes: string[]
  mergeSetBluesHashes: string[]
  mergeSetRedsHashes: string[]
  isChainBlock: boolean
  transactionIds: string[]
  transactionCount: number
  transactions: ExplorerBlockTransaction[]
}

export type ExplorerStreamSource = 'wrpc' | 'resolver'

export interface ExplorerStreamStatus {
  state: 'idle' | 'connecting' | 'streaming' | 'error'
  source: ExplorerStreamSource
  label: string
  detail: string
  host?: string
  serverVersion?: string
  lastEventAt?: number
}

export interface ExplorerLiveUpdate {
  at: number
  dagInfo?: DagInfo
  coinSupply?: ExplorerCoinSupply
  health?: ExplorerHealth
  recentBlocks?: ExplorerBlock[]
}

export interface ExplorerLiveStreamCallbacks {
  onStatusChange?: (status: ExplorerStreamStatus) => void
  onUpdate?: (update: ExplorerLiveUpdate) => void
  onError?: (error: Error) => void
}

export interface ExplorerLiveStreamController {
  start(): Promise<void>
  stop(): Promise<void>
  refresh(): Promise<void>
}

export function kaspaToSompi(kas: number): number {
  return Math.round(kas * KASPA_DECIMALS)
}

export function sompiToKaspa(sompi: number): number {
  return sompi / KASPA_DECIMALS
}

export function formatKaspaAmount(amount: number, decimals: number = 8): string {
  const kas = sompiToKaspa(amount)
  return kas.toFixed(decimals).replace(/\.?0+$/, '') || '0'
}

export function formatTokenAmount(
  amount: bigint | number | string | undefined,
  decimals: number = 8,
  maxFractionDigits: number = 6
): string {
  const normalizedDecimals = Number.isFinite(decimals) ? Math.max(0, Math.trunc(decimals)) : 0
  const raw = toBigInt(amount)
  const isNegative = raw < 0n
  const value = isNegative ? -raw : raw

  if (normalizedDecimals === 0) {
    return `${isNegative ? '-' : ''}${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
  }

  const divisor = 10n ** BigInt(normalizedDecimals)
  const whole = value / divisor
  const fraction = value % divisor
  let fractionText = fraction.toString().padStart(normalizedDecimals, '0').replace(/0+$/, '')

  if (maxFractionDigits >= 0 && fractionText.length > maxFractionDigits) {
    fractionText = fractionText.slice(0, maxFractionDigits).replace(/0+$/, '')
  }

  const wholeText = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${isNegative ? '-' : ''}${wholeText}${fractionText ? `.${fractionText}` : ''}`
}

export function formatAddress(address: string, maxLength: number = 16): string {
  if (address.length <= maxLength) return address
  const start = address.slice(0, 8)
  const end = address.slice(-8)
  return `${start}...${end}`
}

function mapApiTransaction(tx: ApiTxModel): Transaction {
  const inputs = (tx.inputs ?? []).map((input) => {
    const previousOutpointAddress = input.previous_outpoint_address
    const previousOutpointAmount = toNumber(input.previous_outpoint_amount)

    return {
      previousOutpointHash: input.previous_outpoint_hash,
      previousOutpointIndex: toNumber(input.previous_outpoint_index),
      signatureScript: input.signature_script ?? '',
      sequence: 0,
      utxoEntry: previousOutpointAddress
        ? {
            outpointHash: input.previous_outpoint_hash,
            outpointIndex: toNumber(input.previous_outpoint_index),
            amount: previousOutpointAmount,
            address: previousOutpointAddress,
            isCoinbase: false,
          }
        : undefined,
    }
  })

  const outputs = (tx.outputs ?? []).map((output) => ({
    amount: toNumber(output.amount),
    scriptPubKey: output.script_public_key,
    address: output.script_public_key_address,
    isSpent: false,
  }))

  const inputAmount = inputs.reduce((sum, input) => sum + (input.utxoEntry?.amount ?? 0), 0)
  const outputAmount = outputs.reduce((sum, output) => sum + output.amount, 0)
  const fee = Math.max(0, inputAmount - outputAmount)

  const timestamp = tx.accepting_block_time ?? tx.block_time ?? Date.now()
  const blockHash = tx.accepting_block_hash ?? tx.block_hash?.[0]

  return {
    hash: tx.hash ?? tx.transaction_id ?? '',
    blockHash,
    blockTime: tx.block_time,
    timestamp,
    inputs,
    outputs,
    subnetworkId: tx.subnetwork_id ?? '0000000000000000000000000000000000000000',
    fee,
    payload: tx.payload ?? undefined,
  }
}

function mapApiBlockTransaction(tx: ApiBlockTxModel): ExplorerBlockTransaction {
  const outputs = tx.outputs ?? []

  return {
    hash: tx.verboseData?.transactionId ?? tx.verboseData?.hash ?? '',
    blockHash: tx.verboseData?.blockHash,
    blockTime: toNumber(tx.verboseData?.blockTime),
    inputsCount: tx.inputs?.length ?? 0,
    outputsCount: outputs.length,
    totalOutput: outputs.reduce((sum, output) => sum + toNumber(output.amount), 0),
    recipients: dedupeStrings(outputs.map((output) => output.verboseData?.scriptPublicKeyAddress)),
  }
}

function mapApiBlock(block: ApiBlockModel): ExplorerBlock {
  const transactions = (block.transactions ?? []).map(mapApiBlockTransaction)
  const parentHashes = dedupeStrings((block.header.parents ?? []).flatMap((parentSet) => parentSet.parentHashes ?? []))
  const transactionIds = dedupeStrings([
    ...(block.verboseData.transactionIds ?? []),
    ...transactions.map((transaction) => transaction.hash),
  ])

  return {
    hash: block.verboseData.hash ?? '',
    timestamp: toNumber(block.header.timestamp),
    bits: toNumber(block.header.bits),
    daaScore: toNumber(block.header.daaScore),
    blueScore: toNumber(block.verboseData.blueScore ?? block.header.blueScore),
    difficulty: toNumber(block.verboseData.difficulty),
    selectedParentHash: block.verboseData.selectedParentHash,
    parentHashes,
    childHashes: dedupeStrings(block.verboseData.childrenHashes ?? []),
    mergeSetBluesHashes: dedupeStrings(block.verboseData.mergeSetBluesHashes ?? []),
    mergeSetRedsHashes: dedupeStrings(block.verboseData.mergeSetRedsHashes ?? []),
    isChainBlock: Boolean(block.verboseData.isChainBlock),
    transactionIds,
    transactionCount: transactionIds.length,
    transactions,
  }
}

function mapKrc20TokenBalance(item: ApiKrc20BalanceItem): Krc20TokenBalance {
  return {
    tick: normalizeKrc20Tick(item.tick),
    contractAddress: item.ca,
    balanceRaw: toNumericString(item.balance),
    lockedRaw: toNumericString(item.locked),
    decimals: toNumber(item.dec),
    opScoreMod: toNumericString(item.opScoreMod),
  }
}

function mapKrc20TokenInfo(item: ApiKrc20TokenInfoItem): Krc20TokenInfo {
  return {
    tick: normalizeKrc20Tick(item.tick),
    contractAddress: item.ca,
    name: item.name,
    maxRaw: toNumericString(item.max),
    limitRaw: toNumericString(item.lim),
    premineRaw: toNumericString(item.pre),
    toAddress: item.to ?? '',
    decimals: toNumber(item.dec),
    mode: item.mod ?? '',
    mintedRaw: toNumericString(item.minted),
    burnedRaw: toNumericString(item.burned),
    state: item.state ?? 'unknown',
    hashRev: item.hashRev ?? '',
    opScoreAdd: item.opScoreAdd !== undefined ? toNumericString(item.opScoreAdd) : undefined,
    opScoreMod: item.opScoreMod !== undefined ? toNumericString(item.opScoreMod) : undefined,
    createdAt: item.mtsAdd !== undefined ? normalizeTimestamp(item.mtsAdd) : undefined,
    holderTotal: item.holderTotal !== undefined ? toNumber(item.holderTotal) : undefined,
    transferTotal: item.transferTotal !== undefined ? toNumber(item.transferTotal) : undefined,
    mintTotal: item.mintTotal !== undefined ? toNumber(item.mintTotal) : undefined,
  }
}

function mapKrc20Operation(item: ApiKrc20OperationItem): Krc20Operation {
  return {
    protocol: item.p ?? 'KRC-20',
    op: item.op ?? '',
    tick: normalizeKrc20Tick(item.tick),
    contractAddress: item.ca,
    amountRaw: toNumericString(item.amt),
    from: item.from,
    to: item.to,
    priceRaw: item.price !== undefined ? toNumericString(item.price) : undefined,
    feeRaw: item.feeRev !== undefined ? toNumericString(item.feeRev) : undefined,
    opScore: toNumericString(item.opScore),
    hashRev: item.hashRev ?? '',
    txAccepted: toBooleanish(item.txAccept),
    opAccepted: toBooleanish(item.opAccept),
    opError: item.opError,
    checkpoint: item.checkpoint,
    addedAt: item.mtsAdd !== undefined ? normalizeTimestamp(item.mtsAdd) : undefined,
    updatedAt: item.mtsMod !== undefined ? normalizeTimestamp(item.mtsMod) : undefined,
  }
}

function mapRpcBlockTransaction(tx: ITransaction): ExplorerBlockTransaction {
  const outputs = tx.outputs ?? []

  return {
    hash: tx.verboseData?.transactionId ?? tx.verboseData?.hash ?? '',
    blockHash: tx.verboseData?.blockHash,
    blockTime: normalizeTimestamp(tx.verboseData?.blockTime),
    inputsCount: tx.inputs?.length ?? 0,
    outputsCount: outputs.length,
    totalOutput: outputs.reduce((sum, output) => sum + toNumber(output.value), 0),
    recipients: dedupeStrings(outputs.map((output) => output.verboseData?.scriptPublicKeyAddress)),
  }
}

function mapRpcBlock(block: IBlock): ExplorerBlock {
  const transactions = (block.transactions ?? []).map(mapRpcBlockTransaction)
  const parentHashes = dedupeStrings((block.header.parentsByLevel ?? []).flatMap((parentSet) => parentSet ?? []))
  const transactionIds = dedupeStrings([
    ...(block.verboseData?.transactionIds ?? []),
    ...transactions.map((transaction) => transaction.hash),
  ])

  return {
    hash: block.verboseData?.hash ?? block.header.hash ?? '',
    timestamp: normalizeTimestamp(block.header.timestamp),
    bits: toNumber(block.header.bits),
    daaScore: toNumber(block.header.daaScore),
    blueScore: toNumber(block.verboseData?.blueScore ?? block.header.blueScore),
    difficulty: toNumber(block.verboseData?.difficulty),
    selectedParentHash: block.verboseData?.selectedParentHash,
    parentHashes,
    childHashes: dedupeStrings(block.verboseData?.childrenHashes ?? []),
    mergeSetBluesHashes: dedupeStrings(block.verboseData?.mergeSetBluesHashes ?? []),
    mergeSetRedsHashes: dedupeStrings(block.verboseData?.mergeSetRedsHashes ?? []),
    isChainBlock: Boolean(block.verboseData?.isChainBlock),
    transactionIds,
    transactionCount: transactionIds.length || transactions.length,
    transactions,
  }
}

function mapRpcDagInfo(dagInfo: IGetBlockDagInfoResponse, sinkBlueScore?: number): DagInfo {
  return {
    blockCount: toNumber(dagInfo.blockCount),
    headerCount: toNumber(dagInfo.headerCount),
    difficulty: toNumber(dagInfo.difficulty),
    pastMedianTime: normalizeTimestamp(dagInfo.pastMedianTime),
    virtualSelectedParentBlueScore: sinkBlueScore ?? toNumber(dagInfo.virtualDaaScore),
    tipHashes: dedupeStrings(dagInfo.tipHashes ?? []),
    networkName: dagInfo.network,
    sink: dagInfo.sink,
  }
}

function mapRpcCoinSupply(supply: IGetCoinSupplyResponse): ExplorerCoinSupply {
  return {
    circulatingSupply: sompiBigintToKaspa(supply.circulatingSompi),
    maxSupply: sompiBigintToKaspa(supply.maxSompi),
  }
}

function mapRpcHealth(serverInfo: IGetServerInfoResponse, currentUrl?: string): ExplorerHealth {
  return {
    kaspadSynced: Boolean(serverInfo.isSynced),
    databaseSynced: true,
    blueScoreDiff: 0,
    acceptedTxBlockTimeDiff: 0,
    serverVersion: serverInfo.serverVersion ?? 'Unknown',
    host: normalizeNodeHost(currentUrl),
  }
}

function buildRecentBlocksFromCache(
  blockCache: Map<string, ExplorerBlock>,
  tipHashes: string[],
  limit: number
): ExplorerBlock[] {
  const queue = [...tipHashes]
  const visited = new Set<string>()
  const collected: ExplorerBlock[] = []

  while (queue.length > 0 && collected.length < limit) {
    const hash = queue.shift()
    if (!hash || visited.has(hash)) continue
    visited.add(hash)

    const block = blockCache.get(hash)
    if (!block) continue

    collected.push(block)
    if (block.selectedParentHash && !visited.has(block.selectedParentHash)) {
      queue.push(block.selectedParentHash)
    }
  }

  if (collected.length < limit) {
    const fallbackBlocks = [...blockCache.values()]
      .filter((block) => !visited.has(block.hash))
      .sort((left, right) => right.blueScore - left.blueScore || right.timestamp - left.timestamp)

    for (const block of fallbackBlocks) {
      collected.push(block)
      if (collected.length >= limit) break
    }
  }

  return collected
    .sort((left, right) => right.blueScore - left.blueScore || right.timestamp - left.timestamp)
    .slice(0, limit)
}

class KaspaExplorerLiveStream implements ExplorerLiveStreamController {
  private readonly blockCache = new Map<string, ExplorerBlock>()
  private rpc: KaspaRpcClient | null = null
  private rpcModule: KaspaRpcModule | null = null
  private syncTimer: number | null = null
  private syncPromise: Promise<void> | null = null
  private syncQueued = false
  private stopped = false
  private currentSource: ExplorerStreamSource = 'wrpc'
  private lastStatus: ExplorerStreamStatus = {
    state: 'idle',
    source: 'wrpc',
    label: 'Idle',
    detail: 'Live stream is not connected yet.',
  }

  private readonly handleConnect = () => {
    void this.onConnected()
  }

  private readonly handleDisconnect = () => {
    if (this.stopped) return

    this.setStatus({
      state: 'connecting',
      source: this.currentSource,
      label: 'Reconnecting live feed',
      detail: 'The Kaspa wRPC connection dropped and is reconnecting.',
      host: this.rpc?.url ? normalizeNodeHost(this.rpc.url) : this.lastStatus.host,
      serverVersion: this.lastStatus.serverVersion,
      lastEventAt: Date.now(),
    })
  }

  private readonly handleRpcEvent = () => {
    this.queueSync()
  }

  constructor(
    private readonly network: KaspaNetwork,
    private readonly callbacks: ExplorerLiveStreamCallbacks
  ) {}

  async start(): Promise<void> {
    this.stopped = false
    this.blockCache.clear()

    try {
      await this.connectDirect()
    } catch (error) {
      try {
        await this.connectWithResolver()
      } catch (resolverError) {
        const typedError =
          resolverError instanceof Error
            ? resolverError
            : error instanceof Error
              ? error
              : new Error('Unable to connect to a Kaspa wRPC node.')

        this.setStatus({
          state: 'error',
          source: this.currentSource,
          label: 'Live stream unavailable',
          detail: typedError.message,
          lastEventAt: Date.now(),
        })
        this.callbacks.onError?.(typedError)
        throw typedError
      }
    }
  }

  async stop(): Promise<void> {
    this.stopped = true

    if (this.syncTimer != null) {
      window.clearTimeout(this.syncTimer)
      this.syncTimer = null
    }

    await this.teardownRpc()
  }

  async refresh(): Promise<void> {
    await this.syncNow()
  }

  private async teardownRpc(): Promise<void> {
    const rpc = this.rpc
    const module = this.rpcModule

    this.rpc = null

    if (rpc && module) {
      rpc.removeEventListener(LIVE_RPC_EVENT_NAMES.connect, this.handleConnect)
      rpc.removeEventListener(LIVE_RPC_EVENT_NAMES.disconnect, this.handleDisconnect)
      rpc.removeEventListener(LIVE_RPC_EVENT_NAMES.blockAdded, this.handleRpcEvent)
      rpc.removeEventListener(LIVE_RPC_EVENT_NAMES.virtualChainChanged, this.handleRpcEvent)

      try {
        await rpc.disconnect()
      } catch {
        // Ignore disconnect failures when tearing down the stream.
      }
    }
  }

  private async connectDirect(): Promise<void> {
    const url = LIVE_RPC_URLS[this.network.id]
    if (!url) {
      throw new Error(`No direct wRPC endpoint configured for ${this.network.name}.`)
    }

    this.currentSource = 'wrpc'
    await this.connect(url)
  }

  private async connectWithResolver(): Promise<void> {
    this.currentSource = 'resolver'
    await this.teardownRpc()
    const module = await loadKaspaRpcModule()
    this.rpcModule = module

    const rpc = new module.RpcClient({
      resolver: new module.Resolver(),
      networkId: LIVE_RPC_NETWORK_IDS[this.network.id] ?? 'mainnet',
      encoding: module.Encoding.Borsh,
    })

    this.attachListeners(rpc)
    this.rpc = rpc

    this.setStatus({
      state: 'connecting',
      source: 'resolver',
      label: 'Resolving live feed',
      detail: 'Finding a public Kaspa wRPC node for the live monitor.',
      lastEventAt: Date.now(),
    })

    await rpc.connect({ timeoutDuration: 8000 })
  }

  private async connect(url: string): Promise<void> {
    await this.teardownRpc()
    const module = await loadKaspaRpcModule()
    this.rpcModule = module

    const rpc = new module.RpcClient({
      url,
      networkId: LIVE_RPC_NETWORK_IDS[this.network.id] ?? 'mainnet',
      encoding: module.Encoding.Borsh,
    })

    this.attachListeners(rpc)
    this.rpc = rpc

    this.setStatus({
      state: 'connecting',
      source: 'wrpc',
      label: 'Connecting live feed',
      detail: `Opening direct stream to ${normalizeNodeHost(url)}.`,
      host: normalizeNodeHost(url),
      lastEventAt: Date.now(),
    })

    await rpc.connect({ timeoutDuration: 8000 })
  }

  private attachListeners(rpc: KaspaRpcClient) {
    rpc.addEventListener(LIVE_RPC_EVENT_NAMES.connect, this.handleConnect)
    rpc.addEventListener(LIVE_RPC_EVENT_NAMES.disconnect, this.handleDisconnect)
    rpc.addEventListener(LIVE_RPC_EVENT_NAMES.blockAdded, this.handleRpcEvent)
    rpc.addEventListener(LIVE_RPC_EVENT_NAMES.virtualChainChanged, this.handleRpcEvent)
  }

  private async onConnected(): Promise<void> {
    if (this.stopped || !this.rpc) return

    try {
      await Promise.all([
        this.rpc.subscribeBlockAdded(),
        this.rpc.subscribeVirtualChainChanged(false),
      ])
      await this.syncNow()
    } catch (error) {
      const typedError =
        error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Live stream connection failed.')
      this.callbacks.onError?.(typedError)
      this.setStatus({
        state: 'error',
        source: this.currentSource,
        label: 'Live stream degraded',
        detail: typedError.message,
        host: this.rpc.url ? normalizeNodeHost(this.rpc.url) : this.lastStatus.host,
        lastEventAt: Date.now(),
      })
    }
  }

  private queueSync() {
    if (this.stopped) return

    if (this.syncTimer != null) {
      return
    }

    this.syncTimer = window.setTimeout(() => {
      this.syncTimer = null
      void this.syncNow()
    }, 220)
  }

  private async syncNow(): Promise<void> {
    if (this.syncPromise) {
      this.syncQueued = true
      return this.syncPromise
    }

    this.syncPromise = this.performSync().finally(() => {
      this.syncPromise = null

      if (this.syncQueued) {
        this.syncQueued = false
        void this.syncNow()
      }
    })

    return this.syncPromise
  }

  private async performSync(): Promise<void> {
    const rpc = this.rpc
    if (!rpc || this.stopped) return

    const [dagResult, serverResult, sinkResult, supplyResult] = await Promise.allSettled([
      rpc.getBlockDagInfo(),
      rpc.getServerInfo(),
      rpc.getSinkBlueScore(),
      rpc.getCoinSupply(),
    ])

    const dagInfo =
      dagResult.status === 'fulfilled'
        ? mapRpcDagInfo(
            dagResult.value,
            sinkResult.status === 'fulfilled' ? toNumber(sinkResult.value.blueScore) : undefined
          )
        : undefined

    const tipHashes = dagInfo?.tipHashes ?? []
    const recentBlocks = tipHashes.length > 0 ? await this.fetchRecentBlocks(tipHashes) : []

    const health =
      serverResult.status === 'fulfilled'
        ? mapRpcHealth(serverResult.value, rpc.url)
        : undefined

    const coinSupply =
      supplyResult.status === 'fulfilled'
        ? mapRpcCoinSupply(supplyResult.value)
        : undefined

    const liveHost =
      serverResult.status === 'fulfilled'
        ? normalizeNodeHost(rpc.url)
        : this.lastStatus.host

    const serverVersion =
      serverResult.status === 'fulfilled'
        ? serverResult.value.serverVersion
        : this.lastStatus.serverVersion

    this.setStatus({
      state: 'streaming',
      source: this.currentSource,
      label: this.currentSource === 'wrpc' ? 'Streaming live chain' : 'Streaming via resolver',
      detail: liveHost ? `Receiving live block updates from ${liveHost}.` : 'Receiving live block updates.',
      host: liveHost,
      serverVersion,
      lastEventAt: Date.now(),
    })

    this.callbacks.onUpdate?.({
      at: Date.now(),
      dagInfo,
      coinSupply,
      health,
      recentBlocks,
    })
  }

  private async fetchRecentBlocks(tipHashes: string[]): Promise<ExplorerBlock[]> {
    const rpc = this.rpc
    if (!rpc) return []

    const queue = [...tipHashes]
    const visited = new Set<string>()
    const blocks: ExplorerBlock[] = []

    while (queue.length > 0 && blocks.length < LIVE_RECENT_BLOCK_LIMIT) {
      const nextBatch: string[] = []

      while (queue.length > 0 && nextBatch.length < 3 && blocks.length + nextBatch.length < LIVE_RECENT_BLOCK_LIMIT) {
        const hash = queue.shift()
        if (!hash || visited.has(hash)) continue
        visited.add(hash)

        const cachedBlock = this.blockCache.get(hash)
        if (cachedBlock) {
          blocks.push(cachedBlock)
          if (cachedBlock.selectedParentHash && !visited.has(cachedBlock.selectedParentHash)) {
            queue.push(cachedBlock.selectedParentHash)
          }
          continue
        }

        nextBatch.push(hash)
      }

      if (nextBatch.length === 0) {
        continue
      }

      const fetchedBlocks = await Promise.all(
        nextBatch.map(async (hash) => {
          const response = await rpc.getBlock({ hash, includeTransactions: false })
          return mapRpcBlock(response.block)
        })
      )

      for (const block of fetchedBlocks) {
        if (!block.hash) continue
        this.blockCache.set(block.hash, block)
        blocks.push(block)
        if (block.selectedParentHash && !visited.has(block.selectedParentHash)) {
          queue.push(block.selectedParentHash)
        }
      }
    }

    const recentBlocks = buildRecentBlocksFromCache(this.blockCache, tipHashes, LIVE_RECENT_BLOCK_LIMIT)
    this.trimCache(recentBlocks)
    return recentBlocks
  }

  private trimCache(recentBlocks: ExplorerBlock[]) {
    const keep = new Set(recentBlocks.map((block) => block.hash))

    for (const block of recentBlocks) {
      if (block.selectedParentHash) {
        keep.add(block.selectedParentHash)
      }
    }

    for (const hash of this.blockCache.keys()) {
      if (!keep.has(hash)) {
        this.blockCache.delete(hash)
      }
    }
  }

  private setStatus(status: ExplorerStreamStatus) {
    this.lastStatus = status
    this.callbacks.onStatusChange?.(status)
  }
}

class KaspaAPI {
  private network: KaspaNetwork
  private readonly krc20InfoCache = new Map<string, Krc20TokenInfo>()

  constructor(network: KaspaNetwork = NETWORKS.mainnet) {
    this.network = network
  }

  setNetwork(network: KaspaNetwork) {
    this.network = network
  }

  getNetwork(): KaspaNetwork {
    return this.network
  }

  supportsKrc20(): boolean {
    return Boolean(this.network.krc20ApiUrl)
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.network.apiUrl}${endpoint}`
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`API Error: ${response.status} - ${error}`)
    }

    return response.json()
  }

  private getKrc20BaseUrl(): string {
    if (!this.network.krc20ApiUrl) {
      throw new Error(`KRC-20 indexing is not currently available on ${this.network.name}.`)
    }

    return this.network.krc20ApiUrl
  }

  private async requestKrc20<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.getKrc20BaseUrl()}${endpoint}`
    const desktopGet = typeof window !== 'undefined' ? window.kaspaDesktop?.httpGet : undefined

    if (desktopGet) {
      const response = await desktopGet(url)
      if (!response.ok) {
        throw new Error(`KRC-20 API Error: ${response.status} - ${response.body}`)
      }

      return JSON.parse(response.body) as T
    }

    if (typeof window !== 'undefined') {
      throw new Error(
        'KRC-20 data is currently available in the Electron desktop build only because the public Kasplex API blocks direct browser-origin requests.'
      )
    }

    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`KRC-20 API Error: ${response.status} - ${error}`)
    }

    return response.json()
  }

  async getDagInfo(): Promise<DagInfo> {
    const data = await this.request<{
      networkName?: string
      blockCount: number | string
      headerCount: number | string
      difficulty: number | string
      pastMedianTime: number | string
      virtualDaaScore?: number | string
      blueScore?: number | string
      virtualSelectedParentBlueScore?: number | string
      tipHashes?: string[]
      sink?: string
    }>('/info/blockdag')

    return {
      blockCount: toNumber(data.blockCount),
      headerCount: toNumber(data.headerCount),
      difficulty: toNumber(data.difficulty),
      pastMedianTime: toNumber(data.pastMedianTime),
      virtualSelectedParentBlueScore: toNumber(
        data.virtualSelectedParentBlueScore ?? data.virtualDaaScore ?? data.blueScore
      ),
      tipHashes: dedupeStrings(data.tipHashes ?? []),
      networkName: data.networkName,
      sink: data.sink,
    }
  }

  async getCoinSupply(): Promise<ExplorerCoinSupply> {
    const data = await this.request<ApiCoinSupplyResponse>('/info/coinsupply')
    return {
      circulatingSupply: toNumber(data.circulatingSupply),
      maxSupply: toNumber(data.maxSupply),
    }
  }

  async getPrice(): Promise<number> {
    const data = await this.request<ApiPriceResponse>('/info/price')
    return toNumber(data.price)
  }

  async getMarketcap(): Promise<number> {
    const data = await this.request<ApiMarketcapResponse>('/info/marketcap')
    return toNumber(data.marketcap)
  }

  async getHashrate(): Promise<number> {
    const data = await this.request<ApiHashrateResponse>('/info/hashrate')
    return toNumber(data.hashrate)
  }

  async getBlockReward(): Promise<number> {
    const data = await this.request<ApiBlockRewardResponse>('/info/blockreward')
    return toNumber(data.blockreward)
  }

  async getHealth(): Promise<ExplorerHealth> {
    const data = await this.request<ApiHealthResponse>('/info/health')
    const server = data.kaspadServers?.[0]

    return {
      kaspadSynced: Boolean(server?.isSynced),
      databaseSynced: Boolean(data.database?.isSynced),
      blueScoreDiff: toNumber(data.database?.blueScoreDiff),
      acceptedTxBlockTimeDiff: toNumber(data.database?.acceptedTxBlockTimeDiff),
      serverVersion: server?.serverVersion ?? 'Unknown',
      host: server?.kaspadHost ?? 'Unknown',
    }
  }

  async getHashrateHistory(dayOrMonth: string, resolution?: '15m' | '1h'): Promise<ExplorerHashratePoint[]> {
    const params = new URLSearchParams()
    if (resolution) {
      params.set('resolution', resolution)
    }

    const suffix = params.toString() ? `?${params.toString()}` : ''
    const data = await this.request<ApiHashrateHistoryResponse[]>(
      `/info/hashrate/history/${encodeURIComponent(dayOrMonth)}${suffix}`
    )

    return data.map((point) => ({
      daaScore: toNumber(point.daaScore),
      blueScore: toNumber(point.blueScore),
      timestamp: toNumber(point.timestamp),
      dateTime: point.date_time ?? '',
      difficulty: toNumber(point.difficulty),
      hashrateKh: toNumber(point.hashrate_kh),
    }))
  }

  async getAddressDistribution(limit: 1 | 24 = 24): Promise<ExplorerAddressDistributionTier[]> {
    const data = await this.request<ApiDistributionSnapshot[]>(`/addresses/distribution?limit=${limit}`)
    const latestSnapshot = data[0]

    return (latestSnapshot?.tiers ?? []).map((tier) => ({
      tier: toNumber(tier.tier),
      count: toNumber(tier.count),
      amount: toNumber(tier.amount),
    }))
  }

  async getRichList(): Promise<ExplorerRichListEntry[]> {
    const data = await this.request<ApiRichListSnapshot[]>('/addresses/top?limit=1')
    const latestSnapshot = data[0]

    return (latestSnapshot?.ranking ?? []).map((entry) => ({
      rank: toNumber(entry.rank),
      address: entry.address ?? '',
      amount: toNumber(entry.amount),
    }))
  }

  async getBlock(blockHash: string, includeTransactions: boolean = true): Promise<ExplorerBlock> {
    const data = await this.request<ApiBlockModel>(
      `/blocks/${encodeURIComponent(blockHash)}?includeTransactions=${includeTransactions}`
    )
    return mapApiBlock(data)
  }

  async getRecentBlocks(limit: number = 8, includeTransactions: boolean = false): Promise<ExplorerBlock[]> {
    const dagInfo = await this.getDagInfo()
    const queue = [...(dagInfo.tipHashes ?? [])]
    const visited = new Set<string>()
    const blocks: ExplorerBlock[] = []

    while (queue.length > 0 && blocks.length < limit) {
      const nextHashes: string[] = []
      while (queue.length > 0 && nextHashes.length < 3) {
        const hash = queue.shift()
        if (!hash || visited.has(hash)) continue
        visited.add(hash)
        nextHashes.push(hash)
      }

      if (nextHashes.length === 0) {
        continue
      }

      const fetchedBlocks = await Promise.all(
        nextHashes.map((hash) => this.getBlock(hash, includeTransactions).catch(() => null))
      )

      for (const block of fetchedBlocks) {
        if (!block || !block.hash) continue
        blocks.push(block)
        if (block.selectedParentHash && !visited.has(block.selectedParentHash)) {
          queue.push(block.selectedParentHash)
        }
      }
    }

    return blocks
      .sort((left, right) => right.blueScore - left.blueScore || right.timestamp - left.timestamp)
      .slice(0, limit)
  }

  createExplorerLiveStream(callbacks: ExplorerLiveStreamCallbacks): ExplorerLiveStreamController {
    return new KaspaExplorerLiveStream(this.network, callbacks)
  }

  async getKrc20AddressTokenList(address: string): Promise<Krc20TokenBalance[]> {
    const encodedAddress = normalizeAddressPath(address)
    const data = await this.requestKrc20<KasplexListResponse<ApiKrc20BalanceItem>>(
      `/krc20/address/${encodedAddress}/tokenlist`
    )

    return (data.result ?? [])
      .map(mapKrc20TokenBalance)
      .filter((token) => token.tick.length > 0)
      .sort((left, right) => {
        const balanceOrder = compareNumericStrings(right.balanceRaw, left.balanceRaw)
        if (balanceOrder !== 0) return balanceOrder
        const lockedOrder = compareNumericStrings(right.lockedRaw, left.lockedRaw)
        if (lockedOrder !== 0) return lockedOrder
        return right.opScoreMod.localeCompare(left.opScoreMod)
      })
  }

  async getKrc20TokenInfo(tokenId: string): Promise<Krc20TokenInfo> {
    const lookup = normalizeKrc20Lookup(tokenId)
    const cacheKey = `${this.network.id}:${lookup.toUpperCase()}`
    const cached = this.krc20InfoCache.get(cacheKey)
    if (cached) {
      return cached
    }

    const data = await this.requestKrc20<KasplexListResponse<ApiKrc20TokenInfoItem>>(
      `/krc20/token/${encodeURIComponent(lookup)}`
    )
    const info = mapKrc20TokenInfo(data.result?.[0] ?? {})
    if (!info.tick) {
      throw new Error(`KRC-20 token ${lookup} was not found.`)
    }

    this.krc20InfoCache.set(cacheKey, info)
    return info
  }

  async getKrc20Portfolio(address: string, metadataLimit: number = 16): Promise<Krc20PortfolioToken[]> {
    const balances = await this.getKrc20AddressTokenList(address)
    if (balances.length === 0) {
      return []
    }

    const metadataTargets = balances.slice(0, Math.max(0, metadataLimit))
    const metadataResults = await Promise.allSettled(
      metadataTargets.map((token) => this.getKrc20TokenInfo(token.contractAddress ?? token.tick))
    )
    const metadataByTick = new Map<string, Krc20TokenInfo>()

    for (const result of metadataResults) {
      if (result.status !== 'fulfilled') continue
      metadataByTick.set(result.value.tick, result.value)
    }

    return balances.map((token) => {
      const metadata = metadataByTick.get(token.tick)
      return {
        ...token,
        contractAddress: metadata?.contractAddress ?? token.contractAddress,
        name: metadata?.name,
        state: metadata?.state,
        mode: metadata?.mode,
        mintedRaw: metadata?.mintedRaw,
        maxRaw: metadata?.maxRaw,
        holderTotal: metadata?.holderTotal,
        metadataLoaded: Boolean(metadata),
      }
    })
  }

  async getKrc20Operations({
    address,
    tick,
    limit = 50,
  }: {
    address?: string
    tick?: string
    limit?: number
  } = {}): Promise<Krc20Operation[]> {
    const params = new URLSearchParams()
    if (address?.trim()) {
      params.set('address', address.trim())
    }
    if (tick?.trim()) {
      params.set('tick', normalizeKrc20Tick(tick))
    }
    if (limit > 0) {
      params.set('limit', String(Math.trunc(limit)))
    }

    const suffix = params.toString() ? `?${params.toString()}` : ''
    const data = await this.requestKrc20<KasplexListResponse<ApiKrc20OperationItem>>(`/krc20/oplist${suffix}`)

    return (data.result ?? [])
      .map(mapKrc20Operation)
      .filter((operation) => operation.tick.length > 0 && operation.hashRev.length > 0)
  }

  async getAddressInfo(address: string): Promise<AddressInfo> {
    const encodedAddress = normalizeAddressPath(address)
    const [balanceData, utxoData] = await Promise.all([
      this.request<ApiBalanceResponse>(`/addresses/${encodedAddress}/balance`),
      this.request<ApiUtxoResponse[]>(`/addresses/${encodedAddress}/utxos`),
    ])

    const utxos: UTXO[] = utxoData.map((utxo) => ({
      outpointHash: utxo.outpoint.transactionId,
      outpointIndex: utxo.outpoint.index,
      amount: toNumber(utxo.utxoEntry.amount),
      address: utxo.address,
      scriptPublicKey: utxo.utxoEntry.scriptPublicKey?.scriptPublicKey,
      isCoinbase: utxo.utxoEntry.isCoinbase,
    }))

    return {
      address: balanceData.address ?? address,
      balance: toNumber(balanceData.balance),
      utxos,
      transactionIds: [],
    }
  }

  async getAddressTransactionCount(address: string): Promise<number> {
    const encodedAddress = normalizeAddressPath(address)
    const data = await this.request<ApiAddressTransactionCountResponse>(
      `/addresses/${encodedAddress}/transactions-count`
    )

    return toNumber(data.total ?? data.transactionsCount ?? data.count)
  }

  async getTransactions(address: string, limit: number = 50): Promise<Transaction[]> {
    const encodedAddress = normalizeAddressPath(address)
    const data = await this.request<ApiTxModel[]>(
      `/addresses/${encodedAddress}/full-transactions?limit=${limit}&resolve_previous_outpoints=light`
    )
    return data.map(mapApiTransaction)
  }

  async getTransaction(txHash: string): Promise<Transaction> {
    const data = await this.request<ApiTxModel>(
      `/transactions/${encodeURIComponent(txHash)}?resolve_previous_outpoints=light`
    )
    return mapApiTransaction(data)
  }

  async getFeeEstimate(): Promise<FeeEstimate> {
    try {
      const data = await this.request<ApiFeeEstimateResponse>('/info/fee-estimate')
      const slowRate = toNumber(data.lowBuckets?.[0]?.feerate, 1)
      const normalRate = toNumber(data.normalBuckets?.[0]?.feerate ?? data.priorityBucket?.feerate, slowRate)
      const fastRate = toNumber(data.priorityBucket?.feerate, normalRate)

      const slowSeconds = toNumber(data.lowBuckets?.[0]?.estimatedSeconds, 0)
      const normalSeconds = toNumber(data.normalBuckets?.[0]?.estimatedSeconds ?? data.priorityBucket?.estimatedSeconds, 0)
      const fastSeconds = toNumber(data.priorityBucket?.estimatedSeconds, normalSeconds)

      const normal = Math.max(Math.round(normalRate * 1000), 2000)
      return {
        slow: Math.max(Math.round(slowRate * 1000), 1000),
        normal,
        fast: Math.max(Math.round(fastRate * 1000), 5000),
        slowRate,
        normalRate,
        fastRate,
        slowSeconds,
        normalSeconds,
        fastSeconds,
      }
    } catch {
      return {
        slow: 1000,
        normal: 2000,
        fast: 5000,
        slowRate: 1,
        normalRate: 2,
        fastRate: 5,
        slowSeconds: 1800,
        normalSeconds: 600,
        fastSeconds: 60,
      }
    }
  }

  async getTransactionMass(
    transaction: SignedTransactionPayload['transaction']
  ): Promise<{ mass: number; storageMass: number; computeMass: number }> {
    const data = await this.request<{
      mass: number | string
      storage_mass: number | string
      compute_mass: number | string
    }>('/transactions/mass', {
      method: 'POST',
      body: JSON.stringify(transaction),
    })

    return {
      mass: toNumber(data.mass, 1000),
      storageMass: toNumber(data.storage_mass, 0),
      computeMass: toNumber(data.compute_mass, 0),
    }
  }

  async submitTransaction(payload: SignedTransactionPayload): Promise<{ txId: string }> {
    const maxAttempts = 3
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await this.request<ApiSubmitTransactionResponse>('/transactions', {
          method: 'POST',
          body: JSON.stringify(payload),
        })

        if (result.error) {
          throw new Error(result.error)
        }

        if (!result.transactionId) {
          throw new Error('Transaction submission did not return a transaction id')
        }

        return { txId: result.transactionId }
      } catch (error) {
        const typedError =
          error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Transaction submission failed')
        lastError = typedError

        if (attempt < maxAttempts && isTransientBroadcastError(typedError.message)) {
          await delay(400 * Math.pow(2, attempt - 1))
          continue
        }

        throw typedError
      }
    }

    throw lastError ?? new Error('Transaction submission failed')
  }

  async broadcastTransaction(payload: SignedTransactionPayload): Promise<string> {
    const result = await this.submitTransaction(payload)
    return result.txId
  }
}

export const kaspaAPI = new KaspaAPI()
export default KaspaAPI
