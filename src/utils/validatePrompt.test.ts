import { describe, it, expect } from 'vitest';
import { validatePrompt, MAX_PROMPT_LENGTH } from './validatePrompt';

describe('validatePrompt', () => {
  it('최대 길이는 500자다', () => {
    expect(MAX_PROMPT_LENGTH).toBe(500);
  });

  it('500자 이하이면 유효하다', () => {
    expect(validatePrompt('가'.repeat(500))).toEqual({ valid: true });
  });

  it('501자이면 길이 초과 에러를 반환한다', () => {
    const result = validatePrompt('가'.repeat(501));
    expect(result.valid).toBe(false);
    expect(result.error).toBe('프롬프트는 500자까지 입력할 수 있습니다.');
  });

  it('앞뒤 공백은 길이에 포함하지 않는다', () => {
    expect(validatePrompt(`  ${'가'.repeat(500)}  `)).toEqual({ valid: true });
  });
});
