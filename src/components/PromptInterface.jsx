import React, { useState } from 'react';
import { Search, Sparkles, Headphones, BookOpen } from 'lucide-react';

const DEPTHS = [
  { label: 'Quick Brief',    value: 'quick',    sources: '2 sources', time: '~10 min' },
  { label: 'Standard',       value: 'standard', sources: '3 sources', time: '~25 min' },
  { label: 'Full Deep Dive', value: 'deep',     sources: '5 sources', time: '~50 min' },
];

const SUGGESTIONS = [
  'The science of deep sleep',
  'How to build unbreakable discipline',
  'Longevity, fasting, and health span',
  'Dopamine, motivation, and focus',
  'How to write a number one pop song',
  'The psychology of high performance',
];

export default function PromptInterface({ onSynthesize }) {
  const [query, setQuery] = useState('');
  const [depth, setDepth] = useState('standard');
  const [isFocused, setIsFocused] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) onSynthesize(query, depth);
  };

  const hasText = query.trim().length > 0;

  return (
    <div style={{
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      animation: 'fadeSlideUp var(--dur-slow) var(--ease-out)',
      position: 'relative',
    }}>

      <div style={{ position: 'relative', zIndex: 1, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        {/* ── Hero text ────────────────────────────────────────────────────── */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h1 className="display" style={{
            fontSize: 'clamp(2.4rem, 5vw, 3.5rem)',
            fontWeight: 700, lineHeight: 1.1,
            marginBottom: '1.25rem',
          }}>
            What do you want to<br />
            <span className="text-gradient">deeply understand</span>?
          </h1>

          <p style={{
            color: 'var(--text-secondary)', fontSize: '1rem',
            maxWidth: '440px', lineHeight: 1.7, margin: '0 auto',
            fontWeight: 400,
          }}>
            AI finds the best moments from the world's top podcasts and assembles a curated audio documentary — just for you.
          </p>
        </div>

        {/* ── Main card ────────────────────────────────────────────────────── */}
        <form
          onSubmit={handleSubmit}
          className="glass-panel"
          style={{
            width: '100%', maxWidth: '640px',
            padding: 0, overflow: 'hidden',
            border: isFocused ? '1px solid var(--accent-border)' : '1px solid var(--border-subtle)',
            boxShadow: isFocused
              ? '0 0 0 3px var(--accent-subtle), 0 16px 48px rgba(0,0,0,0.4)'
              : '0 16px 48px rgba(0,0,0,0.3)',
            transition: `all var(--dur-std) var(--ease-out)`,
          }}
        >
          {/* Search input */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.85rem',
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <Search
              size={18}
              color={isFocused ? 'var(--accent)' : 'var(--text-tertiary)'}
              style={{ flexShrink: 0, transition: `color var(--dur-fast) var(--ease-out)` }}
            />
            <input
              type="text"
              placeholder="What do you want to learn about?"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--text-primary)', fontSize: '1.05rem',
                fontFamily: 'var(--font-body)',
              }}
            />
          </div>

          {/* Depth picker */}
          <div style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <p style={{
              color: 'var(--text-tertiary)', fontSize: '0.7rem',
              textTransform: 'uppercase', letterSpacing: '0.12em',
              marginBottom: '0.85rem', fontWeight: 500, textAlign: 'center',
            }}>
              How deep do you want to go?
            </p>
            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center' }}>
              {DEPTHS.map(d => {
                const active = d.value === depth;
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setDepth(d.value)}
                    style={{
                      flex: 1, maxWidth: '170px',
                      padding: '0.65rem 0.5rem',
                      borderRadius: '12px',
                      border: `1.5px solid ${active ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
                      background: active ? 'var(--accent-subtle)' : 'var(--bg-raised)',
                      color: active ? 'var(--accent)' : 'var(--text-secondary)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem',
                      transition: `all var(--dur-fast) var(--ease-out)`,
                      fontFamily: 'var(--font-body)',
                      cursor: 'pointer',
                    }}
                    onMouseOver={e => {
                      if (!active) {
                        e.currentTarget.style.borderColor = 'var(--border-medium)';
                        e.currentTarget.style.color = 'var(--text-primary)';
                        e.currentTarget.style.background = 'var(--bg-elevated)';
                      }
                    }}
                    onMouseOut={e => {
                      if (!active) {
                        e.currentTarget.style.borderColor = 'var(--border-subtle)';
                        e.currentTarget.style.color = 'var(--text-secondary)';
                        e.currentTarget.style.background = 'var(--bg-raised)';
                      }
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{d.label}</span>
                    <span style={{ fontSize: '0.7rem', opacity: 0.65 }}>{d.sources} · {d.time}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Submit */}
          <div style={{ padding: '1rem 1.5rem' }}>
            <button
              type="submit"
              style={{
                width: '100%',
                background: hasText ? 'var(--accent)' : 'var(--bg-elevated)',
                color: hasText ? 'white' : 'var(--text-muted)',
                padding: '0.95rem',
                borderRadius: '10px',
                fontWeight: 600, fontSize: '0.95rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                boxShadow: hasText ? '0 4px 16px rgba(167,139,250,0.20)' : 'none',
                transition: `all var(--dur-std) var(--ease-out)`,
                fontFamily: 'var(--font-body)',
                cursor: hasText ? 'pointer' : 'default',
                opacity: 1,
              }}
              onMouseOver={e => { if (hasText) e.currentTarget.style.opacity = '0.88'; }}
              onMouseOut={e => { if (hasText) e.currentTarget.style.opacity = '1'; }}
            >
              <Sparkles size={16} />
              Generate
            </button>
          </div>

          {/* Feature strip */}
          <div style={{
            display: 'flex', justifyContent: 'center', gap: '2rem',
            padding: '0.85rem 1.5rem',
            borderTop: '1px solid var(--border-subtle)',
            background: 'rgba(0,0,0,0.12)',
          }}>
            {[
              { icon: Headphones, label: 'Real Podcasts' },
              { icon: Sparkles,   label: 'AI Narrated' },
              { icon: BookOpen,   label: 'Curriculum Ordered' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                color: 'var(--text-tertiary)', fontSize: '0.75rem',
              }}>
                <Icon size={12} color="var(--accent)" /> {label}
              </div>
            ))}
          </div>
        </form>

        {/* ── Suggestion chips ────────────────────────────────────────────── */}
        <div style={{
          marginTop: '1.75rem',
          display: 'flex', flexWrap: 'wrap', gap: '0.55rem',
          justifyContent: 'center', maxWidth: '640px',
        }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', width: '100%', textAlign: 'center', marginBottom: '0.25rem', letterSpacing: '0.05em' }}>
            Try one of these
          </span>
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setQuery(s)}
              style={{
                padding: '0.38rem 0.85rem', borderRadius: '50px',
                background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)', fontSize: '0.82rem',
                transition: `all var(--dur-fast) var(--ease-out)`, fontFamily: 'var(--font-body)', cursor: 'pointer',
              }}
              onMouseOver={e => {
                e.currentTarget.style.borderColor = 'var(--accent-border)';
                e.currentTarget.style.color = 'var(--accent)';
                e.currentTarget.style.background = 'var(--accent-hover)';
              }}
              onMouseOut={e => {
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
                e.currentTarget.style.color = 'var(--text-secondary)';
                e.currentTarget.style.background = 'var(--bg-raised)';
              }}
            >
              {s}
            </button>
          ))}
        </div>

      </div>
    </div>
  );
}
