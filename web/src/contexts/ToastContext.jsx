import { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';

const ToastContext = createContext(null);

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const addToast = useCallback((message, type = 'info', duration = 4000, options = {}) => {
    const id = ++toastId;
    setToasts((prev) => [...prev.slice(-4), { id, message, type, ...options }]);

    timers.current[id] = setTimeout(() => {
      // Run onExpire callback if provided (e.g., to finalize a soft-delete)
      if (options.onExpire) options.onExpire();
      setToasts((prev) => prev.filter((t) => t.id !== id));
      delete timers.current[id];
    }, duration);

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const toast = useMemo(() => ({
    success: (msg) => addToast(msg, 'success'),
    error: (msg) => addToast(msg, 'error', 6000),
    warning: (msg) => addToast(msg, 'warning'),
    info: (msg) => addToast(msg, 'info'),
    /** Toast with undo button. onUndo called if user clicks undo; onExpire called when timer expires. */
    undo: (msg, { onUndo, onExpire, duration = 5000 } = {}) =>
      addToast(msg, 'undo', duration, { onUndo, onExpire }),
  }), [addToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, toast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
