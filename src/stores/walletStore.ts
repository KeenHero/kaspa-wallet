import { create } from 'zustand'
import {
  NETWORKS,
  type KaspaNetwork,
  type WalletAccount,
  type WalletContact,
  type WalletData,
  type WalletProfileSummary,
  type UTXO,
  type Transaction,
  type FeeEstimate,
} from '../types'
import { kaspaAPI } from '../lib/kaspa'
import { buildSignedTransaction } from '../lib/transaction'
import {
  createWallet,
  createWalletProfileData,
  createAccountFromMnemonic,
  loadLegacyWalletFromStorage,
  loadLegacyWalletSnapshot,
  saveEncryptedWalletToStorage,
  loadEncryptedWalletFromStorage,
  loadEncryptedWalletMetaFromStorage,
  clearEncryptedWalletFromStorage,
  clearLegacyWalletStorage,
  hasEncryptedWalletInStorage,
  generateMnemonic,
  derivePrivateKeyFromMnemonic,
  isValidKaspaAddress,
  getDefaultAutoLockMinutes,
  type WalletVaultData,
  type WalletProfileVaultData,
} from '../lib/wallet'

interface WalletState {
  isInitialized: boolean
  hasWallet: boolean
  isLocked: boolean
  needsMigration: boolean
  walletProfiles: WalletProfileSummary[]
  activeWalletId: string
  activeWalletName: string
  autoLockMinutes: number
  wallet: WalletData | null
  network: KaspaNetwork
  selectedAccountId: string
  contacts: WalletContact[]
  balance: number
  utxos: UTXO[]
  transactions: Transaction[]
  feeEstimate: FeeEstimate
  sendFeeEstimate: FeeEstimate | null
  isEstimatingFees: boolean
  isLoading: boolean
  error: string | null
  address: string

  initialize: () => Promise<void>
  createNewWallet: (password: string, walletName?: string) => Promise<void>
  importWallet: (mnemonic: string, password: string, walletName?: string) => Promise<void>
  createAdditionalWallet: (walletName?: string) => Promise<void>
  importAdditionalWallet: (mnemonic: string, walletName?: string) => Promise<void>
  createWalletFromLocked: (password: string, walletName?: string, mnemonic?: string) => Promise<void>
  revealWalletMnemonic: (walletId: string, password: string) => Promise<string>
  unlockWallet: (password: string, walletId?: string) => Promise<void>
  secureLegacyWallet: (password: string) => Promise<void>
  lockWallet: () => void
  logout: () => void
  deleteWallet: (walletId?: string) => Promise<void>
  switchWallet: (walletId: string) => Promise<void>
  renameWallet: (walletId: string, name: string) => void
  setAutoLockMinutes: (minutes: number) => void
  setNetwork: (networkKey: string) => void
  createAccount: () => void
  switchAccount: (accountId: string) => void
  renameAccount: (accountId: string, name: string) => void
  addContact: (name: string, address: string) => boolean
  removeContact: (contactId: string) => void
  fetchBalance: () => Promise<void>
  fetchTransactions: () => Promise<void>
  fetchFeeEstimate: () => Promise<void>
  estimateSendFees: (toAddress: string, amount: number) => Promise<void>
  sendTransaction: (toAddress: string, amount: number, fee: number) => Promise<string>
  clearError: () => void
}

const api = kaspaAPI
let sessionPassword: string | null = null
let sessionVault: WalletVaultData | null = null

