import { mnemonicToSeedSync, generateMnemonic as bip39GenerateMnemonic, validateMnemonic as bip39ValidateMnemonic } from 'bip39'
import { sha256 } from '@noble/hashes/sha256'
import { secp256k1, schnorr } from '@noble/curves/secp256k1'
import {
  NETWORKS,
  type KaspaNetwork,
  type WalletAccount,
  type WalletContact,
  type WalletData,
  type WalletProfileSummary,
} from '../types'
import { isKaspaAddressForNetwork, publicKeyToKaspaAddress } from './address'

const ENCRYPTED_WALLET_STORAGE_KEY = 'kaspa_wallet_encrypted_v1'
const ENCRYPTED_WALLET_META_KEY = 'kaspa_wallet_meta_v1'
const LEGACY_WALLET_STORAGE_KEY = 'kaspa_wallet'
const LEGACY_ZUSTAND_STORAGE_KEY = 'kaspa-wallet-storage'
const PBKDF2_ITERATIONS = 250_000
const DEFAULT_AUTO_LOCK_MINUTES = 15

interface EncryptedWalletBlob {
  version: 1
  salt: string
  iv: string
  ciphertext: string
}

export interface WalletProfileVaultData {
  id: string
  name: string
  createdAt: number
  wallet: WalletData
  contacts: WalletContact[]
  selectedAccountId: string
  networkKey: keyof typeof NETWORKS
}

export interface WalletVaultData {
  version: 2
  wallets: WalletProfileVaultData[]
  activeWalletId: string
  autoLockMinutes: number
}

export interface WalletVaultMeta {
  wallets: WalletProfileSummary[]
  activeWalletId: string
}

interface LegacySingleWalletVaultData {
  wallet: WalletData
  contacts: WalletContact[]
  selectedAccountId: string
  networkKey: keyof typeof NETWORKS
}

export interface LegacyWalletSnapshot {
  contacts: WalletContact[]
  selectedAccountId: string
  networkKey: keyof typeof NETWORKS | null
}

function uint8ArrayToHex(arr: Uint8Array): string {
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function normalizeNetworkId(network: KaspaNetwork): keyof typeof NETWORKS {
  return (network.id in NETWORKS ? network.id : 'mainnet') as keyof typeof NETWORKS
}

function accountIndexToBytes(index: number): Uint8Array {
  const buffer = new Uint8Array(4)
  const view = new DataView(buffer.buffer)
  view.setUint32(0, index, false)
  return buffer
}

function textEncoder(): TextEncoder {
  return new TextEncoder()
}

function textDecoder(): TextDecoder {
  return new TextDecoder()
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

function assertWebCryptoAvailable(): void {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto is not available in this browser environment')
  }
}

function validatePasswordStrength(password: string): void {
  if (password.trim().length < 8) {
    throw new Error('Password must be at least 8 characters long')
  }
}

function normalizeAutoLockMinutes(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_AUTO_LOCK_MINUTES
  if (parsed > 24 * 60) return 24 * 60
  return Math.round(parsed)
}

async function deriveEncryptionKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = textEncoder()
  const baseKey = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  return globalThis.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  )
}

function parseEncryptedBlob(rawBlob: string): EncryptedWalletBlob {
  const parsed = JSON.parse(rawBlob) as Partial<EncryptedWalletBlob>
  if (
    parsed.version !== 1 ||
    typeof parsed.salt !== 'string' ||
    typeof parsed.iv !== 'string' ||
    typeof parsed.ciphertext !== 'string'
  ) {
    throw new Error('Invalid encrypted wallet payload')
  }
  return parsed as EncryptedWalletBlob
}

function createWalletId(seed?: string): string {
  return `wallet_${seed ?? `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`}`
}

function summarizeWallets(wallets: WalletProfileVaultData[]): WalletProfileSummary[] {
  return wallets.map((wallet) => ({
    id: wallet.id,
    name: wallet.name,
    createdAt: wallet.createdAt,
  }))
}

