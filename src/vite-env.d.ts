/// <reference types="vite/client" />

interface KaspaDesktopWalletFileInfo {
  isDesktop: boolean
  walletFilePath: string
  walletDirectoryPath: string
  exists: boolean
}

interface KaspaDesktopBackupResult {
  canceled: boolean
  filePath?: string
}

interface KaspaDesktopHttpResponse {
  ok: boolean
  status: number
  body: string
  contentType: string
}

interface Window {
  kaspaDesktop?: {
    isDesktop: boolean
    platform: string
    versions: {
      chrome: string
      electron: string
      node: string
    }
    getWalletFileInfo?: () => Promise<KaspaDesktopWalletFileInfo>
    readWalletFile?: () => Promise<string | null>
    openWalletFolder?: () => Promise<void>
    backupWalletFile?: () => Promise<KaspaDesktopBackupResult>
    syncWalletFile?: (payload: string | null) => Promise<KaspaDesktopWalletFileInfo>
    httpGet?: (url: string) => Promise<KaspaDesktopHttpResponse>
  }
}