const DEFAULT_FEE_ESTIMATE: FeeEstimate = {
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

function resolveNetwork(networkKey?: string): KaspaNetwork {
  if (!networkKey) return NETWORKS.mainnet
  return NETWORKS[networkKey] ?? NETWORKS.mainnet
}

function sanitizeWalletName(name: string | undefined, fallback: string): string {
  if (!name) return fallback
  const trimmed = name.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

function clampAutoLockMinutes(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes < 0) return getDefaultAutoLockMinutes()
  if (minutes > 24 * 60) return 24 * 60
  return Math.round(minutes)
}

function getActiveAccount(wallet: WalletData | null, selectedAccountId: string): WalletAccount | null {
  if (!wallet || wallet.accounts.length === 0) return null
  return wallet.accounts.find((account) => account.id === selectedAccountId) ?? wallet.accounts[0]
}

function normalizeWalletData(wallet: WalletData, network: KaspaNetwork): WalletData {
  const normalizedAccounts = wallet.accounts.map((account, index) => {
    const inferredIndex =
      typeof account.derivationIndex === 'number' && account.derivationIndex >= 0
        ? account.derivationIndex
        : Number.isFinite(Number(account.id))
          ? Number(account.id)
          : index

    const canonical = createAccountFromMnemonic(wallet.mnemonic, network, inferredIndex, account.name)
    return {
      ...canonical,
      name: account.name?.trim() ? account.name.trim() : canonical.name,
    }
  })

  if (normalizedAccounts.length === 0) {
    normalizedAccounts.push(createAccountFromMnemonic(wallet.mnemonic, network, 0, 'Main Account'))
  }

  return {
    ...wallet,
    accounts: normalizedAccounts,
    network: network.id as keyof typeof NETWORKS,
  }
}

function normalizeContacts(rawContacts: WalletContact[]): WalletContact[] {
  return rawContacts
    .filter((contact) => !!contact && typeof contact.address === 'string' && typeof contact.name === 'string')
    .map((contact, index) => ({
      id: contact.id || `contact_${index}`,
      name: contact.name.trim() || `Contact ${index + 1}`,
      address: contact.address.trim().toLowerCase(),
      networkId: contact.networkId || 'mainnet',
      createdAt: contact.createdAt || Date.now(),
    }))
}

function normalizeTransactionError(message: string): string {
  const normalized = message.toLowerCase()

  if (normalized.includes('websocket disconnected') || normalized.includes('connection closed')) {
    return 'Broadcast temporarily failed because the public Kaspa node disconnected. Please try again in a few seconds.'
  }

  if (normalized.includes('service unavailable') || normalized.includes('503')) {
    return 'The selected network API is temporarily unavailable. Please retry shortly.'
  }

  if (normalized.includes('orphan is disallowed')) {
    return 'Transaction was rejected as orphan. Refresh balance/UTXOs and try again.'
  }

  if (normalized.includes('under the required amount')) {
    return 'Transaction fee was too low for current network conditions. Please retry; the wallet now auto-adjusts fee.'
  }

  return message
}

function parseRequiredFeeFromError(message: string): number | null {
  const match = message.match(/required amount of\s+(\d+)/i)
  if (!match) return null

  const requiredFee = Number(match[1])
  return Number.isFinite(requiredFee) ? requiredFee : null
}

function selectUtxos(utxos: UTXO[], targetAmount: number): { selected: UTXO[]; total: number } {
  const selected: UTXO[] = []
  let total = 0

  const sorted = [...utxos].sort((a, b) => b.amount - a.amount)
  for (const utxo of sorted) {
    selected.push(utxo)
    total += utxo.amount

    if (total >= targetAmount) {
      break
    }
  }

  return { selected, total }
}

function computeFeeFromRate(mass: number, rate: number, minFee: number): number {
  const calculated = Math.ceil(mass * rate)
  return Math.max(calculated, minFee)
}

function summarizeProfiles(vault: WalletVaultData): WalletProfileSummary[] {
  return vault.wallets.map((profile) => ({
    id: profile.id,
    name: profile.name,
    createdAt: profile.createdAt,
  }))
}

function getProfileById(vault: WalletVaultData, walletId: string): WalletProfileVaultData | null {
  return vault.wallets.find((walletProfile) => walletProfile.id === walletId) ?? null
}

function getActiveProfile(vault: WalletVaultData): WalletProfileVaultData | null {
  return getProfileById(vault, vault.activeWalletId) ?? vault.wallets[0] ?? null
}

function requireUnlockedVault(): WalletVaultData {
  if (!sessionVault || !sessionPassword) {
    throw new Error('Wallet is locked')
  }
  return sessionVault
}

async function persistSessionVault(): Promise<void> {
  if (!sessionVault || !sessionPassword) {
    throw new Error('Wallet is locked')
  }
  await saveEncryptedWalletToStorage(sessionVault, sessionPassword)
}

function applyActiveWalletToState(set: (partial: Partial<WalletState>) => void, vault: WalletVaultData): WalletProfileVaultData {
  const activeProfile = getActiveProfile(vault)
  if (!activeProfile) {
    throw new Error('No wallet profile available')
  }

  const activeIndex = vault.wallets.findIndex((walletProfile) => walletProfile.id === activeProfile.id)
  activeProfile.name = sanitizeWalletName(activeProfile.name, `Wallet ${activeIndex + 1}`)

  const network = resolveNetwork(activeProfile.networkKey ?? activeProfile.wallet.network)
  const normalizedWallet = normalizeWalletData(activeProfile.wallet, network)
  const normalizedContacts = normalizeContacts(activeProfile.contacts)
  const selectedAccountId = normalizedWallet.accounts.some((account) => account.id === activeProfile.selectedAccountId)
    ? activeProfile.selectedAccountId
    : normalizedWallet.accounts[0].id
  const activeAccount = getActiveAccount(normalizedWallet, selectedAccountId)

  activeProfile.wallet = normalizedWallet
  activeProfile.contacts = normalizedContacts
  activeProfile.selectedAccountId = selectedAccountId
  activeProfile.networkKey = network.id as keyof typeof NETWORKS
  vault.activeWalletId = activeProfile.id
  vault.autoLockMinutes = clampAutoLockMinutes(vault.autoLockMinutes)

  api.setNetwork(network)

  set({
    hasWallet: true,
    isLocked: false,
    needsMigration: false,
    walletProfiles: summarizeProfiles(vault),
    activeWalletId: activeProfile.id,
    activeWalletName: activeProfile.name,
    autoLockMinutes: vault.autoLockMinutes,
    wallet: normalizedWallet,
    network,
    selectedAccountId,
    contacts: normalizedContacts,
    address: activeAccount?.address ?? '',
    sendFeeEstimate: null,
    error: null,
  })

  return activeProfile
}

function clearSessionReferences(): void {
  sessionPassword = null
  sessionVault = null
}

export const useWalletStore = create<WalletState>((set, get) => ({
  isInitialized: false,
  hasWallet: false,
  isLocked: false,
  needsMigration: false,
  walletProfiles: [],
  activeWalletId: '',
  activeWalletName: '',
  autoLockMinutes: getDefaultAutoLockMinutes(),
  wallet: null,
  network: NETWORKS.mainnet,
  selectedAccountId: '0',
  contacts: [],
  balance: 0,
  utxos: [],
  transactions: [],
  feeEstimate: DEFAULT_FEE_ESTIMATE,
  sendFeeEstimate: null,
  isEstimatingFees: false,
  isLoading: false,
  error: null,
  address: '',

  initialize: async () => {
    clearSessionReferences()

    try {
      if (hasEncryptedWalletInStorage()) {
        clearLegacyWalletStorage()
        const meta = loadEncryptedWalletMetaFromStorage()
        const activeWalletName = meta.wallets.find((walletProfile) => walletProfile.id === meta.activeWalletId)?.name ?? meta.wallets[0]?.name ?? ''

        api.setNetwork(NETWORKS.mainnet)
        set({
          isInitialized: true,
          hasWallet: true,
          isLocked: true,
          needsMigration: false,
          walletProfiles: meta.wallets,
          activeWalletId: meta.activeWalletId,
          activeWalletName,
          autoLockMinutes: getDefaultAutoLockMinutes(),
          wallet: null,
          selectedAccountId: '0',
          contacts: [],
          balance: 0,
          utxos: [],
          transactions: [],
          address: '',
          sendFeeEstimate: null,
          isEstimatingFees: false,
          error: null,
        })
        return
      }

      const legacyWallet = loadLegacyWalletFromStorage()
      if (legacyWallet) {
        const legacySnapshot = loadLegacyWalletSnapshot()
        const network = resolveNetwork(legacySnapshot.networkKey ?? legacyWallet.network)
        const normalizedWallet = normalizeWalletData(legacyWallet, network)
        const contacts = normalizeContacts(legacySnapshot.contacts)
        const selectedAccountId = normalizedWallet.accounts.some(
          (account) => account.id === legacySnapshot.selectedAccountId
        )
          ? legacySnapshot.selectedAccountId
          : normalizedWallet.accounts[0].id

        const legacyProfile = createWalletProfileData(
          normalizedWallet,
          'Wallet 1',
          network.id as keyof typeof NETWORKS,
          contacts,
          selectedAccountId
        )
        const legacyVault: WalletVaultData = {
          version: 2,
          wallets: [legacyProfile],
          activeWalletId: legacyProfile.id,
          autoLockMinutes: getDefaultAutoLockMinutes(),
        }
        sessionVault = legacyVault
        const activeAccount = getActiveAccount(legacyProfile.wallet, legacyProfile.selectedAccountId)

        api.setNetwork(network)
        set({
          isInitialized: true,
          hasWallet: true,
          isLocked: false,
          needsMigration: true,
          walletProfiles: summarizeProfiles(legacyVault),
          activeWalletId: legacyProfile.id,
          activeWalletName: legacyProfile.name,
          autoLockMinutes: legacyVault.autoLockMinutes,
          wallet: legacyProfile.wallet,
          network,
          selectedAccountId: legacyProfile.selectedAccountId,
          contacts: legacyProfile.contacts,
          address: activeAccount?.address ?? '',
          error: 'Set a password to encrypt and secure your existing wallet.',
        })

        void get().fetchBalance()
        void get().fetchTransactions()
        void get().fetchFeeEstimate()
        return
      }

      api.setNetwork(NETWORKS.mainnet)
      set({
        isInitialized: true,
        hasWallet: false,
        isLocked: false,
        needsMigration: false,
        walletProfiles: [],
        activeWalletId: '',
        activeWalletName: '',
        autoLockMinutes: getDefaultAutoLockMinutes(),
        wallet: null,
        contacts: [],
        selectedAccountId: '0',
        address: '',
        error: null,
      })
    } catch (error) {
      set({
        isInitialized: true,
        error: error instanceof Error ? error.message : 'Failed to initialize wallet',
      })
    }
  },

  createNewWallet: async (password: string, walletName?: string) => {
    try {
      const network = get().network
      const mnemonic = generateMnemonic()
      const wallet = createWallet(mnemonic, network)
      const profile = createWalletProfileData(
        wallet,
        sanitizeWalletName(walletName, 'Wallet 1'),
        network.id as keyof typeof NETWORKS
      )
      const vault: WalletVaultData = {
        version: 2,
        wallets: [profile],
        activeWalletId: profile.id,
        autoLockMinutes: getDefaultAutoLockMinutes(),
      }

      await saveEncryptedWalletToStorage(vault, password)
      clearLegacyWalletStorage()
      sessionPassword = password
      sessionVault = vault
      applyActiveWalletToState(set, vault)
      set({
        balance: 0,
        utxos: [],
        transactions: [],
        sendFeeEstimate: null,
        isEstimatingFees: false,
        error: null,
      })

      await get().fetchBalance()
      await get().fetchTransactions()
      await get().fetchFeeEstimate()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create wallet'
      set({ error: message })
      throw new Error(message)
    }
  },

  importWallet: async (mnemonic: string, password: string, walletName?: string) => {
    try {
      const network = get().network
      const wallet = createWallet(mnemonic, network)
      const profile = createWalletProfileData(
        wallet,
        sanitizeWalletName(walletName, 'Wallet 1'),
        network.id as keyof typeof NETWORKS
      )
      const vault: WalletVaultData = {
        version: 2,
        wallets: [profile],
        activeWalletId: profile.id,
        autoLockMinutes: getDefaultAutoLockMinutes(),
      }

      await saveEncryptedWalletToStorage(vault, password)
      clearLegacyWalletStorage()
      sessionPassword = password
      sessionVault = vault
      applyActiveWalletToState(set, vault)
      set({
        balance: 0,
        utxos: [],
        transactions: [],
        sendFeeEstimate: null,
        isEstimatingFees: false,
        error: null,
      })

      await get().fetchBalance()
      await get().fetchTransactions()
      await get().fetchFeeEstimate()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid mnemonic or network mismatch'
      set({ error: message })
      throw new Error(message)
    }
  },

  createAdditionalWallet: async (walletName?: string) => {
    try {
      const vault = requireUnlockedVault()
      const network = get().network
      const mnemonic = generateMnemonic()
      const wallet = createWallet(mnemonic, network)
      const nextName = sanitizeWalletName(walletName, `Wallet ${vault.wallets.length + 1}`)
      const profile = createWalletProfileData(wallet, nextName, network.id as keyof typeof NETWORKS)

      vault.wallets.push(profile)
      vault.activeWalletId = profile.id
      sessionVault = vault

      await persistSessionVault()
      applyActiveWalletToState(set, vault)
      set({
        balance: 0,
        utxos: [],
        transactions: [],
        sendFeeEstimate: null,
        isEstimatingFees: false,
        error: null,
      })

      await get().fetchBalance()
      await get().fetchTransactions()
      await get().fetchFeeEstimate()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create wallet'
      set({ error: message })
      throw new Error(message)
    }
  },

  importAdditionalWallet: async (mnemonic: string, walletName?: string) => {
    try {
      const vault = requireUnlockedVault()
      const network = get().network
      const wallet = createWallet(mnemonic, network)
      const nextName = sanitizeWalletName(walletName, `Wallet ${vault.wallets.length + 1}`)
      const profile = createWalletProfileData(wallet, nextName, network.id as keyof typeof NETWORKS)

      vault.wallets.push(profile)
      vault.activeWalletId = profile.id
      sessionVault = vault

      await persistSessionVault()
      applyActiveWalletToState(set, vault)
      set({
        balance: 0,
        utxos: [],
        transactions: [],
        sendFeeEstimate: null,
        isEstimatingFees: false,
        error: null,
      })

      await get().fetchBalance()
      await get().fetchTransactions()
      await get().fetchFeeEstimate()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid mnemonic or network mismatch'
      set({ error: message })
      throw new Error(message)
    }
  },

  createWalletFromLocked: async (password: string, walletName?: string, mnemonic?: string) => {
    if (!password.trim()) {
      const message = 'Password is required'
      set({ error: message })
      throw new Error(message)
    }

    set({ isLoading: true, error: null })
    try {
      const decryptedVault = await loadEncryptedWalletFromStorage(password)
      const referenceProfile = getActiveProfile(decryptedVault) ?? decryptedVault.wallets[0]
      if (!referenceProfile) {
        throw new Error('No wallet profile found')
      }

      const baseNetwork = resolveNetwork(referenceProfile.networkKey ?? referenceProfile.wallet.network)
      const mnemonicToUse = mnemonic?.trim() || generateMnemonic()
      const wallet = createWallet(mnemonicToUse, baseNetwork)
      const nextName = sanitizeWalletName(walletName, `Wallet ${decryptedVault.wallets.length + 1}`)
      const profile = createWalletProfileData(wallet, nextName, baseNetwork.id as keyof typeof NETWORKS)

      decryptedVault.wallets.push(profile)
      decryptedVault.activeWalletId = profile.id
      sessionPassword = password
      sessionVault = decryptedVault

      await persistSessionVault()
      applyActiveWalletToState(set, decryptedVault)
      set({
        isLoading: false,
        balance: 0,
        utxos: [],
        transactions: [],
        sendFeeEstimate: null,
      })

      await get().fetchBalance()
      await get().fetchTransactions()
      await get().fetchFeeEstimate()
    } catch (error) {
      clearSessionReferences()
      const message = error instanceof Error ? error.message : 'Failed to create wallet'
      set({ isLoading: false, error: message })
      throw new Error(message)
    }
  },

  unlockWallet: async (password: string, walletId?: string) => {
    if (!password.trim()) {
      const message = 'Password is required'
      set({ error: message })
      throw new Error(message)
    }

    set({ isLoading: true, error: null })
    try {
      const decryptedVault = await loadEncryptedWalletFromStorage(password)
      sessionPassword = password
      sessionVault = decryptedVault

      if (walletId && getProfileById(decryptedVault, walletId)) {
        decryptedVault.activeWalletId = walletId
      }

      applyActiveWalletToState(set, decryptedVault)
      set({
        isLoading: false,
        balance: 0,
        utxos: [],
        transactions: [],
      })

      await persistSessionVault()
      await get().fetchBalance()
      await get().fetchTransactions()
      await get().fetchFeeEstimate()
    } catch {
      clearSessionReferences()
      const message = 'Invalid password or encrypted wallet data'
      set({ isLoading: false, error: message })
      throw new Error(message)
    }
  },

  secureLegacyWallet: async (password: string) => {
    const { needsMigration } = get()
    if (!needsMigration || !sessionVault) return

    set({ isLoading: true, error: null })
    try {
      await saveEncryptedWalletToStorage(sessionVault, password)
      clearLegacyWalletStorage()
      sessionPassword = password
      set({
        needsMigration: false,
        isLoading: false,
        error: null,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to secure wallet'
      set({
        isLoading: false,
        error: message,
      })
      throw new Error(message)
    }
  },

  lockWallet: () => {
    if (get().needsMigration) {
      set({
        error: 'Set a password and encrypt this wallet before locking or logging out.',
      })
      return
    }

    const { walletProfiles, activeWalletId, activeWalletName, autoLockMinutes } = get()
    clearSessionReferences()
    api.setNetwork(NETWORKS.mainnet)

    set({
      hasWallet: walletProfiles.length > 0 || hasEncryptedWalletInStorage(),
      isLocked: true,
      walletProfiles,
      activeWalletId,
      activeWalletName,
      autoLockMinutes,
      wallet: null,
      selectedAccountId: '0',
      contacts: [],
      balance: 0,
      utxos: [],
      transactions: [],
      address: '',
      sendFeeEstimate: null,
      isEstimatingFees: false,
      isLoading: false,
      error: null,
    })
  },

  logout: () => {
    get().lockWallet()
  },

  deleteWallet: async (walletId?: string) => {
    try {
      const vault = requireUnlockedVault()
      const targetWalletId = walletId ?? vault.activeWalletId
      const index = vault.wallets.findIndex((walletProfile) => walletProfile.id === targetWalletId)
      if (index < 0) return

      vault.wallets.splice(index, 1)
      if (vault.wallets.length === 0) {
        clearSessionReferences()
        clearEncryptedWalletFromStorage()
        clearLegacyWalletStorage()
        api.setNetwork(NETWORKS.mainnet)
        set({
          isInitialized: true,
          hasWallet: false,
          isLocked: false,
          needsMigration: false,
          walletProfiles: [],
          activeWalletId: '',
          activeWalletName: '',
          autoLockMinutes: getDefaultAutoLockMinutes(),
          wallet: null,
          network: NETWORKS.mainnet,
          selectedAccountId: '0',
          contacts: [],
          balance: 0,
          utxos: [],
          transactions: [],
          feeEstimate: DEFAULT_FEE_ESTIMATE,
          sendFeeEstimate: null,
          isEstimatingFees: false,
          isLoading: false,
          error: null,
          address: '',
        })
        return
      }

      if (!getProfileById(vault, vault.activeWalletId)) {
        vault.activeWalletId = vault.wallets[Math.max(0, index - 1)].id
      }

      sessionVault = vault
      await persistSessionVault()
      applyActiveWalletToState(set, vault)
      set({
        balance: 0,
        utxos: [],
        transactions: [],
      })
      await get().fetchBalance()
      await get().fetchTransactions()
      await get().fetchFeeEstimate()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete wallet'
      set({ error: message })
      throw new Error(message)
    }
  },

  switchWallet: async (walletId: string) => {
    try {
      const vault = requireUnlockedVault()
      const nextProfile = getProfileById(vault, walletId)
      if (!nextProfile) return

      vault.activeWalletId = walletId
      sessionVault = vault
      applyActiveWalletToState(set, vault)
      set({
        balance: 0,
        utxos: [],
        transactions: [],
      })

      await persistSessionVault()
      await get().fetchBalance()
      await get().fetchTransactions()
      await get().fetchFeeEstimate()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to switch wallet'
      set({ error: message })
      throw new Error(message)
    }
  },

  renameWallet: (walletId: string, name: string) => {
    const trimmedName = name.trim()
    if (!trimmedName) return

    try {
      const vault = requireUnlockedVault()
      const profile = getProfileById(vault, walletId)
      if (!profile) return

      profile.name = trimmedName
      sessionVault = vault
      set({
        walletProfiles: summarizeProfiles(vault),
        activeWalletName: vault.activeWalletId === walletId ? trimmedName : get().activeWalletName,
      })

      void persistSessionVault().catch(() => {
        set({ error: 'Failed to persist encrypted wallet changes' })
      })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to rename wallet' })
    }
  },

  setAutoLockMinutes: (minutes: number) => {
    const normalizedMinutes = clampAutoLockMinutes(minutes)
    set({
      autoLockMinutes: normalizedMinutes,
    })

    try {
      const vault = requireUnlockedVault()
      vault.autoLockMinutes = normalizedMinutes
      sessionVault = vault
      void persistSessionVault().catch(() => {
        set({ error: 'Failed to persist encrypted wallet changes' })
      })
    } catch {
      // Ignore while locked.
    }
  },

  setNetwork: (networkKey: string) => {
    const network = resolveNetwork(networkKey)
    api.setNetwork(network)

    const { wallet, selectedAccountId } = get()
    if (wallet) {
      const updatedWallet: WalletData = {
        ...wallet,
        network: network.id as keyof typeof NETWORKS,
        accounts: wallet.accounts.map((account, index) =>
          createAccountFromMnemonic(
            wallet.mnemonic,
            network,
            typeof account.derivationIndex === 'number' ? account.derivationIndex : index,
            account.name
          )
        ),
      }

      const activeAccount = getActiveAccount(updatedWallet, selectedAccountId) ?? updatedWallet.accounts[0]
      const nextSelectedAccountId = activeAccount.id

      set({
        network,
        wallet: updatedWallet,
        selectedAccountId: nextSelectedAccountId,
        address: activeAccount.address,
        sendFeeEstimate: null,
        error: null,
      })

      try {
        const vault = requireUnlockedVault()
        const profile = getActiveProfile(vault)
        if (!profile) {
          throw new Error('No wallet profile selected')
        }
        profile.wallet = updatedWallet
        profile.selectedAccountId = nextSelectedAccountId
        profile.networkKey = network.id as keyof typeof NETWORKS
        sessionVault = vault
        void persistSessionVault().catch(() => {
          set({ error: 'Failed to persist encrypted wallet changes' })
        })
      } catch {
        // Ignore persistence while locked.
      }

      void get().fetchBalance()
      void get().fetchTransactions()
      void get().fetchFeeEstimate()
    } else {
      set({ network, sendFeeEstimate: null })
    }
  },

  createAccount: () => {
    const { wallet, network } = get()
    if (!wallet) {
      set({ error: 'Wallet not initialized' })
      return
    }

    const nextIndex =
      wallet.accounts.length === 0
        ? 0
        : Math.max(...wallet.accounts.map((account, index) => account.derivationIndex ?? index)) + 1
    const accountName = nextIndex === 0 ? 'Main Account' : `Account ${nextIndex + 1}`
    const newAccount = createAccountFromMnemonic(wallet.mnemonic, network, nextIndex, accountName)
    const updatedWallet: WalletData = {
      ...wallet,
      accounts: [...wallet.accounts, newAccount],
    }

    set({
      wallet: updatedWallet,
      selectedAccountId: newAccount.id,
      address: newAccount.address,
      sendFeeEstimate: null,
      error: null,
    })

    try {
      const vault = requireUnlockedVault()
      const profile = getActiveProfile(vault)
      if (!profile) throw new Error('No wallet profile selected')
      profile.wallet = updatedWallet
      profile.selectedAccountId = newAccount.id
      sessionVault = vault
      void persistSessionVault().catch(() => {
        set({ error: 'Failed to persist encrypted wallet changes' })
      })
    } catch {
      // Ignore persistence while locked.
    }

    void get().fetchBalance()
    void get().fetchTransactions()
    void get().fetchFeeEstimate()
  },

  switchAccount: (accountId: string) => {
    const { wallet } = get()
    if (!wallet) return

    const account = wallet.accounts.find((walletAccount) => walletAccount.id === accountId)
    if (!account) return

    set({
      selectedAccountId: account.id,
      address: account.address,
      sendFeeEstimate: null,
      error: null,
    })

    try {
      const vault = requireUnlockedVault()
      const profile = getActiveProfile(vault)
      if (!profile) throw new Error('No wallet profile selected')
      profile.selectedAccountId = account.id
      sessionVault = vault
      void persistSessionVault().catch(() => {
        set({ error: 'Failed to persist encrypted wallet changes' })
      })
    } catch {
      // Ignore persistence while locked.
    }

    void get().fetchBalance()
    void get().fetchTransactions()
    void get().fetchFeeEstimate()
  },

  renameAccount: (accountId: string, name: string) => {
    const { wallet } = get()
    if (!wallet) return

    const trimmedName = name.trim()
    if (!trimmedName) return

    const updatedWallet: WalletData = {
      ...wallet,
      accounts: wallet.accounts.map((account) =>
        account.id === accountId ? { ...account, name: trimmedName } : account
      ),
    }

    set({ wallet: updatedWallet })

    try {
      const vault = requireUnlockedVault()
      const profile = getActiveProfile(vault)
      if (!profile) throw new Error('No wallet profile selected')
      profile.wallet = updatedWallet
      sessionVault = vault
      void persistSessionVault().catch(() => {
        set({ error: 'Failed to persist encrypted wallet changes' })
      })
    } catch {
      // Ignore persistence while locked.
    }
  },

  addContact: (name: string, address: string) => {
    const { contacts, network } = get()
    const normalizedName = name.trim()
    const normalizedAddress = address.trim().toLowerCase()

    if (!normalizedName || !normalizedAddress) {
      set({ error: 'Contact name and address are required' })
      return false
    }

    if (!isValidKaspaAddress(normalizedAddress, network)) {
      set({ error: `Invalid ${network.name} address` })
      return false
    }

    const alreadyExists = contacts.some(
      (contact) =>
        contact.networkId === network.id && contact.address.toLowerCase() === normalizedAddress
    )
    if (alreadyExists) {
      set({ error: 'Address already exists in contacts' })
      return false
    }

    const newContact: WalletContact = {
      id: `contact_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: normalizedName,
      address: normalizedAddress,
      networkId: network.id,
      createdAt: Date.now(),
    }

    const nextContacts = [...contacts, newContact]
    set({
      contacts: nextContacts,
      error: null,
    })

    try {
      const vault = requireUnlockedVault()
      const profile = getActiveProfile(vault)
      if (!profile) throw new Error('No wallet profile selected')
      profile.contacts = nextContacts
      sessionVault = vault
      void persistSessionVault().catch(() => {
        set({ error: 'Failed to persist encrypted wallet changes' })
      })
    } catch {
      // Ignore persistence while locked.
    }

    return true
  },

  removeContact: (contactId: string) => {
    const { contacts } = get()
    const nextContacts = contacts.filter((contact) => contact.id !== contactId)
    set({
      contacts: nextContacts,
    })

    try {
      const vault = requireUnlockedVault()
      const profile = getActiveProfile(vault)
      if (!profile) throw new Error('No wallet profile selected')
      profile.contacts = nextContacts
      sessionVault = vault
      void persistSessionVault().catch(() => {
        set({ error: 'Failed to persist encrypted wallet changes' })
      })
    } catch {
      // Ignore persistence while locked.
    }
  },

  fetchBalance: async () => {
    const { address } = get()
    if (!address) return

    set({ isLoading: true })
    try {
      const info = await api.getAddressInfo(address)
      set({
        balance: info.balance,
        utxos: info.utxos,
        isLoading: false,
      })
    } catch (error) {
      console.error('Failed to fetch balance:', error)
      set({
        isLoading: false,
        error: 'Failed to fetch balance',
      })
    }
  },

  fetchTransactions: async () => {
    const { address } = get()
    if (!address) return

    try {
      const txs = await api.getTransactions(address, 50)
      set({ transactions: txs })
    } catch (error) {
      console.error('Failed to fetch transactions:', error)
    }
  },

  fetchFeeEstimate: async () => {
    try {
      const fees = await api.getFeeEstimate()
      set({ feeEstimate: fees, sendFeeEstimate: null })
    } catch (error) {
      console.error('Failed to fetch fee estimate:', error)
    }
  },

  estimateSendFees: async (toAddress: string, amount: number) => {
    const trimmedAddress = toAddress.trim()
    const { wallet, network, utxos, address, selectedAccountId, feeEstimate } = get()

    if (!wallet || !trimmedAddress || amount <= 0 || utxos.length === 0) {
      set({ sendFeeEstimate: null, isEstimatingFees: false })
      return
    }

    if (!isValidKaspaAddress(trimmedAddress, network)) {
      set({ sendFeeEstimate: null, isEstimatingFees: false })
      return
    }

    const activeAccount = getActiveAccount(wallet, selectedAccountId)
    if (!activeAccount) {
      set({ sendFeeEstimate: null, isEstimatingFees: false })
      return
    }

    try {
      set({ isEstimatingFees: true })
      const normalBaselineFee = Math.max(feeEstimate.normal, 1000)
      const { selected, total } = selectUtxos(utxos, amount + normalBaselineFee)
      if (selected.length === 0 || total < amount + normalBaselineFee) {
        set({ sendFeeEstimate: null, isEstimatingFees: false })
        return
      }

      const privateKey = derivePrivateKeyFromMnemonic(wallet.mnemonic, activeAccount.derivationIndex)
      const massProbePayload = buildSignedTransaction({
        inputs: selected.map((utxo) => ({
          txId: utxo.outpointHash,
          vOut: utxo.outpointIndex,
          address: utxo.address,
          amount: utxo.amount,
        })),
        outputs: [
          {
            address: trimmedAddress,
            amount,
          },
        ],
        changeAddress: address,
        fee: normalBaselineFee,
        privateKey,
        addressPrefixes: [network.prefix],
      })

      const { mass } = await api.getTransactionMass(massProbePayload.transaction)
      const slowRate = feeEstimate.slowRate ?? 1
      const normalRate = feeEstimate.normalRate ?? slowRate
      const fastRate = feeEstimate.fastRate ?? Math.max(normalRate, slowRate)

      const slow = computeFeeFromRate(mass, slowRate, 1000)
      const normal = Math.max(computeFeeFromRate(mass, normalRate, 1000), slow)
      const fast = Math.max(computeFeeFromRate(mass, fastRate, 1000), normal)

      set({
        sendFeeEstimate: {
          ...feeEstimate,
          slow,
          normal,
          fast,
        },
        isEstimatingFees: false,
      })
    } catch (error) {
      console.error('Failed to estimate send fees:', error)
      set({ sendFeeEstimate: null, isEstimatingFees: false })
    }
  },

  sendTransaction: async (toAddress: string, amount: number, fee: number) => {
    set({ isLoading: true, error: null })

    try {
      const { utxos, address, wallet, network, selectedAccountId } = get()
      if (!wallet) {
        throw new Error('Wallet not initialized')
      }

      if (!isValidKaspaAddress(toAddress, network)) {
        throw new Error('Invalid recipient address for selected network')
      }

      const activeAccount = getActiveAccount(wallet, selectedAccountId)
      if (!activeAccount) {
        throw new Error('No active account selected')
      }

      const privateKey = derivePrivateKeyFromMnemonic(wallet.mnemonic, activeAccount.derivationIndex)
      let feeToUse = fee
      const maxAttempts = 3
      let txId: string | null = null

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const targetAmount = amount + feeToUse
        const { selected, total } = selectUtxos(utxos, targetAmount)
        if (selected.length === 0 || total < targetAmount) {
          throw new Error('Insufficient balance')
        }

        const transactionPayload = buildSignedTransaction({
          inputs: selected.map((utxo) => ({
            txId: utxo.outpointHash,
            vOut: utxo.outpointIndex,
            address: utxo.address,
            amount: utxo.amount,
          })),
          outputs: [
            {
              address: toAddress,
              amount,
            },
          ],
          changeAddress: address,
          fee: feeToUse,
          privateKey,
          addressPrefixes: [network.prefix],
        })

        try {
          txId = await api.broadcastTransaction(transactionPayload)
          break
        } catch (error) {
          const rawMessage = error instanceof Error ? error.message : String(error)
          const requiredFee = parseRequiredFeeFromError(rawMessage)

          if (requiredFee !== null && requiredFee > feeToUse && attempt < maxAttempts) {
            feeToUse = requiredFee + 50
            continue
          }

          throw error
        }
      }

      if (!txId) {
        throw new Error('Transaction failed to broadcast')
      }

      set({ isLoading: false })
      await get().fetchBalance()
      await get().fetchTransactions()

      return txId
    } catch (error) {
      const errorMessage = normalizeTransactionError(
        error instanceof Error ? error.message : 'Transaction failed'
      )
      set({ isLoading: false, error: errorMessage })
      throw error
    }
  },

  revealWalletMnemonic: async (walletId: string, password: string) => {
    const targetWalletId = walletId.trim()
    const secret = password.trim()

    if (!targetWalletId) {
      const message = 'Select a wallet first'
      set({ error: message })
      throw new Error(message)
    }

    if (!secret) {
      const message = 'Password is required to reveal seed phrase'
      set({ error: message })
      throw new Error(message)
    }

    try {
      let vault: WalletVaultData | null = null
      if (sessionVault && sessionPassword && secret === sessionPassword) {
        vault = sessionVault
      } else {
        vault = await loadEncryptedWalletFromStorage(secret)
      }

      const profile = getProfileById(vault, targetWalletId)
      if (!profile) {
        throw new Error('Wallet not found in vault')
      }

      set({ error: null })
      return profile.wallet.mnemonic
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reveal seed phrase'
      set({ error: message })
      throw new Error(message)
    }
  },

  clearError: () => set({ error: null }),
}))