function normalizeWalletProfile(profile: unknown, index: number): WalletProfileVaultData {
  const parsed = profile as Partial<WalletProfileVaultData>
  if (!parsed || typeof parsed !== 'object' || !parsed.wallet) {
    throw new Error('Invalid wallet profile')
  }

  const wallet = parsed.wallet as WalletData
  if (!wallet || typeof wallet.mnemonic !== 'string' || !Array.isArray(wallet.accounts)) {
    throw new Error('Invalid wallet payload')
  }

  const id = typeof parsed.id === 'string' && parsed.id.trim() ? parsed.id : createWalletId(String(index + 1))
  const name =
    typeof parsed.name === 'string' && parsed.name.trim()
      ? parsed.name.trim()
      : `Wallet ${index + 1}`
  const createdAt =
    typeof parsed.createdAt === 'number' && Number.isFinite(parsed.createdAt) && parsed.createdAt > 0
      ? parsed.createdAt
      : wallet.createdAt || Date.now()
  const networkKeyCandidate = parsed.networkKey ?? wallet.network ?? 'mainnet'
  const networkKey = (networkKeyCandidate in NETWORKS ? networkKeyCandidate : 'mainnet') as keyof typeof NETWORKS
  const contacts = Array.isArray(parsed.contacts) ? parsed.contacts : []
  const selectedAccountId =
    typeof parsed.selectedAccountId === 'string' && parsed.selectedAccountId.trim()
      ? parsed.selectedAccountId
      : wallet.accounts[0]?.id ?? '0'

  return {
    id,
    name,
    createdAt,
    wallet,
    contacts,
    selectedAccountId,
    networkKey,
  }
}

function normalizeLegacySingleVault(vault: LegacySingleWalletVaultData): WalletVaultData {
  const wallet = vault.wallet
  const profile: WalletProfileVaultData = normalizeWalletProfile(
    {
      id: createWalletId(String(wallet.createdAt || Date.now())),
      name: 'Wallet 1',
      createdAt: wallet.createdAt || Date.now(),
      wallet,
      contacts: Array.isArray(vault.contacts) ? vault.contacts : [],
      selectedAccountId: typeof vault.selectedAccountId === 'string' ? vault.selectedAccountId : wallet.accounts[0]?.id ?? '0',
      networkKey: vault.networkKey ?? wallet.network ?? 'mainnet',
    },
    0
  )

  return {
    version: 2,
    wallets: [profile],
    activeWalletId: profile.id,
    autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES,
  }
}

function normalizeWalletVault(vault: unknown): WalletVaultData {
  const parsed = vault as Partial<WalletVaultData & LegacySingleWalletVaultData>

  if (Array.isArray(parsed.wallets) && parsed.wallets.length > 0) {
    const wallets = parsed.wallets.map((walletProfile, index) => normalizeWalletProfile(walletProfile, index))
    const activeWalletId =
      typeof parsed.activeWalletId === 'string' && wallets.some((wallet) => wallet.id === parsed.activeWalletId)
        ? parsed.activeWalletId
        : wallets[0].id

    return {
      version: 2,
      wallets,
      activeWalletId,
      autoLockMinutes: normalizeAutoLockMinutes(parsed.autoLockMinutes),
    }
  }

  if (parsed.wallet) {
    return normalizeLegacySingleVault(parsed as LegacySingleWalletVaultData)
  }

  throw new Error('Invalid wallet vault content')
}

function saveWalletMetaToStorage(vault: WalletVaultData): void {
  const meta: WalletVaultMeta = {
    wallets: summarizeWallets(vault.wallets),
    activeWalletId: vault.activeWalletId,
  }
  localStorage.setItem(ENCRYPTED_WALLET_META_KEY, JSON.stringify(meta))
}

