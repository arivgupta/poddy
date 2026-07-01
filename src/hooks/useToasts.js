import { useCallback, useRef, useState } from 'react';

let nextId = 1;

/**
 * Tiny toast queue. `push({ kind, message, action })` where action is
 * an optional `{ label, onClick }`.
 */
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const push = useCallback(
    ({ kind = 'info', message, action = null, duration = 5200 }) => {
      const id = nextId++;
      setToasts((prev) => [...prev.slice(-3), { id, kind, message, action }]);
      if (duration > 0) {
        timersRef.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  return { toasts, push, dismiss };
}
