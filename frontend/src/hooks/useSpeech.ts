import { useState, useRef, useCallback, useEffect } from 'react'

// ── Speech Recognition (voice → text) ────────────────────────────────────────

const SpeechRecognition =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

// The Web Speech API only works in secure contexts (https, or localhost) and
// only in Chromium-based browsers — Firefox and Safari don't implement it.
const isSecureContext = typeof window !== 'undefined' ? window.isSecureContext : true

function describeSpeechError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'permission-denied':
      return 'Microphone access was blocked. Allow it in your browser\'s site settings and try again.'
    case 'no-speech':
      return 'No speech detected — try again and speak right after tapping the mic.'
    case 'audio-capture':
      return 'No microphone was found on this device.'
    case 'network':
      return 'Voice recognition needs an internet connection.'
    case 'aborted':
      return ''
    default:
      return 'Voice input failed — please try again.'
  }
}

export function useSpeechInput(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState('')
  const [supported] = useState(() => !!SpeechRecognition && isSecureContext)
  const recRef = useRef<any>(null)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult

  const start = useCallback(() => {
    if (!supported) {
      setError(!SpeechRecognition
        ? 'Voice input isn\'t supported in this browser — try Chrome or Edge.'
        : 'Voice input needs a secure (https) connection.')
      return
    }
    setError('')
    try {
      const rec = new SpeechRecognition()
      rec.continuous = false
      rec.interimResults = false
      rec.lang = 'en-US'
      rec.onresult = (e: any) => {
        const text = e.results?.[0]?.[0]?.transcript
        if (text) onResultRef.current(text)
      }
      rec.onend = () => setListening(false)
      rec.onerror = (e: any) => {
        setListening(false)
        const msg = describeSpeechError(e?.error)
        if (msg) setError(msg)
      }
      recRef.current = rec
      rec.start()
      setListening(true)
    } catch {
      setListening(false)
      setError('Could not start voice input — please try again.')
    }
  }, [supported])

  const stop = useCallback(() => {
    recRef.current?.stop()
    setListening(false)
  }, [])

  return { listening, supported, error, clearError: () => setError(''), start, stop, toggle: listening ? stop : start }
}

// ── Speech Synthesis (text → voice) ──────────────────────────────────────────

export interface VoiceSettings {
  enabled: boolean
  voice: SpeechSynthesisVoice | null
  rate: number
}

export function useSpeechOutput() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [settings, setSettings] = useState<VoiceSettings>({ enabled: false, voice: null, rate: 1 })
  const [speaking, setSpeaking] = useState(false)
  const supported = typeof speechSynthesis !== 'undefined'

  useEffect(() => {
    if (!supported) return
    const load = () => {
      const v = speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'))
      if (v.length) setVoices(v)
    }
    load()
    speechSynthesis.addEventListener('voiceschanged', load)
    return () => speechSynthesis.removeEventListener('voiceschanged', load)
  }, [supported])

  const speak = useCallback((text: string) => {
    if (!supported || !settings.enabled) return
    speechSynthesis.cancel()
    const clean = text.replace(/[#*`_~\[\]]/g, '').trim()
    const utt = new SpeechSynthesisUtterance(clean)
    utt.voice  = settings.voice ?? voices[0] ?? null
    utt.rate   = settings.rate
    utt.onstart = () => setSpeaking(true)
    utt.onend   = () => setSpeaking(false)
    utt.onerror = () => setSpeaking(false)
    speechSynthesis.speak(utt)
  }, [supported, settings, voices])

  const stop   = useCallback(() => { speechSynthesis.cancel(); setSpeaking(false) }, [])
  const replay = useCallback((text: string) => { stop(); speak(text) }, [stop, speak])
  const update = useCallback((patch: Partial<VoiceSettings>) => setSettings(s => ({ ...s, ...patch })), [])

  return { voices, settings, speaking, supported, speak, stop, replay, update }
}