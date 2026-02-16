import { useState, useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Wallet, 
  Send, 
  History, 
  Settings, 
  QrCode,
  Menu,
  X,
  RefreshCw,
  ChevronDown,
  UserRound
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useWalletStore } from '../stores/walletStore'
import { NETWORKS } from '../types'

const navItems = [
  { path: '/', icon: Wallet, label: 'Dashboard' },
  { path: '/send', icon: Send, label: 'Send' },
  { path: '/receive', icon: QrCode, label: 'Receive' },
  { path: '/history', icon: History, label: 'History' },
  { path: '/settings', icon: Settings, label: 'Settings' },
]

export default function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [showNetworkDropdown, setShowNetworkDropdown] = useState(false)
  const [showAccountDropdown, setShowAccountDropdown] = useState(false)
  const {
    network,
    setNetwork,
    fetchBalance,
    fetchTransactions,
    address,
    wallet,
    selectedAccountId,
    switchAccount,
    activeWalletName,
    autoLockMinutes,
    lockWallet,
    hasWallet,
    isLocked,
  } = useWalletStore()
  const activeAccount = wallet?.accounts.find((account) => account.id === selectedAccountId) ?? wallet?.accounts[0]

  useEffect(() => {
    const interval = setInterval(() => {
      fetchBalance()
      fetchTransactions()
    }, 30000)
    return () => clearInterval(interval)
  }, [fetchBalance, fetchTransactions])

  useEffect(() => {
    if (!hasWallet || isLocked || autoLockMinutes <= 0) return

    const timeoutMs = autoLockMinutes * 60 * 1000
    let timerId: number | undefined

    const resetTimer = () => {
      if (timerId !== undefined) {
        window.clearTimeout(timerId)
      }
      timerId = window.setTimeout(() => {
        lockWallet()
      }, timeoutMs)
    }

    const events: Array<keyof WindowEventMap> = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart']
    events.forEach((eventName) => {
      window.addEventListener(eventName, resetTimer, { passive: true })
    })
    document.addEventListener('visibilitychange', resetTimer)
    resetTimer()

    return () => {
      if (timerId !== undefined) {
        window.clearTimeout(timerId)
      }
      events.forEach((eventName) => {
        window.removeEventListener(eventName, resetTimer)
      })
      document.removeEventListener('visibilitychange', resetTimer)
    }
  }, [autoLockMinutes, lockWallet, hasWallet, isLocked])

  useEffect(() => {
    const closeMenus = () => {
      setShowNetworkDropdown(false)
      setShowAccountDropdown(false)
    }

    window.addEventListener('blur', closeMenus)
    return () => {
      window.removeEventListener('blur', closeMenus)
    }
  }, [])

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: isSidebarOpen ? 280 : 80 }}
        className="hidden md:flex flex-col bg-card border-r border-border"
      >
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
              <span className="text-white font-bold text-lg">K</span>
            </div>
            {isSidebarOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col"
              >
                <span className="font-bold text-lg">Kaspa</span>
                <span className="text-xs text-muted-foreground">{activeWalletName || 'Wallet'}</span>
              </motion.div>
            )}
          </div>
        </div>

        {/* Network Selector */}
        <div className="p-4">
          <button
            onClick={() => setShowNetworkDropdown(!showNetworkDropdown)}
            className={cn(
              "w-full flex items-center justify-between px-3 py-2 rounded-lg",
              "bg-muted hover:bg-muted/80 transition-colors",
              isSidebarOpen ? "flex" : "justify-center"
            )}
          >
            {isSidebarOpen && (
              <>
                <span className={cn(
                  "text-sm font-medium",
                  network.isTestnet ? "text-yellow-500" : "text-green-500"
                )}>
                  {network.name}
                </span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </>
            )}
            {!isSidebarOpen && (
              <div className={cn(
                "w-2 h-2 rounded-full",
                network.isTestnet ? "bg-yellow-500" : "bg-green-500"
              )} />
            )}
          </button>

          <AnimatePresence>
            {showNetworkDropdown && isSidebarOpen && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-2 p-2 bg-popover rounded-lg border border-border shadow-xl"
              >
                {Object.entries(NETWORKS).map(([key, net]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setNetwork(key)
                      setShowNetworkDropdown(false)
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm",
                      "hover:bg-accent transition-colors",
                      network.name === net.name && "bg-accent"
                    )}
                  >
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      net.isTestnet ? "bg-yellow-500" : "bg-green-500"
                    )} />
                    {net.name}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {wallet && (
            <>
              <button
                onClick={() => setShowAccountDropdown(!showAccountDropdown)}
                className={cn(
                  "w-full mt-2 flex items-center justify-between px-3 py-2 rounded-lg",
                  "bg-muted hover:bg-muted/80 transition-colors"
                )}
              >
                {isSidebarOpen && (
                  <>
                    <span className="text-sm font-medium flex items-center gap-2">
                      <UserRound className="w-3.5 h-3.5" />
                      {activeAccount?.name || 'Account'}
                    </span>
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  </>
                )}
              </button>

              <AnimatePresence>
                {showAccountDropdown && isSidebarOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mt-2 p-2 bg-popover rounded-lg border border-border shadow-xl"
                  >
                    {wallet.accounts.map((account) => (
                      <button
                        key={account.id}
                        onClick={() => {
                          switchAccount(account.id)
                          setShowAccountDropdown(false)
                        }}
                        className={cn(
                          "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm",
                          "hover:bg-accent transition-colors",
                          selectedAccountId === account.id && "bg-accent"
                        )}
                      >
                        <span className="truncate">{account.name}</span>
                        {selectedAccountId === account.id && <div className="w-2 h-2 rounded-full bg-primary" />}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                isActive 
                  ? "bg-gradient-to-r from-purple-600/20 to-blue-600/20 text-primary border border-primary/30" 
                  : "hover:bg-muted text-muted-foreground hover:text-foreground",
                !isSidebarOpen && "justify-center px-3"
              )}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {isSidebarOpen && (
                <span className="font-medium">{item.label}</span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Address */}
        {isSidebarOpen && address && (
          <div className="p-4 border-t border-border">
            <p className="text-xs text-muted-foreground mb-1">Your Address</p>
            {activeAccount && <p className="text-xs font-medium mb-1">{activeAccount.name}</p>}
            <p className="text-xs font-mono truncate bg-muted p-2 rounded">
              {address.slice(0, 20)}...
            </p>
          </div>
        )}

        {/* Toggle Sidebar */}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-4 border-t border-border hover:bg-muted transition-colors"
        >
          <Menu className="w-5 h-5 mx-auto" />
        </button>
      </motion.aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b border-border">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 hover:bg-muted rounded-lg"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
              <span className="text-white font-bold">K</span>
            </div>
            <span className="font-bold">Kaspa</span>
          </div>
          <button
            onClick={fetchBalance}
            className="p-2 hover:bg-muted rounded-lg"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="md:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              className="absolute left-0 top-0 bottom-0 w-[280px] bg-card border-r border-border"
              onClick={(e) => e.stopPropagation()}
            >
              <nav className="p-4 space-y-2 mt-16">
                {navItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={({ isActive }) => cn(
                      "flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                      isActive 
                        ? "bg-gradient-to-r from-purple-600/20 to-blue-600/20 text-primary" 
                        : "hover:bg-muted text-muted-foreground"
                    )}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="font-medium">{item.label}</span>
                  </NavLink>
                ))}
              </nav>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 min-h-screen md:pt-0 pt-16">
        <div className="max-w-6xl mx-auto p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
