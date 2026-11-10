import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useComponentGenerator } from './useComponentGenerator';

const STORAGE_KEY = 'rcg:components';

const encoder = new TextEncoder();

function ndjsonResponse(events: object[]) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(events.map((e) => JSON.stringify(e)).join('\n') + '\n'));
      controller.close();
    },
  });
  return { ok: true, body };
}

function controlledResponse() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    response: { ok: true, body },
    send: (event: object) => controller.enqueue(encoder.encode(JSON.stringify(event) + '\n')),
    close: () => controller.close(),
  };
}

const stored = [
  { id: 'a', prompt: '카드', code: 'render(<div/>)', createdAt: '2026-01-02T03:04:05.000Z' },
];

describe('useComponentGenerator 영속화', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('저장된 컴포넌트 목록을 마운트 시 복원하고 createdAt을 Date로 되살린다', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    const { result } = renderHook(() => useComponentGenerator());

    expect(result.current.components).toHaveLength(1);
    expect(result.current.components[0].createdAt).toBeInstanceOf(Date);
    expect(result.current.components[0].createdAt.toISOString()).toBe('2026-01-02T03:04:05.000Z');
  });

  it('생성에 성공하면 새 컴포넌트가 localStorage에 저장된다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ndjsonResponse([{ type: 'done', code: 'render(<b/>)' }])));
    const { result } = renderHook(() => useComponentGenerator());

    await act(() => result.current.generate('버튼', undefined, 'google'));

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ prompt: '버튼', code: 'render(<b/>)' });
  });

  it('델타를 받는 동안 streaming에 누적 코드가 노출되고 완료 후 null이 된다', async () => {
    const ctrl = controlledResponse();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ctrl.response));
    const { result } = renderHook(() => useComponentGenerator());

    let promise!: Promise<void>;
    act(() => {
      promise = result.current.generate('버튼', undefined, 'google');
    });
    await act(async () => {
      ctrl.send({ type: 'delta', text: 'const A' });
      ctrl.send({ type: 'delta', text: ' = 1;' });
    });
    await vi.waitFor(() => expect(result.current.streaming?.code).toBe('const A = 1;'));
    expect(result.current.streaming?.prompt).toBe('버튼');

    await act(async () => {
      ctrl.send({ type: 'done', code: 'const A = 1;\nrender(<A />);' });
      ctrl.close();
      await promise;
    });

    expect(result.current.streaming).toBeNull();
    expect(result.current.components[0].code).toBe('const A = 1;\nrender(<A />);');
  });

  it('스트리밍 중인 id와 완료된 컴포넌트의 id가 같다', async () => {
    const ctrl = controlledResponse();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ctrl.response));
    const { result } = renderHook(() => useComponentGenerator());

    let promise!: Promise<void>;
    act(() => {
      promise = result.current.generate('버튼', undefined, 'google');
    });
    await act(async () => {
      ctrl.send({ type: 'delta', text: 'x' });
    });
    await vi.waitFor(() => expect(result.current.streaming).not.toBeNull());
    const streamingId = result.current.streaming?.id;

    await act(async () => {
      ctrl.send({ type: 'done', code: 'x' });
      ctrl.close();
      await promise;
    });

    expect(result.current.components[0].id).toBe(streamingId);
  });

  it('스트림 중 error 이벤트를 받으면 에러를 노출하고 컴포넌트를 저장하지 않는다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        ndjsonResponse([
          { type: 'delta', text: 'const' },
          { type: 'error', error: '잘렸습니다' },
        ]),
      ),
    );
    const { result } = renderHook(() => useComponentGenerator());

    await act(() => result.current.generate('버튼', undefined, 'google'));

    expect(result.current.error).toBe('잘렸습니다');
    expect(result.current.streaming).toBeNull();
    expect(result.current.components).toHaveLength(0);
  });

  it('HTTP 에러 응답이면 JSON의 error 메시지를 노출한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: '키가 필요합니다' }) }),
    );
    const { result } = renderHook(() => useComponentGenerator());

    await act(() => result.current.generate('버튼', undefined, 'google'));

    expect(result.current.error).toBe('키가 필요합니다');
  });

  it('removeComponent는 저장소에서도 해당 항목을 지운다', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    const { result } = renderHook(() => useComponentGenerator());

    act(() => result.current.removeComponent('a'));

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')).toEqual([]);
  });

  it('clearAll은 저장된 목록을 비운다', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    const { result } = renderHook(() => useComponentGenerator());

    act(() => result.current.clearAll());

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')).toEqual([]);
  });
});
