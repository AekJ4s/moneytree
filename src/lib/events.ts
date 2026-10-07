import { useEffect, useRef } from 'react';

const DATA_CHANGED = 'moneytree:data-changed';

/** Tells every open page that money data changed (e.g. something was recorded from the + button). */
export function emitDataChanged(): void {
  window.dispatchEvent(new Event(DATA_CHANGED));
}

/** Runs `onChange` whenever data changes elsewhere in the app. */
export function useOnDataChanged(onChange: () => void): void {
  const latest = useRef(onChange);
  latest.current = onChange;
  useEffect(() => {
    const handler = () => latest.current();
    window.addEventListener(DATA_CHANGED, handler);
    return () => window.removeEventListener(DATA_CHANGED, handler);
  }, []);
}
