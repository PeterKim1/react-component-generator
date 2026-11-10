import { useState, useCallback, useMemo } from 'react';
import type { GeneratedComponent, Provider } from '../types';
import { useLocalStorage } from './useLocalStorage';

export interface StreamingState {
  id: string;
  prompt: string;
  code: string;
}

type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; code: string }
  | { type: 'error'; error: string };

interface UseComponentGeneratorReturn {
  components: GeneratedComponent[];
  isLoading: boolean;
  streaming: StreamingState | null;
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

  const [streaming, setStreaming] = useState<StreamingState | null>(null);

  const generate = useCallback(async (prompt: string, apiKey: string | undefined, provider: Provider) => {
    setIsLoading(true);
    setError(null);
    setStreaming(null);

    try {
      const res = await fetch('/api/generate/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, ...(apiKey && { apiKey }), provider }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate component');
      }
      if (!res.body) {
        throw new Error('스트림 응답을 받을 수 없습니다.');
      }

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      let accumulated = '';
      let finalCode: string | null = null;

      const handleEvent = (event: StreamEvent) => {
        if (event.type === 'delta') {
          accumulated += event.text;
          setStreaming({ id, prompt, code: accumulated });
        } else if (event.type === 'done') {
          finalCode = event.code;
        } else {
          throw new Error(event.error);
        }
      };

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.trim()) handleEvent(JSON.parse(line) as StreamEvent);
        }
      }
      if (buffer.trim()) handleEvent(JSON.parse(buffer) as StreamEvent);

      if (finalCode === null) {
        throw new Error('생성이 완료되기 전에 연결이 종료되었습니다.');
      }

      const newComponent: StoredComponent = {
        id,
        prompt,
        code: finalCode,
        createdAt: new Date().toISOString(),
      };

      setStored((prev) => [newComponent, ...prev]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setStreaming(null);
      setIsLoading(false);
    }
  }, [setStored]);

  const removeComponent = useCallback((id: string) => {
    setStored((prev) => prev.filter((c) => c.id !== id));
  }, [setStored]);

  const clearAll = useCallback(() => {
    setStored([]);
  }, [setStored]);

  return { components, isLoading, streaming, error, generate, removeComponent, clearAll };
}
