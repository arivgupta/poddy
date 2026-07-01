import React from 'react';
import { Plus, LoaderCircle } from 'lucide-react';

function LogoMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
      <circle cx="15" cy="15" r="13.5" stroke="rgba(247,241,231,0.16)" strokeWidth="1.4" />
      <circle cx="15" cy="15" r="9" stroke="#E9683A" strokeWidth="1.6" strokeDasharray="9 4 18 4" strokeLinecap="round" />
      <circle cx="15" cy="15" r="3.2" fill="#F2A56B" />
    </svg>
  );
}

export default function Header({
  view,
  onNavigate,
  isGenerating,
  generationLabel,
  libraryCount,
}) {
  const navBtn = (target, label, count) => {
    const active = view === target;
    return (
      <button
        onClick={() => onNavigate(target)}
        className={`relative rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200 ${
          active ? 'text-cream-50' : 'text-cream-400 hover:text-cream-100'
        }`}
      >
        {label}
        {typeof count === 'number' && count > 0 && (
          <span className="ml-1.5 font-mono text-[0.65rem] text-cream-500">{count}</span>
        )}
        {active && (
          <span className="absolute inset-x-4 -bottom-[13px] h-px bg-ember-500" />
        )}
      </button>
    );
  };

  return (
    <header className="sticky top-0 z-40 border-b border-cream-50/8 bg-night-900/85 backdrop-blur-xl">
      <div className="mx-auto flex h-[64px] w-full max-w-[1080px] items-center justify-between px-5 sm:px-8">
        <button
          onClick={() => onNavigate('home')}
          className="group flex items-center gap-2.5"
          aria-label="Poddy home"
        >
          <LogoMark />
          <span className="font-display text-[1.35rem] font-semibold tracking-tight text-cream-50 transition-colors group-hover:text-ember-300">
            Poddy
          </span>
        </button>

        <nav className="flex items-center gap-1 sm:gap-2">
          {isGenerating && view !== 'studio' && (
            <button
              onClick={() => onNavigate('studio')}
              className="mr-1 flex items-center gap-2 rounded-full border border-ember-500/30 bg-ember-500/10 px-3.5 py-1.5 text-xs font-medium text-ember-300 transition-colors hover:bg-ember-500/20"
            >
              <LoaderCircle size={13} className="animate-spin" />
              <span className="hidden sm:inline">{generationLabel || 'Producing…'}</span>
              <span className="sm:hidden">In studio</span>
            </button>
          )}

          {navBtn('home', 'Listen')}
          {navBtn('library', 'Library', libraryCount)}

          <button
            onClick={() => onNavigate('home', { focusComposer: true })}
            className="ml-1 flex items-center gap-1.5 rounded-full bg-cream-50 px-4 py-2 text-sm font-semibold text-night-900 shadow-[0_4px_18px_rgba(247,241,231,0.14)] transition-all duration-200 hover:bg-white hover:shadow-[0_4px_24px_rgba(247,241,231,0.22)] active:scale-[0.97]"
          >
            <Plus size={15} strokeWidth={2.5} />
            <span className="hidden sm:inline">New episode</span>
            <span className="sm:hidden">New</span>
          </button>
        </nav>
      </div>
    </header>
  );
}
