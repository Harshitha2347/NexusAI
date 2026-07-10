import { useEffect, useState } from 'react'
import { useStore } from './store'
import AuthPage from './components/AuthPage'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import SharedChatView from './components/SharedChatView'

function useSharedToken() {
  const [token, setToken] = useState<string | null>(null)
  useEffect(() => {
    const match = window.location.pathname.match(/^\/shared\/([^/]+)\/?$/)
    setToken(match ? match[1] : null)
  }, [])
  return token
}

export default function App() {
  const { token, user, loadMe, loadConvos, theme, setTheme } = useStore()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [booting, setBooting]         = useState(true)
  const sharedToken = useSharedToken()

  // Apply the persisted/system theme as early as possible.
  useEffect(() => {
    setTheme(theme)
  }, []) // eslint-disable-line

  useEffect(() => {
    const init = async () => {
      if (token) {
        await loadMe()
        await loadConvos()
      }
      setBooting(false)
    }
    init()
  }, [])  // eslint-disable-line

  // Public, unauthenticated read-only view for exported/shared chat links.
  if (sharedToken) {
    return <SharedChatView token={sharedToken} />
  }

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="aurora-bg">
          <div className="aurora-blob" /><div className="aurora-blob" /><div className="aurora-blob" />
        </div>
        <div className="relative z-10 flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl animate-pulse"
               style={{ background: 'linear-gradient(135deg,#7c3aed,#06b6d4)' }} />
          <p className="text-base" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
        </div>
      </div>
    )
  }

  if (!token || !user) return <AuthPage />

  return (
    <div className="h-screen flex overflow-hidden relative">
      {/* Aurora background */}
      <div className="aurora-bg">
        <div className="aurora-blob" /><div className="aurora-blob" /><div className="aurora-blob" />
      </div>

      {/* Layout */}
      <div className="relative z-10 flex w-full h-full">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <ChatView onMenuClick={() => setSidebarOpen(v => !v)} />
        </main>
      </div>
    </div>
  )
}
