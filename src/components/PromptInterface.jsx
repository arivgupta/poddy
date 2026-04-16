import React, { useState } from 'react';
import { Search, Sparkles, Headphones, BookOpen, Zap } from 'lucide-react';

const DEPTHS = [
  { label: 'Quick',     value: 'quick',    detail: '2 sources · ~10 min', emoji: '⚡' },
  { label: 'Standard',  value: 'standard', detail: '3 sources · ~25 min', emoji: '🎧' },
  { label: 'Deep Dive', value: 'deep',     detail: '5 sources · ~50 min', emoji: '🌊' },
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
    <div className="w-full flex flex-col items-center">

      {/* Hero */}
      <div className="animate-entrance text-center mb-12">
        <p className="text-terra font-medium text-sm tracking-wide uppercase mb-4">Your personal podcast studio</p>
        <h1 className="font-display font-semibold text-[clamp(2.4rem,6.5vw,4.2rem)] leading-[1.1] -tracking-[0.02em] mb-5 text-ink-900">
          What are you curious<br />about today?
        </h1>
        <p className="text-ink-500 text-base max-w-[400px] mx-auto leading-relaxed">
          Tell us a topic and we'll assemble the best
          podcast moments into a curated listen, just for you.
        </p>
      </div>

      {/* Main card */}
      <form
        onSubmit={handleSubmit}
        className={`animate-entrance delay-1 w-full max-w-[540px] rounded-3xl overflow-hidden bg-cream-50 transition-all duration-300 ${
          isFocused
            ? 'ring-2 ring-terra/20 shadow-[0_20px_60px_rgba(30,24,20,0.15)]'
            : 'shadow-[0_8px_40px_rgba(30,24,20,0.10)]'
        }`}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-6 py-5">
          <Search size={20} className={`shrink-0 transition-colors duration-200 ${isFocused ? 'text-terra' : 'text-ink-300'}`} />
          <input
            type="text"
            placeholder="e.g. the neuroscience of motivation..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className="flex-1 bg-transparent outline-none text-ink-900 text-[1.05rem] placeholder:text-ink-300/80"
          />
        </div>

        <div className="h-px bg-ink-900/5 mx-5" />

        {/* Depth picker */}
        <div className="px-5 py-4">
          <div className="flex gap-2">
            {DEPTHS.map(d => {
              const active = d.value === depth;
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDepth(d.value)}
                  className={`flex-1 py-3 px-3 rounded-2xl flex flex-col items-center gap-1 transition-all duration-200 cursor-pointer ${
                    active
                      ? 'bg-terra text-white shadow-[0_4px_16px_rgba(191,86,48,0.25)]'
                      : 'bg-cream-200/60 text-ink-500 hover:bg-cream-200'
                  }`}
                >
                  <span className="text-lg leading-none">{d.emoji}</span>
                  <span className="font-semibold text-sm">{d.label}</span>
                  <span className={`text-[0.6rem] ${active ? 'text-white/60' : 'text-ink-400'}`}>{d.detail}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Submit */}
        <div className="px-5 pb-5">
          <button
            type="submit"
            disabled={!hasText}
            className={`w-full py-4 rounded-2xl font-semibold text-base flex items-center justify-center gap-2.5 transition-all duration-200 ${
              hasText
                ? 'bg-terra text-white hover:bg-terra-light active:scale-[0.98] shadow-[0_6px_20px_rgba(191,86,48,0.30)]'
                : 'bg-cream-200/80 text-ink-300 cursor-not-allowed'
            }`}
          >
            <Sparkles size={18} />
            Make my Poddy
          </button>
        </div>
      </form>

      {/* Trust markers */}
      <div className="animate-entrance delay-2 flex items-center gap-5 mt-6 text-ink-400">
        {[
          { icon: Headphones, label: 'Real podcast clips' },
          { icon: Sparkles,   label: 'AI narration' },
          { icon: BookOpen,   label: 'Smart ordering' },
        ].map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-1.5 text-[0.72rem] font-medium">
            <Icon size={12} className="text-terra/60" /> {label}
          </div>
        ))}
      </div>

      {/* Suggestion chips */}
      <div className="animate-entrance delay-3 mt-10 flex flex-col items-center gap-3 max-w-[540px]">
        <span className="text-ink-400 text-[0.7rem] tracking-[0.08em] uppercase font-medium">
          or try one of these
        </span>
        <div className="flex flex-wrap gap-2 justify-center">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setQuery(s)}
              className="px-4 py-2 rounded-full bg-cream-50/80 border border-ink-900/6 text-ink-500 text-[0.82rem] hover:bg-terra/8 hover:border-terra/20 hover:text-terra-dark transition-all duration-200 cursor-pointer"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
