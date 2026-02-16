import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useWalletStore } from './stores/walletStore'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Send from './pages/Send'
import Receive from './pages/Receive'
import History from './pages/History'
import Settings from './pages/Settings'
import Welcome from './pages/Welcome'
import Onboarding from './pages/Onboarding'
import Unlock from './pages/Unlock'

function App() {
  const { isInitialized, hasWallet, isLocked, needsMigration, initialize } = useWalletStore()

  useEffect(() => {
    void initialize()
  }, [initialize])

  if (!isInitialized) {
    return <Onboarding />
  }

  if (!hasWallet) {
    return <Welcome />
  }

  if (needsMigration || isLocked) {
    return <Unlock />
  }

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="send" element={<Send />} />
        <Route path="receive" element={<Receive />} />
        <Route path="history" element={<History />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}

export default App
