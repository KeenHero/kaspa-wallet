import { NETWORKS, type KaspaNetwork, type UTXO, type Transaction, type AddressInfo, type FeeEstimate, type DagInfo } from '../types'
import { type SignedTransactionPayload } from './transaction'

const KASPA_DECIMALS = 100000000

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

function normalizeAddressPath(address: string): string {
  return encodeURIComponent(address)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

class KaspaAPI {
  private network: KaspaNetwork

  constructor(network: KaspaNetwork = NETWORKS.mainnet) {
    this.network = network
  }

  setNetwork(network: KaspaNetwork) {
    this.network = network
  }

  getNetwork(): KaspaNetwork {
    return this.network
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

  async getDagInfo(): Promise<DagInfo> {
    const data = await this.request<{
      blockCount: number | string
      headerCount: number | string
      difficulty: number | string
      pastMedianTime: number | string
      virtualDaaScore?: number | string
      blueScore?: number | string
      virtualSelectedParentBlueScore?: number | string
    }>('/info/blockdag')

    return {
      blockCount: toNumber(data.blockCount),
      headerCount: toNumber(data.headerCount),
      difficulty: toNumber(data.difficulty),
      pastMedianTime: toNumber(data.pastMedianTime),
      virtualSelectedParentBlueScore: toNumber(
        data.virtualSelectedParentBlueScore ?? data.virtualDaaScore ?? data.blueScore
      ),
    }
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
