import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store'
import { Plus, MessageSquare, Pencil, Trash2, Check, X, Sparkles, LogOut, ChevronLeft, Sun, Moon } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface Props { open: boolean; onClose: () => void }

export default function Sidebar({ open, onClose }: Props) {
  const { user, logout, convos, activeId, setActive, createConvo, renameConvo, deleteConvo, streaming,
          theme, toggleTheme }= useStore()
  const [editId, setEditId]= useState<string | null>(null)
  const [editTitle, setEditTitle]= useState('')
  const [deletingId, setDeletingId]= useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editId && inputRef.current) inputRef.current.focus() }, [editId])

  const handleNew = async () => {
    if (streaming) return
    const convo = await createConvo()
    setActive(convo.id)
    if (window.innerWidth < 768) onClose()
  }

  const handleSelect = (id: string) => {
    setActive(id)
    if (window.innerWidth < 768) onClose()
  }

  const startEdit = (id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditId(id)
    setEditTitle(title)
  }

  const confirmEdit = async () => {
    if (!editId || !editTitle.trim()) return
    await renameConvo(editId, editTitle.trim())
    setEditId(null)
  }

  const confirmDelete = async (id: string) => {
    await deleteConvo(id)
    setDeletingId(null)
  }

  return (
    <>
      {/* Overlay on mobile */}
      {open && (
        <div className="fixed inset-0 z-20 bg-black/60 md:hidden" onClick={onClose} />
      )}

      <aside className={`
        fixed md:relative z-30 md:z-auto h-full w-64 flex flex-col
        transition-transform duration-300 ease-in-out
        ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `} style={{ background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)' }}>

        {/* Header */}
        <div className="flex items-center justify-between p-4 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg,#7c3aed,#06b6d4)' }}>
              <Sparkles size={14} className="text-white" />
            </div>
            <span className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>NexusAI</span>
          </div>
          <button onClick={onClose} className="md:hidden p-1 rounded-lg glass-hover transition-colors">
            <ChevronLeft size={18} style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        {/* New Chat */}
        <div className="px-3 pb-3">
          <button onClick={handleNew} disabled={streaming}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-base font-medium transition-all duration-150 disabled:opacity-40"
            style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', color: '#c4b5fd' }}>
            <Plus size={16} />
            New Chat
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
          {convos.length === 0 && (
            <p className="text-sm text-center py-8" style={{ color: 'var(--text-secondary)' }}>
              No conversations yet
            </p>
          )}
          {convos.map(c => (
            <div key={c.id} onClick={() => handleSelect(c.id)}
              className={`sidebar-item group relative ${activeId === c.id ? 'active' : ''}`}>

              {editId === c.id ? (
                <div className="flex items-center gap-1 w-full" onClick={e => e.stopPropagation()}>
                  <input ref={inputRef} value={editTitle} onChange={e => setEditTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') setEditId(null) }}
                    className="flex-1 min-w-0 bg-transparent text-sm outline-none"
                    style={{ color: 'var(--text-primary)' }} />
                  <button onClick={confirmEdit} className="text-green-400 hover:text-green-300"><Check size={13} /></button>
                  <button onClick={() => setEditId(null)} className="text-red-400 hover:text-red-300"><X size={13} /></button>
                </div>
              ) : deletingId === c.id ? (
                <div className="flex items-center gap-1 w-full text-sm" onClick={e => e.stopPropagation()}>
                  <span className="flex-1 truncate text-red-400">Delete?</span>
                  <button onClick={() => confirmDelete(c.id)} className="text-red-400 hover:text-red-300"><Check size={13} /></button>
                  <button onClick={() => setDeletingId(null)} className="hover:opacity-100 opacity-70" style={{ color: 'var(--text-primary)' }}><X size={13} /></button>
                </div>
              ) : (
                <>
                  <MessageSquare size={14} className="shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm leading-tight">{c.title}</p>
                    <p className="text-xs opacity-50 mt-0.5" style={{ fontSize: '12px' }}>
                      {formatDistanceToNow(new Date(c.updated_at), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                    <button onClick={e => startEdit(c.id, c.title, e)}
                      className="p-1 rounded transition-colors hover:opacity-100 opacity-70"
                      style={{ color: 'var(--text-primary)' }}><Pencil size={11} /></button>
                    <button onClick={e => { e.stopPropagation(); setDeletingId(c.id) }}
                      className="p-1 rounded hover:text-red-400 transition-colors"><Trash2 size={11} /></button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* User footer */}
        <div className="p-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                 style={{ background: 'linear-gradient(135deg,#7c3aed,#06b6d4)' }}>
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{user?.name}</p>
              <p className="text-xs truncate" style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{user?.email}</p>
            </div>
            <button onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-1.5 rounded-lg transition-colors glass-hover"
              style={{ color: 'var(--text-secondary)' }}>
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <button onClick={logout} title="Sign out"
              className="p-1.5 rounded-lg transition-colors hover:text-red-400"
              style={{ color: 'var(--text-secondary)' }}>
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
