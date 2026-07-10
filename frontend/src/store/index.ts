import { create } from 'zustand'
import { authAPI, convoAPI, User, Convo, Message } from '../lib/api'

type Theme = 'dark' | 'light'

function initialTheme(): Theme {
  const saved = localStorage.getItem('theme')
  if (saved === 'dark' || saved === 'light') return saved
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

interface Store {
  // Theme
  theme: Theme
  setTheme: (t: Theme) => void
  toggleTheme: () => void

  // Auth
  user: User | null
  token: string | null
  authLoading: boolean
  authError: string
  login:    (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout:   () => void
  loadMe:   () => Promise<void>

  // Conversations
  convos: Convo[]
  activeId: string | null
  convoLoading: boolean
  loadConvos:      () => Promise<void>
  createConvo:     () => Promise<Convo>
  renameConvo:     (id: string, title: string) => Promise<void>
  deleteConvo:     (id: string) => Promise<void>
  setActive:       (id: string | null) => void
  updateConvoTitle:(id: string, title: string) => void
  updateConvoShare:(id: string, patch: Partial<Convo>) => void

  // Messages
  messages: Record<string, Message[]>
  streaming: boolean
  loadMessages:   (id: string) => Promise<void>
  refreshMessages:(id: string) => Promise<void>
  setMessages:    (convoId: string, msgs: Message[]) => void
  appendMessage:  (convoId: string, msg: Message) => void
  appendDelta:    (convoId: string, delta: string) => void
  replaceFrom:    (convoId: string, index: number, msgs: Message[]) => void
  dropTrailingEmptyAssistant: (convoId: string) => void
  startStream:    () => void
  stopStream:     () => void
}

export const useStore = create<Store>((set, get) => ({
  // ── Theme ─────────────────────────────────────────────────────────────────
  theme: initialTheme(),

  setTheme: (t) => {
    localStorage.setItem('theme', t)
    document.documentElement.setAttribute('data-theme', t)
    set({ theme: t })
  },

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    get().setTheme(next)
  },

  // ── Auth ──────────────────────────────────────────────────────────────────
  user: null, token: localStorage.getItem('token'), authLoading: false, authError: '',

  login: async (email, password) => {
    set({ authLoading: true, authError: '' })
    try {
      const { token, user } = await authAPI.login(email, password)
      localStorage.setItem('token', token)
      set({ token, user, authLoading: false })
    } catch (e: any) {
      set({ authError: e.response?.data?.detail || 'Login failed', authLoading: false })
    }
  },

  register: async (name, email, password) => {
    set({ authLoading: true, authError: '' })
    try {
      const { token, user } = await authAPI.register(name, email, password)
      localStorage.setItem('token', token)
      set({ token, user, authLoading: false })
    } catch (e: any) {
      set({ authError: e.response?.data?.detail || 'Registration failed', authLoading: false })
    }
  },

  logout: () => {
    localStorage.removeItem('token')
    set({ user: null, token: null, convos: [], messages: {}, activeId: null })
  },

  loadMe: async () => {
    if (!get().token) return
    try {
      const user = await authAPI.me()
      set({ user })
    } catch {
      get().logout()
    }
  },

  // ── Conversations ─────────────────────────────────────────────────────────
  convos: [], activeId: null, convoLoading: false,

  loadConvos: async () => {
    set({ convoLoading: true })
    try {
      const convos = await convoAPI.list()
      set({ convos, convoLoading: false })
    } catch { set({ convoLoading: false }) }
  },

  createConvo: async () => {
    const convo = await convoAPI.create()
    set(s => ({ convos: [convo, ...s.convos], activeId: convo.id }))
    return convo
  },

  renameConvo: async (id, title) => {
    await convoAPI.rename(id, title)
    set(s => ({ convos: s.convos.map(c => c.id === id ? { ...c, title } : c) }))
  },

  deleteConvo: async (id) => {
    await convoAPI.delete(id)
    set(s => ({
      convos: s.convos.filter(c => c.id !== id),
      activeId: s.activeId === id ? null : s.activeId,
      messages: Object.fromEntries(Object.entries(s.messages).filter(([k]) => k !== id)),
    }))
  },

  setActive: (id) => set({ activeId: id }),

  updateConvoTitle: (id, title) =>
    set(s => ({ convos: s.convos.map(c => c.id === id ? { ...c, title } : c) })),

  updateConvoShare: (id, patch) =>
    set(s => ({ convos: s.convos.map(c => c.id === id ? { ...c, ...patch } : c) })),

  // ── Messages ──────────────────────────────────────────────────────────────
  messages: {}, streaming: false,

  loadMessages: async (id) => {
    if (get().messages[id]) return
    const msgs = await convoAPI.messages(id)
    set(s => ({ messages: { ...s.messages, [id]: msgs } }))
  },

  refreshMessages: async (id) => {
    const msgs = await convoAPI.messages(id)
    set(s => ({ messages: { ...s.messages, [id]: msgs } }))
  },

  setMessages: (convoId, msgs) =>
    set(s => ({ messages: { ...s.messages, [convoId]: msgs } })),

  appendMessage: (convoId, msg) =>
    set(s => ({ messages: { ...s.messages, [convoId]: [...(s.messages[convoId] ?? []), msg] } })),

  appendDelta: (convoId, delta) =>
    set(s => {
      const msgs = [...(s.messages[convoId] ?? [])]
      if (!msgs.length) return s
      const last = msgs[msgs.length - 1]
      if (last.role !== 'assistant') return s
      msgs[msgs.length - 1] = { ...last, content: last.content + delta }
      return { messages: { ...s.messages, [convoId]: msgs } }
    }),

  // Replace everything from `index` onward with `msgs` — used when an earlier
  // user message is edited (its old continuation is superseded by a new branch).
  replaceFrom: (convoId, index, msgs) =>
    set(s => {
      const existing = s.messages[convoId] ?? []
      return { messages: { ...s.messages, [convoId]: [...existing.slice(0, index), ...msgs] } }
    }),

  dropTrailingEmptyAssistant: (convoId) =>
    set(s => {
      const existing = s.messages[convoId] ?? []
      const last = existing[existing.length - 1]
      if (last && last.role === 'assistant' && !last.content.trim()) {
        return { messages: { ...s.messages, [convoId]: existing.slice(0, -1) } }
      }
      return s
    }),

  startStream: () => set({ streaming: true }),
  stopStream:  () => set({ streaming: false }),
}))
