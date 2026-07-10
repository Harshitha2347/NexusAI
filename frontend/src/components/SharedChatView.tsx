import { useEffect, useState } from 'react'
import { Sparkles, AlertTriangle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { sharedAPI, Message } from '../lib/api'

interface Props { token: string }

export default function SharedChatView({ token }: Props) {
  const [title,setTitle]=useState('')
  const [messages,setMessages]=useState<Message[]>([])
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(true)

  useEffect(() => {
    sharedAPI.get(token)
      .then(data => { setTitle(data.title); setMessages(data.messages) })
      .catch(() => setError("This shared chat doesn't exist or is no longer shared."))
      .finally(() => setLoading(false))
  }, [token])

  return (
    <div className="min-h-screen relative" data-theme={useThemeGuess()}>
      <div className="aurora-bg">
        <div className="aurora-blob" /><div className="aurora-blob" /><div className="aurora-blob" />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg,#7c3aed,#06b6d4)' }}>
            <Sparkles size={14} className="text-white" />
          </div>
          <span className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>NexusAI · Shared chat</span>
        </div>

        {loading && <p className="text-base" style={{ color: 'var(--text-secondary)' }}>Loading…</p>}

        {error && (
          <div className="flex items-center gap-2 text-base px-4 py-3 rounded-xl"
               style={{ color: '#f87171', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        {!loading && !error && (
          <>
            <h1 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>{title}</h1>
            <div className="space-y-4">
              {messages.map(m => (
                <div key={m.id} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-base ${m.role === 'user' ? 'rounded-tr-sm text-white' : 'glass rounded-tl-sm'}`}
                       style={m.role === 'user' ? { background: 'linear-gradient(135deg,#7c3aed,#5b21b6)' } : {}}>
                    {m.role === 'user' ? (
                      <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    ) : (
                      <div className="prose-custom">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-center text-sm mt-8" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
              Read-only shared conversation — sign in to NexusAI to reply.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

// Shared links are viewed without the app's auth/theme bootstrap, so fall back
// to the visitor's OS preference instead of assuming dark mode.
function useThemeGuess() {
  const [t] = useState(() =>
    window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  )
  return t
}
