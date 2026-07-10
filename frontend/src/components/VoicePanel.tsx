import { Volume2, X } from 'lucide-react'
import type { VoiceSettings } from '../hooks/useSpeech'

interface Props {
  voices: SpeechSynthesisVoice[]
  settings: VoiceSettings
  onUpdate: (patch: Partial<VoiceSettings>) => void
  onClose: () => void
}

export default function VoicePanel({ voices, settings, onUpdate, onClose }: Props) {
  return (
    <div className="glass rounded-2xl p-4 animate-fade-in" style={{ border: '1px solid rgba(139,92,246,0.3)' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Volume2 size={15} style={{ color: 'var(--accent)' }} />
          <span className="text-base font-medium" style={{ color: 'var(--text-primary)' }}>Voice Settings</span>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg glass-hover" style={{ color: 'var(--text-secondary)' }}>
          <X size={14} />
        </button>
      </div>

      <div className="space-y-3">
        {/* Voice select */}
        <div>
          <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Voice</label>
          <select
            className="input-glass w-full px-3 py-1.5 rounded-lg text-sm"
            value={settings.voice?.name ?? ''}
            onChange={e => {
              const v = voices.find(v => v.name === e.target.value) ?? null
              onUpdate({ voice: v })
            }}>
            {voices.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
          </select>
        </div>

        {/* Rate */}
        <div>
          <div className="flex justify-between mb-1">
            <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>Speed</label>
            <span className="text-sm" style={{ color: 'var(--accent)' }}>{settings.rate.toFixed(1)}x</span>
          </div>
          <input type="range" min="0.5" max="2" step="0.1" value={settings.rate}
            onChange={e => onUpdate({ rate: parseFloat(e.target.value) })}
            className="w-full accent-purple-500 h-1" />
        </div>

        {/* Pitch */}
        <div>
          <div className="flex justify-between mb-1">
            <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>Pitch</label>
            <span className="text-sm" style={{ color: 'var(--accent)' }}>{settings.pitch.toFixed(1)}</span>
          </div>
          <input type="range" min="0.5" max="2" step="0.1" value={settings.pitch}
            onChange={e => onUpdate({ pitch: parseFloat(e.target.value) })}
            className="w-full accent-purple-500 h-1" />
        </div>
      </div>
    </div>
  )
}
