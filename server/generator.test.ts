import { describe, it, expect } from 'vitest';
import {
  stripCodeFences,
  ensureRenderCall,
  createSSEParser,
  anthropicDelta,
  googleDelta,
  validateGenerateBody,
  isAllowedOrigin,
  MAX_PROMPT_LENGTH,
} from './generator';

describe('stripCodeFences', () => {
  it('언어 태그가 붙은 코드펜스를 제거한다', () => {
    const input = '```tsx\nconst A = () => null;\n```';
    expect(stripCodeFences(input)).toBe('const A = () => null;');
  });

  it('언어 태그 없는 코드펜스도 제거한다', () => {
    const input = '```\nconst A = 1;\n```';
    expect(stripCodeFences(input)).toBe('const A = 1;');
  });

  it('펜스가 없으면 앞뒤 공백만 정리해 그대로 반환한다', () => {
    expect(stripCodeFences('  const A = 1;  ')).toBe('const A = 1;');
  });
});

describe('ensureRenderCall', () => {
  it('이미 render() 호출이 있으면 그대로 둔다', () => {
    const code = 'const Card = () => null;\nrender(<Card />);';
    expect(ensureRenderCall(code)).toBe(code);
  });

  it('const 컴포넌트 선언에 render 호출을 주입한다', () => {
    const code = 'const Card = () => null;';
    expect(ensureRenderCall(code)).toBe(`${code}\n\nrender(<Card />);`);
  });

  it('function 선언 컴포넌트에도 render 호출을 주입한다', () => {
    const code = 'function Widget() { return null; }';
    expect(ensureRenderCall(code)).toContain('render(<Widget />);');
  });

  it('대문자로 시작하는 컴포넌트 선언이 없으면 원본을 그대로 반환한다', () => {
    const code = 'const value = 42;';
    expect(ensureRenderCall(code)).toBe(code);
  });
});

describe('createSSEParser', () => {
  it('완성된 이벤트의 data 페이로드를 반환한다', () => {
    const feed = createSSEParser();
    expect(feed('data: {"a":1}\n\ndata: {"a":2}\n\n')).toEqual(['{"a":1}', '{"a":2}']);
  });

  it('청크 경계에 걸쳐 잘린 이벤트는 다음 청크와 합쳐 처리한다', () => {
    const feed = createSSEParser();
    expect(feed('data: {"a"')).toEqual([]);
    expect(feed(':1}\n\n')).toEqual(['{"a":1}']);
  });

  it('event: 줄과 CRLF 줄바꿈을 처리한다', () => {
    const feed = createSSEParser();
    expect(feed('event: content_block_delta\r\ndata: {"x":1}\r\n\r\n')).toEqual(['{"x":1}']);
  });
});

describe('anthropicDelta', () => {
  it('text_delta 이벤트에서 텍스트를 꺼낸다', () => {
    const data = JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'const' } });
    expect(anthropicDelta(data)).toBe('const');
  });

  it('텍스트가 없는 이벤트는 빈 문자열을 반환한다', () => {
    expect(anthropicDelta(JSON.stringify({ type: 'message_start' }))).toBe('');
  });

  it('error 이벤트는 provider 메시지를 담아 던진다', () => {
    const data = JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } });
    expect(() => anthropicDelta(data)).toThrow('Overloaded');
  });

  it('stop_reason이 max_tokens면 잘림 에러를 던진다', () => {
    const data = JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'max_tokens' } });
    expect(() => anthropicDelta(data)).toThrow('너무 길어');
  });
});

describe('googleDelta', () => {
  it('candidate parts의 텍스트를 이어 붙인다', () => {
    const data = JSON.stringify({ candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] });
    expect(googleDelta(data)).toEqual({ text: 'ab', truncated: false });
  });

  it('error 청크는 provider 메시지를 담아 던진다', () => {
    const data = JSON.stringify({ error: { code: 500, message: 'Internal error' } });
    expect(() => googleDelta(data)).toThrow('Internal error');
  });

  it('finishReason이 MAX_TOKENS면 truncated를 true로 표시한다', () => {
    const data = JSON.stringify({ candidates: [{ content: { parts: [{ text: 'x' }] }, finishReason: 'MAX_TOKENS' }] });
    expect(googleDelta(data)).toEqual({ text: 'x', truncated: true });
  });
});

describe('validateGenerateBody', () => {
  it('올바른 본문은 prompt, apiKey, provider를 돌려준다', () => {
    expect(validateGenerateBody({ prompt: '버튼', apiKey: 'k', provider: 'google' })).toEqual({
      ok: true,
      value: { prompt: '버튼', apiKey: 'k', provider: 'google' },
    });
  });

  it('provider가 없으면 anthropic을 기본값으로 쓴다', () => {
    const result = validateGenerateBody({ prompt: '버튼' });
    expect(result).toMatchObject({ ok: true, value: { provider: 'anthropic' } });
  });

  it('객체가 아닌 본문은 거부한다', () => {
    expect(validateGenerateBody(null)).toMatchObject({ ok: false });
    expect(validateGenerateBody('x')).toMatchObject({ ok: false });
  });

  it('허용되지 않은 provider는 거부한다', () => {
    expect(validateGenerateBody({ prompt: '버튼', provider: 'toString' })).toMatchObject({ ok: false });
  });

  it('문자열이 아닌 prompt는 거부한다', () => {
    expect(validateGenerateBody({ prompt: { a: 1 } })).toMatchObject({ ok: false });
  });

  it('공백뿐인 prompt는 거부한다', () => {
    expect(validateGenerateBody({ prompt: '   ' })).toMatchObject({ ok: false });
  });

  it('길이 상한을 넘는 prompt는 거부한다', () => {
    expect(validateGenerateBody({ prompt: 'a'.repeat(MAX_PROMPT_LENGTH + 1) })).toMatchObject({ ok: false });
  });

  it('문자열이 아닌 apiKey는 거부한다', () => {
    expect(validateGenerateBody({ prompt: '버튼', apiKey: 123 })).toMatchObject({ ok: false });
  });
});

describe('isAllowedOrigin', () => {
  it('Origin 헤더가 없으면 허용한다', () => {
    expect(isAllowedOrigin(null)).toBe(true);
  });

  it('localhost와 127.0.0.1(포트 무관)은 허용한다', () => {
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:5174')).toBe(true);
  });

  it('다른 사이트 origin은 거부한다', () => {
    expect(isAllowedOrigin('https://evil.example')).toBe(false);
    expect(isAllowedOrigin('http://localhost.evil.example')).toBe(false);
  });
});
