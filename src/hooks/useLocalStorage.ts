import { useState, useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';

function readStored<T>(key: string, initialValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? initialValue : (JSON.parse(raw) as T);
  } catch {
    return initialValue;
  }
}

export function useLocalStorage<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => readStored(key, initialValue));

  const setStored = useCallback<Dispatch<SetStateAction<T>>>(
    (action) => {
      setValue((prev) => {
        const next = typeof action === 'function' ? (action as (p: T) => T)(prev) : action;
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // 저장소가 가득 찼거나 막힌 경우에도 메모리 상태는 유지한다.
        }
        return next;
      });
    },
    [key],
  );

  return [value, setStored];
}
