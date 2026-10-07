const TOAST = 'moneytree:toast';

export interface ToastOptions {
  message: string;
  /** Optional action button, e.g. undo. */
  action?: { label: string; run: () => void | Promise<void> };
}

export function showToast(options: ToastOptions): void {
  window.dispatchEvent(new CustomEvent<ToastOptions>(TOAST, { detail: options }));
}

export function onToast(listener: (options: ToastOptions) => void): () => void {
  const handler = (e: Event) => listener((e as CustomEvent<ToastOptions>).detail);
  window.addEventListener(TOAST, handler);
  return () => window.removeEventListener(TOAST, handler);
}
