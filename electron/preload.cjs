const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('kaspaDesktop', {
  isDesktop: true,
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
  getWalletFileInfo: () => ipcRenderer.invoke('kaspa-desktop:get-wallet-file-info'),
  readWalletFile: () => ipcRenderer.invoke('kaspa-desktop:read-wallet-file'),
  openWalletFolder: () => ipcRenderer.invoke('kaspa-desktop:open-wallet-folder'),
  backupWalletFile: () => ipcRenderer.invoke('kaspa-desktop:backup-wallet-file'),
  syncWalletFile: (payload) => ipcRenderer.invoke('kaspa-desktop:sync-wallet-file', payload),
  httpGet: (url) => ipcRenderer.invoke('kaspa-desktop:http-get', url),
})
