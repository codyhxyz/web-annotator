import { useState } from 'react';
import { Lock, Users, Globe } from 'lucide-react';
import type { PrivacyLevel } from '../store/annotation';

interface Props {
  value: PrivacyLevel;
  onChange: (level: PrivacyLevel) => void;
  compact?: boolean;
}

const levels = [
  { id: 'private' as const, icon: Lock, label: 'Private', desc: 'Only you' },
  { id: 'friends' as const, icon: Users, label: 'Friends', desc: 'Visible to friends' },
  { id: 'open' as const, icon: Globe, label: 'Open', desc: 'Everyone can see & vote' },
] as const;
const DEFAULT_LEVEL = levels[0];
type Level = (typeof levels)[number];

export default function PrivacyToggle({ value, onChange, compact }: Props) {
  const [showDropdown, setShowDropdown] = useState(false);
  const current: Level = levels.find(l => l.id === value) ?? DEFAULT_LEVEL;
  const Icon = current.icon;

  if (compact) {
    return (
      <div style={{ position: 'relative' }}>
        <button
          onClick={(e) => { e.stopPropagation(); setShowDropdown(!showDropdown); }}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#94a3b8',
            padding: 4,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            fontSize: 11,
            transition: 'color 0.15s',
          }}
          title={`Privacy: ${current.label}`}
        >
          <Icon size={12} />
        </button>
        {showDropdown && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              marginBottom: 4,
              background: 'white',
              borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
              zIndex: 100,
              minWidth: 160,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {levels.map(l => {
              const LIcon = l.icon;
              return (
                <button
                  key={l.id}
                  onClick={() => { onChange(l.id); setShowDropdown(false); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    width: '100%',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 13,
                    color: value === l.id ? '#3b82f6' : '#475569',
                    background: value === l.id ? '#eff6ff' : 'transparent',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => { if (value !== l.id) (e.currentTarget as HTMLElement).style.background = '#f8fafc'; }}
                  onMouseLeave={(e) => { if (value !== l.id) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <LIcon size={14} />
                  <>
                    <div style={{ fontWeight: 500 }}>{l.label}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{l.desc}</div>
                  </>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 2, borderRadius: 8, background: '#f1f5f9', padding: 2 }}>
      {levels.map(l => {
        const LIcon = l.icon;
        const active = value === l.id;
        return (
          <button
            key={l.id}
            onClick={() => onChange(l.id)}
            title={l.desc}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
              background: active ? 'white' : 'transparent',
              color: active ? '#1e293b' : '#94a3b8',
              boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            <LIcon size={13} />
            {l.label}
          </button>
        );
      })}
    </div>
  );
}
