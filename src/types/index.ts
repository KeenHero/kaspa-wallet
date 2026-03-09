export interface KaspaNetwork {
  id: string
  name: string
  apiUrl: string
  krc20ApiUrl?: string
  explorerUrl: string
  prefix: string
  isTestnet: boolean
}

export const NETWORKS: Record<string, KaspaNetwork> = {
  mainnet: {
    id: 'mainnet',
    name: 'Mainnet',
    apiUrl: 'https://api.kaspa.org',
    krc20ApiUrl: 'https://api.kasplex.org/v1',
    explorerUrl: 'https://explorer.kaspa.org',
    prefix: 'kaspa',
    isTestnet: false,
  },
  testnet10: {
    id: 'testnet10',
    name: 'Testnet 10',
    apiUrl: 'https://api-tn10.kaspa.org',
    krc20ApiUrl: 'https://tn10api.kasplex.org/v1',
    explorerUrl: 'https://explorer-tn10.kaspa.org',
    prefix: 'kaspatest',
    isTestnet: true,
  },
  testnet11: {
    id: 'testnet11',
    name: 'Testnet 11',
    apiUrl: 'https://api-tn11.kaspa.org',
    explorerUrl: 'https://explorer-tn11.kaspa.org',
    prefix: 'kaspatest',
    isTestnet: true,
  },
}

export interface UTXO {
  outpointHash: string
  outpointIndex: number
  amount: number
  address: string
  scriptPublicKey?: string
  isCoinbase: boolean
  blockHash?: string
  timestamp?: number
}

export interface Transaction {
  hash: string
  blockHash?: string
  blockTime?: number
  timestamp: number
  inputs: TransactionInput[]
  outputs: TransactionOutput[]
  subnetworkId: string
  fee: number
  payload?: string
}

export interface TransactionInput {
  previousOutpointHash: string
  previousOutpointIndex: number
  signatureScript: string
  sequence: number
  utxoEntry?: UTXO
}

export interface TransactionOutput {
  amount: number
  scriptPubKey: string
  address?: string
  isSpent: boolean
}

export interface AddressInfo {
  address: string
  balance: number
  utxos: UTXO[]
  transactionIds: string[]
}

export interface WalletAccount {
  id: string
  name: string
  derivationIndex: number
  address: string
  publicKey: string
}

export interface WalletContact {
  id: string
  name: string
  address: string
  networkId: string
  createdAt: number
}

export interface WalletData {
  mnemonic: string
  accounts: WalletAccount[]
  network: keyof typeof NETWORKS
  createdAt: number
}

export interface WalletProfileSummary {
  id: string
  name: string
  createdAt: number
}

export interface SendTransactionRequest {
  toAddress: string
  amount: number
  fee?: number
}

export interface FeeEstimate {
  slow: number
  normal: number
  fast: number
  slowRate?: number
  normalRate?: number
  fastRate?: number
  slowSeconds?: number
  normalSeconds?: number
  fastSeconds?: number
}

export interface DagInfo {
  blockCount: number
  headerCount: number
  difficulty: number
  pastMedianTime: number
  virtualSelectedParentBlueScore: number
  tipHashes?: string[]
  networkName?: string
  sink?: string
}

export interface Krc20TokenBalance {
  tick: string
  contractAddress?: string
  balanceRaw: string
  lockedRaw: string
  decimals: number
  opScoreMod: string
}

export interface Krc20TokenInfo {
  tick: string
  contractAddress?: string
  name?: string
  maxRaw: string
  limitRaw: string
  premineRaw: string
  toAddress: string
  decimals: number
  mode: string
  mintedRaw: string
  burnedRaw: string
  state: string
  hashRev: string
  opScoreAdd?: string
  opScoreMod?: string
  createdAt?: number
  holderTotal?: number
  transferTotal?: number
  mintTotal?: number
}

export interface Krc20PortfolioToken extends Krc20TokenBalance {
  name?: string
  state?: string
  mode?: string
  mintedRaw?: string
  maxRaw?: string
  holderTotal?: number
  metadataLoaded: boolean
}

export interface Krc20Operation {
  protocol: string
  op: string
  tick: string
  contractAddress?: string
  amountRaw: string
  from?: string
  to?: string
  priceRaw?: string
  feeRaw?: string
  opScore: string
  hashRev: string
  txAccepted: boolean
  opAccepted: boolean
  opError?: string
  checkpoint?: string
  addedAt?: number
  updatedAt?: number
}
