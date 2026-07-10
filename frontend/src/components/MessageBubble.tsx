import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Copy, Check, Volume2, VolumeX, RefreshCw, ChevronLeft, ChevronRight, Globe } from 'lucide-react'
import type { Message } from '../lib/api'
import type { VoiceSettings } from '../hooks/useSpeech'

interface Props {
  msg: Message
  isStreaming?: boolean
  voiceSettings: VoiceSettings
  onReplay: (text: string) => void
  onStopSpeech: () => void
  speaking: boolean
  canRegenerate?: boolean
  onRegenerate?: () => void
  onEdit?: (newContent: string) => void
  onSwitchBranch?: (direction: -1 | 1) => void
}

export default function MessageBubble({
  msg, isStreaming, voiceSettings, onReplay, onStopSpeech, speaking,
  canRegenerate, onRegenerate, onEdit, onSwitchBranch,
}: Props) {
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [triggerRegenerate, setTriggerRegenerate] = useState(false)
  const [draft, setDraft] = useState(msg.content)
  const editRef = useRef<HTMLTextAreaElement>(null)
  const isUser = msg.role === 'user'
  const hasBranches = (msg.branch_count ?? 1) > 1

  useEffect(() => {
    if (editing) {
      editRef.current?.focus()
      editRef.current?.setSelectionRange(draft.length, draft.length)
    }
  }, [editing])

  const copy = async () => {
    await navigator.clipboard.writeText(msg.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const saveEdit = () => {
    const trimmed = draft.trim()
    setEditing(false)
    setTriggerRegenerate(false)
    if (trimmed && trimmed !== msg.content) onEdit?.(trimmed)
    else setDraft(msg.content)
  }

  return (
    <div className={`flex gap-3 animate-fade-in ${isUser ? 'justify-end' : 'justify-start'}`}>
      {/* AI avatar */}
      {!isUser && (
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5"
             style={{ background: 'linear-gradient(135deg,#7c3aed,#06b6d4)' }}>
          AI
        </div>
      )}

      <div className={`group max-w-[82%] ${isUser ? 'order-first' : ''}`} style={{ minWidth: 0 }}>
        {/* Web-search indicator */}
        {!isUser && msg.used_search && (
          <div className="flex items-center gap-1 mb-1 text-xs" style={{ color: 'var(--accent-2)' }}>
            <Globe size={11} /> Searched the web
          </div>
        )}

        {/* regenerate placeholder (moved below) */}

        {/* Bubble */}
        {editing ? (
          <div className="rounded-2xl rounded-tr-sm p-2" style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-active)' }}>
            <textarea
              ref={editRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit() }
                if (e.key === 'Escape') { setDraft(msg.content); setEditing(false) }
              }}
              rows={Math.min(8, Math.max(2, draft.split('\n').length))}
              className="w-full bg-transparent text-sm resize-none outline-none px-2 py-1"
              style={{ color: 'var(--text-primary)' }}
            />
            <div className="flex items-center justify-end gap-2 px-2 pb-1">
              <button onClick={() => { setDraft(msg.content); setEditing(false); setTriggerRegenerate(false) }}
                className="text-xs px-2 py-1 rounded-lg glass-hover" style={{ color: 'var(--text-secondary)' }}>
                Cancel
              </button>
              <button onClick={saveEdit}
                className="btn-gradient text-xs px-3 py-1 rounded-lg text-white font-medium">
                {triggerRegenerate ? 'Regenerate' : 'Save & submit'}
              </button>
            </div>
          </div>
        ) : (
          <div className={`px-4 py-3 rounded-2xl text-sm relative ${
            isUser ? 'rounded-tr-sm text-white' : 'glass rounded-tl-sm'
          }`}
            style={isUser ? { background: 'linear-gradient(135deg,#7c3aed,#5b21b6)' } : {}}>

            {isUser ? (
              <p className="whitespace-pre-wrap break-words">{msg.content}</p>
            ) : (
              <div className="prose-custom">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ className, children, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || '')
                      const isBlock = !!match
                      return isBlock ? (
                        <div className="relative group/code">
                          <SyntaxHighlighter style={oneDark} language={match[1]}
                            customStyle={{ margin: 0, borderRadius: 8, fontSize: '0.82em' }} PreTag="div">
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                          <CopyCodeButton code={String(children)} />
                        </div>
                      ) : (
                        <code className={className} {...props}>{children}</code>
                      )
                    },
                  }}>
                  {msg.content}
                </ReactMarkdown>

                {isStreaming && (
                  <span className="inline-flex items-center gap-1 ml-1 mt-1">
                    <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Branch navigation */}
        {hasBranches && !editing && (
          <div className={`flex items-center gap-1 mt-1 text-xs ${isUser ? 'justify-end' : 'justify-start'}`}
               style={{ color: 'var(--text-secondary)' }}>
            <button onClick={() => onSwitchBranch?.(-1)} disabled={(msg.branch_index ?? 1) <= 1}
              className="p-0.5 rounded disabled:opacity-30 hover:opacity-70">
              <ChevronLeft size={13} />
            </button>
            <span>{msg.branch_index}/{msg.branch_count}</span>
            <button onClick={() => onSwitchBranch?.(1)} disabled={(msg.branch_index ?? 1) >= (msg.branch_count ?? 1)}
              className="p-0.5 rounded disabled:opacity-30 hover:opacity-70">
              <ChevronRight size={13} />
            </button>
          </div>
        )}

        {/* Actions */}
        {!editing && (
          <div className={`flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity ${isUser ? 'justify-end' : ''}`}>
            {!isUser && !isStreaming && (
              <>
                <ActionBtn onClick={copy} title="Copy">
                  {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                </ActionBtn>
                {voiceSettings.enabled && (
                  speaking ? (
                    <ActionBtn onClick={onStopSpeech} title="Stop">
                      <VolumeX size={12} className="text-purple-400" />
                    </ActionBtn>
                  ) : (
                    <ActionBtn onClick={() => onReplay(msg.content)} title="Read aloud">
                      <Volume2 size={12} />
                    </ActionBtn>
                  )
                )}
              </>
            )}
          </div>
        )}

        {/* Regenerate icon placed below the message bubble for user messages */}
        {isUser && !editing && onEdit && (
          <div className="mt-1 flex justify-end">
            <button onClick={() => { setDraft(msg.content); setEditing(true); setTriggerRegenerate(true) }}
              title="Regenerate"
              className="p-1.5 rounded-lg glass glass-hover flex items-center justify-center"
              style={{ color: 'var(--text-secondary)' }}>
              <RefreshCw size={14} />
            </button>
          </div>
        )}
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5"
             style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
          U
        </div>
      )}
    </div>
  )
}

function ActionBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title}
      className="p-1.5 rounded-lg glass glass-hover transition-all"
      style={{ color: 'var(--text-secondary)' }}>
      {children}
    </button>
  )
}

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy}
      className="absolute top-2 right-2 px-2 py-1 rounded text-xs glass glass-hover transition-all opacity-0 group-hover/code:opacity-100"
      style={{ color: 'var(--text-secondary)' }}>
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}