export function loadEncryptedWalletMetaFromStorage(): WalletVaultMeta {
  const fallback: WalletVaultMeta = {
    wallets: [],
    activeWalletId: '',
  }

  const stored = localStorage.getItem(ENCRYPTED_WALLET_META_KEY)
  if (!stored) return fallback

  try {
    const parsed = JSON.parse(stored) as Partial<WalletVaultMeta>
    if (!Array.isArray(parsed.wallets)) return fallback
    const wallets = parsed.wallets
      .filter((wallet): wallet is WalletProfileSummary => {
        return (
          !!wallet &&
          typeof wallet.id === 'string' &&
          typeof wallet.name === 'string' &&
          typeof wallet.createdAt === 'number'
        )
      })
      .map((wallet) => ({
        id: wallet.id,
        name: wallet.name,
        createdAt: wallet.createdAt,
      }))

    const activeWalletId =
      typeof parsed.activeWalletId === 'string' && wallets.some((wallet) => wallet.id === parsed.activeWalletId)
        ? parsed.activeWalletId
        : wallets[0]?.id ?? ''

    return {
      wallets,
      activeWalletId,
    }
  } catch {
    return fallback
  }
}

export function generateMnemonic(): string {
  return bip39GenerateMnemonic(128)
}

export function validateMnemonic(mnemonic: string): boolean {
  return bip39ValidateMnemonic(mnemonic)
}

export function derivePrivateKeyFromMnemonic(mnemonic: string, accountIndex = 0): Uint8Array {
  if (!validateMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic')
  }

  if (!Number.isInteger(accountIndex) || accountIndex < 0) {
    throw new Error('Invalid account index')
  }

  const seed = mnemonicToSeedSync(mnemonic)
  const indexBytes = accountIndexToBytes(accountIndex)
  let privateKey = new Uint8Array(sha256(new Uint8Array([...seed.slice(0, 32), ...indexBytes])))

  while (!secp256k1.utils.isValidPrivateKey(privateKey)) {
    privateKey = new Uint8Array(sha256(privateKey))
  }

  return privateKey
}

function derivePublicKeyFromPrivateKey(privateKey: Uint8Array): Uint8Array {
  return new Uint8Array(schnorr.getPublicKey(privateKey))
}

function deriveKeyFromMnemonic(
  mnemonic: string,
  accountIndex = 0
): { privateKey: Uint8Array; publicKey: Uint8Array } {
  const privateKey = derivePrivateKeyFromMnemonic(mnemonic, accountIndex)
  const publicKey = derivePublicKeyFromPrivateKey(privateKey)
  return { privateKey, publicKey }
}

export function createAccountFromMnemonic(
  mnemonic: string,
  network: KaspaNetwork,
  accountIndex: number,
  name?: string
): WalletAccount {
  const { publicKey } = deriveKeyFromMnemonic(mnemonic, accountIndex)
  const address = publicKeyToKaspaAddress(publicKey, network.prefix)

  return {
    id: String(accountIndex),
    name: name && name.trim().length > 0 ? name.trim() : accountIndex === 0 ? 'Main Account' : `Account ${accountIndex + 1}`,
    derivationIndex: accountIndex,
    address,
    publicKey: uint8ArrayToHex(publicKey),
  }
}

export function createWallet(mnemonic: string, network: KaspaNetwork = NETWORKS.mainnet): WalletData {
  if (!validateMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic')
  }

  const account = createAccountFromMnemonic(mnemonic, network, 0, 'Main Account')

  return {
    mnemonic,
    accounts: [account],
    network: normalizeNetworkId(network),
    createdAt: Date.now(),
  }
}

export function getAddressFromMnemonic(
  mnemonic: string,
  network: KaspaNetwork = NETWORKS.mainnet,
  accountIndex = 0
): string {
  const { publicKey } = deriveKeyFromMnemonic(mnemonic, accountIndex)
  return publicKeyToKaspaAddress(publicKey, network.prefix)
}

export function createWalletProfileData(
  wallet: WalletData,
  name: string,
  networkKey: keyof typeof NETWORKS,
  contacts: WalletContact[] = [],
  selectedAccountId?: string
): WalletProfileVaultData {
  const normalizedName = name.trim() || 'Wallet'
  return normalizeWalletProfile(
    {
      id: createWalletId(),
      name: normalizedName,
      createdAt: Date.now(),
      wallet,
      contacts,
      selectedAccountId: selectedAccountId ?? wallet.accounts[0]?.id ?? '0',
      networkKey,
    },
    0
  )
}

