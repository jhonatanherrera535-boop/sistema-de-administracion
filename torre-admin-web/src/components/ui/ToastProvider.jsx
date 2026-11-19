import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ToastContext = createContext(null);

const styles = {
  success: {
    icon: '✓',
    iconClass: 'bg-emerald-100 text-emerald-700',
    accent: 'bg-emerald-500',
  },
  error: {
    icon: '!',
    iconClass: 'bg-red-100 text-red-700',
    accent: 'bg-red-500',
  },
  warning: {
    icon: '!',
    iconClass: 'bg-amber-100 text-amber-700',
    accent: 'bg-amber-500',
  },
  info: {
    icon: 'i',
    iconClass: 'bg-blue-100 text-blue-700',
    accent: 'bg-blue-500',
  },
};

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast debe usarse dentro de ToastProvider.');
  }
  return context;
}

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = (message, options = {}) => {
    const id = nextId.current++;
    const toast = {
      id,
      message,
      type: options.type || 'info',
      title: options.title,
      duration: options.duration ?? 5000,
    };
    setToasts((current) => [...current, toast]);
    return id;
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col items-end gap-3 sm:left-auto sm:w-full sm:max-w-sm"
      >
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            toast={toast}
            onDismiss={dismissToast}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ toast, onDismiss }) {
  const style = styles[toast.type] || styles.info;

  useEffect(() => {
    const timeout = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => clearTimeout(timeout);
  }, [onDismiss, toast.duration, toast.id]);

  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      className="pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 pr-11 shadow-xl shadow-slate-900/10"
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-bold ${style.iconClass}`}>
        {style.icon}
      </span>
      <div className="min-w-0 flex-1">
        {toast.title && (
          <p className="mb-0.5 font-semibold text-slate-900">{toast.title}</p>
        )}
        <p className="whitespace-pre-line text-sm text-slate-600">{toast.message}</p>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Cerrar notificación"
        className="absolute right-3 top-3 rounded-lg p-1 text-lg leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
      >
        ×
      </button>
      <span className={`absolute inset-x-0 bottom-0 h-1 ${style.accent}`} />
    </div>
  );
}
