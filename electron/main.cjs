const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const fs = require('fs/promises')
const path = require('path')

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)
const ALLOWED_EXTERNAL_HOSTS = new Set([
  'kaspa.org',
  'www.kaspa.org',
  'explorer.kaspa.org',
  'explorer-tn10.kaspa.org',
  'explorer-tn11.kaspa.org',
])
const WALLET_DIRECTORY_NAME = 'wallet-data'
const WALLET_FILE_NAME = 'wallet.dat'
const LEGACY_WALLET_FILE_NAME = 'kaspa-wallet-vault.json'

function getWalletDirectoryPath() {
  return path.join(app.getPath('userData'), WALLET_DIRECTORY_NAME)
}

function getWalletFilePath() {
  return path.join(getWalletDirectoryPath(), WALLET_FILE_NAME)
}

function getLegacyWalletFilePath() {
  return path.join(getWalletDirectoryPath(), LEGACY_WALLET_FILE_NAME)
}

async function ensureWalletDirectory() {
  const walletDirectoryPath = getWalletDirectoryPath()
  await fs.mkdir(walletDirectoryPath, { recursive: true })
  return walletDirectoryPath
}

async function resolveExistingWalletFilePath() {
  try {
    await fs.access(getWalletFilePath())
    return getWalletFilePath()
  } catch {
    try {
      await fs.access(getLegacyWalletFilePath())
      return getLegacyWalletFilePath()
    } catch {
      return null
    }
  }
}

async function getWalletFileInfo() {
  const existingWalletFilePath = await resolveExistingWalletFilePath()
  return {
    isDesktop: true,
    walletFilePath: existingWalletFilePath ?? getWalletFilePath(),
    walletDirectoryPath: getWalletDirectoryPath(),
    exists: existingWalletFilePath !== null,
  }
}

function isAllowedExternalUrl(url) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && ALLOWED_EXTERNAL_HOSTS.has(parsed.hostname)
  } catch {
    return false
  }
}

function isAllowedDevNavigation(url) {
  if (!process.env.VITE_DEV_SERVER_URL) return false

  try {
    const devServerUrl = new URL(process.env.VITE_DEV_SERVER_URL)
    const parsed = new URL(url)
    return parsed.origin === devServerUrl.origin
  } catch {
    return false
  }
}

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1080,
    minHeight: 720,
    autoHideMenuBar: true,
    backgroundColor: '#0b0f19',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (isDev) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL)
    window.webContents.openDevTools({ mode: 'detach' })
  } else {
    window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    if (isDev) {
      if (!isAllowedDevNavigation(url)) {
        event.preventDefault()
        if (isAllowedExternalUrl(url)) {
          void shell.openExternal(url)
        }
      }
      return
    }

    if (!url.startsWith('file://')) {
      event.preventDefault()
      if (isAllowedExternalUrl(url)) {
        void shell.openExternal(url)
      }
    }
  })
}

ipcMain.handle('kaspa-desktop:get-wallet-file-info', async () => {
  return getWalletFileInfo()
})

ipcMain.handle('kaspa-desktop:read-wallet-file', async () => {
  try {
    return await fs.readFile(getWalletFilePath(), 'utf8')
  } catch {
    try {
      return await fs.readFile(getLegacyWalletFilePath(), 'utf8')
    } catch {
      return null
    }
  }
})

ipcMain.handle('kaspa-desktop:sync-wallet-file', async (_event, payload) => {
  const walletFilePath = getWalletFilePath()
  const legacyWalletFilePath = getLegacyWalletFilePath()

  if (typeof payload !== 'string' || payload.length === 0) {
    try {
      await fs.unlink(walletFilePath)
    } catch {
      // Ignore missing files.
    }
    try {
      await fs.unlink(legacyWalletFilePath)
    } catch {
      // Ignore missing files.
    }
    return getWalletFileInfo()
  }

  await ensureWalletDirectory()
  await fs.writeFile(walletFilePath, payload, 'utf8')
  try {
    await fs.unlink(legacyWalletFilePath)
  } catch {
    // Ignore missing legacy files.
  }
  return getWalletFileInfo()
})

ipcMain.handle('kaspa-desktop:open-wallet-folder', async () => {
  const info = await getWalletFileInfo()

  if (info.exists) {
    shell.showItemInFolder(info.walletFilePath)
    return
  }

  await ensureWalletDirectory()
  const errorMessage = await shell.openPath(info.walletDirectoryPath)
  if (errorMessage) {
    throw new Error(errorMessage)
  }
})

ipcMain.handle('kaspa-desktop:backup-wallet-file', async () => {
  const info = await getWalletFileInfo()
  if (!info.exists) {
    throw new Error('Encrypted wallet file is not available yet')
  }

  const timestamp = new Date().toISOString().slice(0, 10)
  const defaultPath = path.join(app.getPath('documents'), `wallet-backup-${timestamp}.dat`)
  const result = await dialog.showSaveDialog({
    title: 'Backup Wallet File',
    defaultPath,
    filters: [{ name: 'Kaspa Wallet Backup', extensions: ['dat'] }],
  })

  if (result.canceled || !result.filePath) {
    return { canceled: true }
  }

  await fs.copyFile(info.walletFilePath, result.filePath)
  return {
    canceled: false,
    filePath: result.filePath,
  }
})

app.whenReady().then(() => {
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
