import { useEffect, useState } from 'react';
import { onToast, type ToastOptions } from '../lib/toast';

const VISIBLE_MS = 6000;

/** Bottom toast for quick confirmations ("บันทึกแล้ว · เลิกทำ"). */
export function Toaster() {
  const [toast, setToast] = useState<(ToastOptions & { id: number }) | null>(null);

  useEffect(() => onToast((options) => setToast({ ...options, id: Date.now() })), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;
  return (
    <div className="fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 lg:bottom-6" role="status" aria-live="polite">
      <div className="flex max-w-md items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
        <span>{toast.message}</span>
        {toast.action && (
          <button
            className="font-semibold text-amber-300 hover:underline"
            onClick={() => {
              const action = toast.action!;
              setToast(null);
              void action.run();
            }}
          >
            {toast.action.label}
          </button>
        )}
      </div>
    </div>
  );
}
