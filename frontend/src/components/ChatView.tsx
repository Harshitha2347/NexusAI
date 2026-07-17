import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Mic, MicOff, Volume2, VolumeX, Settings2, Menu, Sparkles, Link2, Check, Search } from 'lucide-react'
import { useStore } from '../store'
import MessageBubble from './MessageBubble'
import VoicePanel from './VoicePanel'
import { useSpeechInput, useSpeechOutput } from '../hooks/useSpeech'
import { convoAPI, streamAPI } from '../lib/api'
import type { Message } from '../lib/api'

interface Props { onMenuClick: () => void }

export default function ChatView({ onMenuClick }: Props) {
  const { user, activeId, messages, streaming, loadMessages, refreshMessages,
          appendMessage, appendDelta, replaceFrom, setMessages, dropTrailingEmptyAssistant,
          startStream, stopStream, updateConvoTitle, updateConvoShare, convos } = useStore()

  const [input, setInput]= useState('')
  const [showVoice, setShowVoice]= useState(false)
  const [error, setError] = useState('')
  const [searchStatus, setSearchStatus]= useState<string | null>(null)
  const [shareCopied, setShareCopied]= useState(false)
  const bottomRef =useRef<HTMLDivElement>(null)
  const textareaRef= useRef<HTMLTextAreaElement>(null)

  const tts= useSpeechOutput()
  const stt= useSpeechInput((text) => setInput(prev => prev ? prev + ' ' + text : text))

  const activeConvo = convos.find(c => c.id === activeId)

  // Load messages when switching conversations
  useEffect(() => {
    if (activeId) { loadMessages(activeId); setError('') }
  }, [activeId])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages[activeId ?? '']?.length, streaming])

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [input])

  const currentMsgs = (activeId ? messages[activeId] : []) ?? []

  const drainStream = useCallback(async (
    convoId: string,
    gen: AsyncGenerator<any>,
    onBranch?: (evt: any) => void,
  ) => {
    let fullContent = ''
    try {
      for await (const evt of gen) {
        if (evt.type === 'search') {
          setSearchStatus(evt.query)
        } else if (evt.type === 'branch') {
          onBranch?.(evt)
        } else if (evt.type === 'delta') {
          setSearchStatus(null)
          appendDelta(convoId, evt.content)
          fullContent += evt.content
        } else if (evt.type === 'done') {
          if (evt.title) updateConvoTitle(convoId, evt.title)
          if (tts.settings.enabled && fullContent) tts.speak(fullContent)
        } else if (evt.type === 'error') {
          throw new Error(evt.message)
        }
      }
      await refreshMessages(convoId)
    } catch (e: any) {
      if (!fullContent.trim()) dropTrailingEmptyAssistant(convoId)
      setError(e.message || 'Something went wrong')
    } finally {
      setSearchStatus(null)
      stopStream()
    }
  }, [appendDelta, refreshMessages, stopStream, tts, updateConvoTitle, dropTrailingEmptyAssistant])

  const send = useCallback(async () => {
    if (!input.trim() || !activeId || streaming) return
    const text = input.trim()
    setInput(''); setError('')

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text, created_at: new Date().toISOString() }
    appendMessage(activeId, userMsg)
    const placeholder: Message = { id: crypto.randomUUID(), role: 'assistant', content: '', created_at: new Date().toISOString() }
    appendMessage(activeId, placeholder)
    startStream()

    await drainStream(activeId, streamAPI.send(activeId, text))
  }, [input, activeId, streaming, appendMessage, startStream, drainStream])

  const handleEdit = useCallback(async (index: number, messageId: string, newContent: string) => {
    if (!activeId || streaming) return
    setError('')
    const tempUser: Message = { id: crypto.randomUUID(), role: 'user', content: newContent, created_at: new Date().toISOString() }
    const placeholder: Message = { id: crypto.randomUUID(), role: 'assistant', content: '', created_at: new Date().toISOString() }
    replaceFrom(activeId, index, [tempUser, placeholder])
    startStream()

    await drainStream(activeId, streamAPI.edit(messageId, newContent), (evt) => {
      const list = [...(useStore.getState().messages[activeId] ?? [])]
      if (list[index]) {
        list[index] = { ...list[index], id: evt.message_id, branch_index: evt.branch_index, branch_count: evt.branch_count }
        setMessages(activeId, list)
      }
    })
  }, [activeId, streaming, replaceFrom, setMessages, startStream, drainStream])

  const handleRegenerate = useCallback(async (index: number, messageId: string) => {
    if (!activeId || streaming) return
    setError('')
    const placeholder: Message = { id: crypto.randomUUID(), role: 'assistant', content: '', created_at: new Date().toISOString() }
    replaceFrom(activeId, index, [placeholder])
    startStream()
    await drainStream(activeId, streamAPI.regenerate(messageId))
  }, [activeId, streaming, replaceFrom, startStream, drainStream])

  const handleSwitchBranch = useCallback(async (messageId: string, direction: -1 | 1) => {
    if (!activeId || streaming) return
    try {
      const path = await convoAPI.selectBranch(activeId, messageId, direction)
      setMessages(activeId, path)
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Could not switch branch')
    }
  }, [activeId, streaming, setMessages])

  const handleShare = useCallback(async () => {
    if (!activeId) return
    try {
      const { share_token } = await convoAPI.share(activeId)
      updateConvoShare(activeId, { is_shared: true, share_token })
      const url = `${window.location.origin}/shared/${share_token}`
      await navigator.clipboard.writeText(url)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    } catch {
      setError('Could not create a share link')
    }
  }, [activeId, updateConvoShare])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!activeId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
        <button onClick={onMenuClick} className="md:hidden absolute top-4 left-4 p-2 glass rounded-xl glass-hover">
          <Menu size={18} />
        </button>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
             style={{ background: 'linear-gradient(135deg,#7c3aed,#06b6d4)' }}>
          <Sparkles size={30} className="text-white" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Hello, {user?.name?.split(' ')[0]}</h2>
          <p style={{ color: 'var(--text-secondary)' }} className="text-base">
            Start a new conversation to begin
          </p>
        </div>
        <NewChatButton />
      </div>
    )
  }

  const lastAssistantIndex = [...currentMsgs].reverse().findIndex(m => m.role === 'assistant')
  const lastAssistantIdx = lastAssistantIndex === -1 ? -1 : currentMsgs.length - 1 - lastAssistantIndex

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <button onClick={onMenuClick} className="md:hidden p-2 glass rounded-xl glass-hover">
          <Menu size={18} />
        </button>
        <h2 className="flex-1 text-base font-medium truncate" style={{ color: 'var(--text-primary)' }}>
          {activeConvo?.title ?? 'Chat'}
        </h2>

        {/* Share / export link */}
        <button onClick={handleShare} title="Copy a shareable link to this chat"
          className="p-2 rounded-xl glass glass-hover transition-all flex items-center gap-1.5"
          style={{ color: shareCopied ? '#34d399' : 'var(--text-secondary)' }}>
          {shareCopied ? <Check size={16} /> : <Link2 size={16} />}
        </button>

        {/* TTS toggle */}
        <button onClick={() => { tts.update({ enabled: !tts.settings.enabled }); setShowVoice(false) }}
          className={`p-2 rounded-xl glass transition-all ${tts.settings.enabled ? 'glass-hover' : ''}`}
          title="Toggle voice output"
          style={tts.settings.enabled ? { color: 'var(--accent)', border: '1px solid rgba(139,92,246,0.4)' } : { color: 'var(--text-secondary)' }}>
          {tts.settings.enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
        {tts.settings.enabled && (
          <button onClick={() => setShowVoice(v => !v)}
            className="p-2 rounded-xl glass glass-hover transition-all"
            style={{ color: showVoice ? 'var(--accent)' : 'var(--text-secondary)' }}>
            <Settings2 size={16} />
          </button>
        )}
      </div>

      {/* Voice panel */}
      {showVoice && tts.settings.enabled && (
        <div className="px-4 pt-3">
          <VoicePanel voices={tts.voices} settings={tts.settings}
            onUpdate={tts.update} onClose={() => setShowVoice(false)} />
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {currentMsgs.length === 0 && !streaming && (
          <p className="text-center text-base py-8" style={{ color: 'var(--text-secondary)' }}>
            Send a message to start the conversation
          </p>
        )}
        {currentMsgs.map((msg, i) => (
          <MessageBubble key={msg.id} msg={msg}
            isStreaming={streaming && i === currentMsgs.length - 1 && msg.role === 'assistant'}
            voiceSettings={tts.settings}
            speaking={tts.speaking}
            onReplay={tts.replay}
            onStopSpeech={tts.stop}
            canRegenerate={!streaming && msg.role === 'assistant' && i === lastAssistantIdx}
            onRegenerate={() => handleRegenerate(i, msg.id)}
            onEdit={msg.role === 'user' ? (content) => handleEdit(i, msg.id, content) : undefined}
            onSwitchBranch={(msg.branch_count ?? 1) > 1 ? (dir) => handleSwitchBranch(msg.id, dir) : undefined}
          />
        ))}
        {searchStatus && (
          <div className="flex items-center gap-2 text-sm animate-fade-in" style={{ color: 'var(--accent-2)' }}>
            <Search size={13} className="animate-pulse" /> Searching the web for “{searchStatus}”…
          </div>
        )}
        {error && (
          <div className="text-base px-4 py-3 rounded-xl animate-fade-in"
               style={{ color: '#f87171', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            ⚠ {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="p-4 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="glass rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <textarea ref={textareaRef} rows={1} value={input}
            onChange={e => setInput(e.target.value)} onKeyDown={onKey}
            placeholder="Message NexusAI… (Shift+Enter for newline)"
            disabled={streaming}
            className="w-full bg-transparent px-4 pt-3 pb-1 text-base resize-none outline-none placeholder-gray-500 disabled:opacity-50"
            style={{ maxHeight: '160px', color: 'var(--text-primary)' }} />
          <div className="flex items-center justify-between px-3 pb-2.5">
            <div className="flex items-center gap-1">
              <button onClick={stt.toggle} title={
                  !stt.supported
                    ? 'Voice input needs Chrome/Edge over https or localhost'
                    : stt.listening ? 'Stop recording' : 'Voice input'
                }
                disabled={!stt.supported}
                className={`p-2 rounded-xl transition-all disabled:opacity-40 ${stt.listening ? 'text-red-400' : ''}`}
                style={stt.listening
                  ? { background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }
                  : { color: 'var(--text-secondary)' }}>
                {stt.listening ? <MicOff size={15} /> : <Mic size={15} />}
              </button>
              {stt.listening && (
                <span className="text-sm animate-pulse" style={{ color: '#f87171' }}>Listening…</span>
              )}
              {stt.error && !stt.listening && (
                <span className="text-sm" style={{ color: '#f87171' }}>{stt.error}</span>
              )}
            </div>
            <button onClick={send} disabled={!input.trim() || streaming}
              className="btn-gradient p-2 rounded-xl text-white transition-all"
              title="Send">
              <Send size={15} />
            </button>
          </div>
        </div>
        <p className="text-center text-sm mt-2" style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>
          Powered by Llama 3.3 70B via Groq · Web search kicks in automatically when needed
        </p>
      </div>
    </div>
  )
}

function NewChatButton() {
  const { createConvo } = useStore()
  return (
    <button onClick={() => createConvo()}
      className="btn-gradient px-6 py-2.5 rounded-xl text-base font-medium text-white">
      Start New Chat
    </button>
  )
}
