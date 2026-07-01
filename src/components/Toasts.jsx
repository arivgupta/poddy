import React from 'react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';

const KIND_STYLES = {
  error: { icon: CircleAlert, accent: 'text-error-400', ring: 'border-error-400/25' },
  success: { icon: CircleCheck, accent: 'text-success-400', ring: 'border-success-400/25' },
  info: { icon: Info, accent: 'text-gold-300', ring: 'border-gold-300/25' },
};

export default function Toasts({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[70] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2.5 sm:right-6 sm:bottom-6">
      {toasts.map((toast) => {
        const style = KIND_STYLES[toast.kind] || KIND_STYLES.info;
        const Icon = style.icon;
        return (
          <div
            key={toast.id}
            role="status"
            className={`animate-toast-in pointer-events-auto flex items-start gap-3 rounded-2xl border ${style.ring} bg-night-800/95 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.5)] backdrop-blur-md`}
          >
            <Icon size={17} className={`mt-0.5 shrink-0 ${style.accent}`} />
            <div className="min-w-0 flex-1">
              <p className="text-[0.85rem] leading-snug text-cream-100">{toast.message}</p>
              {toast.action && (
                <button
                  onClick={() => {
                    toast.action.onClick();
                    onDismiss(toast.id);
                  }}
                  className={`mt-2 text-[0.8rem] font-semibold ${style.accent} hover:underline`}
                >
                  {toast.action.label}
                </button>
              )}
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              className="shrink-0 rounded-md p-0.5 text-cream-500 transition-colors hover:text-cream-100"
              aria-label="Dismiss notification"
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
