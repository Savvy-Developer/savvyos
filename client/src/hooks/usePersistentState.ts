import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

/**
 * Drop-in replacement for useState that persists the value to sessionStorage
 * under `key`. Used for list-page filters (search, lead source, status, sort,
 * page, etc.) so they survive navigating into a record and back instead of
 * resetting. Restores the stored value on mount; falls back to `initial` when
 * nothing is stored. Scoped to the tab session — closing the tab clears it.
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(key);
      return stored !== null ? (JSON.parse(stored) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore storage quota / availability errors */
    }
  }, [key, value]);

  return [value, setValue];
}
