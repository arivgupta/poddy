import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, AudioLines } from 'lucide-react';
import { DEPTHS, ETA_BY_DEPTH } from '../lib/stages';

const MAX_TOPIC_LENGTH = 220;

/**
 * The heart of the home page: topic input + depth + submit.
 */
export default function Composer({
  onSubmit,
  disabled = false,
  onBlockedSubmit,
  initialTopic = '',
  focusSignal = 0,
}) {
  const [topic, setTopic] = useState(initialTopic);
  const [depth, setDepth] = useState('standard');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);

  // Adopt a new prefill (suggestion chip, "edit prompt", re-craft) when it changes.
  const [prevInitial, setPrevInitial] = useState(initialTopic);
  if (initialTopic !== prevInitial) {
    setPrevInitial(initialTopic);
    if (initialTopic) setTopic(initialTopic);
  }

  useEffect(() => {
    if (focusSignal > 0) inputRef.current?.focus();
  }, [focusSignal]);

  // Auto-grow the textarea up to ~3 lines.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [topic]);

  const canSubmit = topic.trim().length > 2 && !disabled;

  const submit = () => {
    if (disabled) {
      onBlockedSubmit?.();
      return;
    }
    if (topic.trim().length > 2) onSubmit(topic.trim(), depth);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div
      className={`surface w-full rounded-[28px] p-2 transition-shadow duration-300 ${
        focused ? 'shadow-[0_0_0_1px_rgba(233,104,58,0.4),0_32px_80px_-24px_rgba(0,0,0,0.7)]' : ''
      }`}
    >
      {/* Topic input */}
      <div className="flex items-start gap-3.5 px-5 pt-5 pb-3">
        <AudioLines
          size={21}
          className={`mt-[3px] shrink-0 transition-colors duration-300 ${
            focused || topic ? 'text-ember-400' : 'text-cream-500'
          }`}
        />
        <textarea
          ref={inputRef}
          rows={1}
          value={topic}
          maxLength={MAX_TOPIC_LENGTH}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="What do you want to understand? Ask anything…"
          aria-label="Episode topic"
          className="min-h-[30px] flex-1 resize-none bg-transparent text-[1.08rem] leading-relaxed text-cream-50 outline-none placeholder:text-cream-500/80"
        />
      </div>

      <div className="mx-5 h-px bg-cream-50/6" />

      {/* Depth selector */}
      <div className="grid grid-cols-1 gap-2 px-4 pt-4 pb-2 min-[440px]:grid-cols-3" role="radiogroup" aria-label="Episode depth">
        {DEPTHS.map((d) => {
          const active = d.value === depth;
          return (
            <button
              key={d.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setDepth(d.value)}
              className={`group flex flex-col items-start gap-0.5 rounded-2xl border px-3.5 py-3 text-left transition-all duration-200 ${
                active
                  ? 'border-ember-500/45 bg-ember-500/12'
                  : 'border-cream-50/7 bg-cream-50/[0.025] hover:border-cream-50/15 hover:bg-cream-50/[0.05]'
              }`}
            >
              <span className={`text-[0.88rem] font-semibold ${active ? 'text-ember-300' : 'text-cream-100'}`}>
                {d.label}
              </span>
              <span className="text-[0.7rem] leading-snug text-cream-400">
                {d.sources} sources · {d.listen}
              </span>
              <span className={`font-mono text-[0.62rem] tracking-wide ${active ? 'text-ember-300/80' : 'text-cream-500'}`}>
                ready in {ETA_BY_DEPTH[d.value]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Submit row */}
      <div className="flex items-center justify-between gap-3 px-4 pt-2 pb-4">
        <span className="hidden pl-1.5 font-mono text-[0.65rem] tracking-wide text-cream-500 sm:block">
          {topic.length > MAX_TOPIC_LENGTH - 40
            ? `${MAX_TOPIC_LENGTH - topic.length} characters left`
            : 'Enter ↵ to start'}
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit && !disabled}
          className={`ml-auto flex items-center gap-2.5 rounded-2xl px-6 py-3.5 text-[0.95rem] font-semibold transition-all duration-250 ${
            canSubmit
              ? 'bg-gradient-to-r from-ember-500 to-ember-400 text-night-950 shadow-[0_8px_28px_rgba(233,104,58,0.35)] hover:shadow-[0_8px_36px_rgba(233,104,58,0.5)] hover:brightness-105 active:scale-[0.98]'
              : 'bg-cream-50/6 text-cream-500'
          }`}
        >
          Craft my episode
          <ArrowRight size={17} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}
