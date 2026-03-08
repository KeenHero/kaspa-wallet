const { app, BrowserWindow, shell } = require('electron')
const path = require('path')

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)
const ALLOWED_EXTERNAL_HOSTS = new Set([
  'kaspa.org',
  'www.kaspa.org',
  'explorer.kaspa.org',
  'explorer-tn10.kaspa.org',
  'explorer-tn11.kaspa.org',
])

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
