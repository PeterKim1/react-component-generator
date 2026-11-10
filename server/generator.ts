// AI 응답 텍스트를 react-live에서 실행 가능한 코드로 정규화하는 순수 함수들.
// 부수효과(Bun.serve 등)가 없어 단위 테스트가 가능하다.

/** 응답에 섞여 나온 마크다운 코드펜스(```)를 제거한다. */
export function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:jsx|tsx|javascript|typescript)?\n?/gm, '')
    .replace(/```$/gm, '')
    .trim();
}

/**
 * react-live(noInline)는 `render(...)` 호출이 있어야 미리보기를 그린다.
 * 응답에 render 호출이 없으면 첫 컴포넌트 선언을 찾아 자동으로 주입한다.
 */
export function ensureRenderCall(code: string): string {
  if (/\brender\s*\(/.test(code)) return code;

  const match = code.match(/(?:const|function)\s+([A-Z]\w+)/);
  if (match) {
    return `${code}\n\nrender(<${match[1]} />);`;
  }
  return code;
}

/**
 * SSE 스트림 청크를 받아 완성된 이벤트의 `data:` 페이로드 배열을 돌려준다.
 * 청크 경계에서 잘린 이벤트는 내부 버퍼에 보관했다가 다음 호출에서 합친다.
 */
export function createSSEParser(): (chunk: string) => string[] {
  let buffer = '';
  return (chunk) => {
    buffer += chunk.replace(/\r\n/g, '\n');
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    const payloads: string[] = [];
    for (const event of events) {
      const data = event
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (data) payloads.push(data);
    }
    return payloads;
  };
}

export const TRUNCATED_MESSAGE = '생성된 코드가 너무 길어 잘렸습니다. 더 간단한 컴포넌트를 요청해주세요.';

/** Anthropic 스트리밍 이벤트 data에서 텍스트 델타를 꺼낸다. */
export function anthropicDelta(data: string): string {
  const event = JSON.parse(data) as {
    type?: string;
    error?: { message?: string };
    delta?: { type?: string; text?: string; stop_reason?: string };
  };
  if (event.type === 'error') {
    throw new Error(event.error?.message ?? 'Anthropic 스트림 에러');
  }
  if (event.type === 'message_delta' && event.delta?.stop_reason === 'max_tokens') {
    throw new Error(TRUNCATED_MESSAGE);
  }
  if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
    return event.delta.text ?? '';
  }
  return '';
}

/** Google 스트리밍 청크 data에서 텍스트와 MAX_TOKENS 절단 여부를 꺼낸다. */
export function googleDelta(data: string): { text: string; truncated: boolean } {
  const chunk = JSON.parse(data) as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  };
  if (chunk.error) {
    throw new Error(chunk.error.message ?? 'Gemini 스트림 에러');
  }
  const candidate = chunk.candidates?.[0];
  return {
    text: candidate?.content?.parts?.map((part) => part.text ?? '').join('') ?? '',
    truncated: candidate?.finishReason === 'MAX_TOKENS',
  };
}
