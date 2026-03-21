import { useEffect } from 'react';
import { create } from 'zustand';

// ── Toast store ─────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastStore {
  toasts: ToastItem[];
  addToast: (type: ToastType, message: string) => void;
  removeToast: (id: string) => void;
}

let toastCounter = 0;

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],

  addToast: (type, message) => {
    const id = `toast-${++toastCounter}`;
    const toast: ToastItem = { id, type, message };
    set({ toasts: [...get().toasts, toast] });

    // Auto-remove po 3s
    setTimeout(() => {
      const { toasts } = get();
      set({ toasts: toasts.filter(t => t.id !== id) });
    }, 3000);
  },

  removeToast: (id) => {
    const { toasts } = get();
    set({ toasts: toasts.filter(t => t.id !== id) });
  },
}));

/** Helper do uzywania w komponentach — zwraca funkcje addToast */
export function useToast() {
  return useToastStore(s => s.addToast);
}

// ── Toast Container ─────────────────────────────────────

const TYPE_STYLES: Record<ToastType, string> = {
  success: 'bg-emerald-600/90 border-emerald-500',
  error: 'bg-red-600/90 border-red-500',
  info: 'bg-blue-600/90 border-blue-500',
};

const TYPE_ICONS: Record<ToastType, string> = {
  success: '\u2713',
  error: '\u2717',
  info: '\u2139',
};

export function ToastContainer() {
  const toasts = useToastStore(s => s.toasts);
  const removeToast = useToastStore(s => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-lg border shadow-xl text-white text-sm font-medium animate-slide-in ${TYPE_STYLES[toast.type]}`}
        >
          <span className="text-base font-bold">{TYPE_ICONS[toast.type]}</span>
          <span className="flex-1">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-white/60 hover:text-white text-lg leading-none ml-2"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
