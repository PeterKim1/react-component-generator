import { useState, useCallback, useMemo } from 'react';
import type { GeneratedComponent, Provider } from '../types';
import { useLocalStorage } from './useLocalStorage';

interface UseComponentGeneratorReturn {
  components: GeneratedComponent[];
  isLoading: boolean;
  error: string | null;
  generate: (prompt: string, apiKey: string | undefined, provider: Provider) => Promise<void>;
  removeComponent: (id: string) => void;
  clearAll: () => void;
}

type StoredComponent = Omit<GeneratedComponent, 'createdAt'> & { createdAt: string };

export const COMPONENTS_STORAGE_KEY = 'rcg:components';

export function useComponentGenerator(): UseComponentGeneratorReturn {
  const [stored, setStored] = useLocalStorage<StoredComponent[]>(COMPONENTS_STORAGE_KEY, []);
  const components = useMemo<GeneratedComponent[]>(
    () => stored.map((c) => ({ ...c, createdAt: new Date(c.createdAt) })),
    [stored],
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (prompt: string, apiKey: string | undefined, provider: Provider) => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, ...(apiKey && { apiKey }), provider }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate component');
      }

      const newComponent: StoredComponent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        prompt,
        code: data.code,
        createdAt: new Date().toISOString(),
      };

      setStored((prev) => [newComponent, ...prev]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [setStored]);

  const removeComponent = useCallback((id: string) => {
    setStored((prev) => prev.filter((c) => c.id !== id));
  }, [setStored]);

  const clearAll = useCallback(() => {
    setStored([]);
  }, [setStored]);

  return { components, isLoading, error, generate, removeComponent, clearAll };
}