export function hasEncryptedWalletInStorage(): boolean {
  return localStorage.getItem(ENCRYPTED_WALLET_STORAGE_KEY) !== null
}

export async function saveEncryptedWalletToStorage(vault: WalletVaultData, password: string): Promise<void> {
  assertWebCryptoAvailable()
  validatePasswordStrength(password)

  const normalizedVault = normalizeWalletVault(vault)
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16))
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveEncryptionKey(password, salt)
  const plaintext = textEncoder().encode(JSON.stringify(normalizedVault))
  const encrypted = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(plaintext)
  )

  const blob: EncryptedWalletBlob = {
    version: 1,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  }

  localStorage.setItem(ENCRYPTED_WALLET_STORAGE_KEY, JSON.stringify(blob))
  saveWalletMetaToStorage(normalizedVault)
}

export async function loadEncryptedWalletFromStorage(password: string): Promise<WalletVaultData> {
  assertWebCryptoAvailable()
  const rawBlob = localStorage.getItem(ENCRYPTED_WALLET_STORAGE_KEY)
  if (!rawBlob) {
    throw new Error('No encrypted wallet found')
  }

  try {
    const blob = parseEncryptedBlob(rawBlob)
    const key = await deriveEncryptionKey(password, base64ToBytes(blob.salt))
    const decrypted = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(base64ToBytes(blob.iv)) },
      key,
      toArrayBuffer(base64ToBytes(blob.ciphertext))
    )

    const decoded = textDecoder().decode(new Uint8Array(decrypted))
    const parsed = JSON.parse(decoded) as unknown
    return normalizeWalletVault(parsed)
  } catch {
    throw new Error('Invalid password or corrupted wallet data')
  }
}

export function clearEncryptedWalletFromStorage(): void {
  localStorage.removeItem(ENCRYPTED_WALLET_STORAGE_KEY)
  localStorage.removeItem(ENCRYPTED_WALLET_META_KEY)
}

export function loadLegacyWalletFromStorage(): WalletData | null {
  const stored = localStorage.getItem(LEGACY_WALLET_STORAGE_KEY)
  if (!stored) return null

  try {
    return JSON.parse(stored) as WalletData
  } catch {
    return null
  }
}

export function loadLegacyWalletSnapshot(): LegacyWalletSnapshot {
  const stored = localStorage.getItem(LEGACY_ZUSTAND_STORAGE_KEY)
  if (!stored) {
    return {
      contacts: [],
      selectedAccountId: '0',
      networkKey: null,
    }
  }

  try {
    const parsed = JSON.parse(stored) as {
      state?: {
        contacts?: WalletContact[]
        selectedAccountId?: string
        network?: { id?: string } | string
      }
    }
    const state = parsed.state ?? {}
    const contacts = Array.isArray(state.contacts) ? state.contacts : []
    const selectedAccountId = typeof state.selectedAccountId === 'string' ? state.selectedAccountId : '0'

    let networkKey: keyof typeof NETWORKS | null = null
    if (typeof state.network === 'string' && state.network in NETWORKS) {
      networkKey = state.network as keyof typeof NETWORKS
    } else if (
      typeof state.network === 'object' &&
      state.network !== null &&
      typeof state.network.id === 'string' &&
      state.network.id in NETWORKS
    ) {
      networkKey = state.network.id as keyof typeof NETWORKS
    }

    return { contacts, selectedAccountId, networkKey }
  } catch {
    return {
      contacts: [],
      selectedAccountId: '0',
      networkKey: null,
    }
  }
}

export function clearLegacyWalletStorage(): void {
  localStorage.removeItem(LEGACY_WALLET_STORAGE_KEY)
  localStorage.removeItem(LEGACY_ZUSTAND_STORAGE_KEY)
}

export function getDefaultAutoLockMinutes(): number {
  return DEFAULT_AUTO_LOCK_MINUTES
}

export function isValidKaspaAddress(address: string, network: KaspaNetwork): boolean {
  if (!address) return false
  return isKaspaAddressForNetwork(address, network)
}
