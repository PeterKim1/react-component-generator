export const MAX_PROMPT_LENGTH = 500;

export interface PromptValidation {
  valid: boolean;
  error?: string;
}

export function validatePrompt(prompt: string): PromptValidation {
  if (prompt.trim().length > MAX_PROMPT_LENGTH) {
    return { valid: false, error: `프롬프트는 ${MAX_PROMPT_LENGTH}자까지 입력할 수 있습니다.` };
  }
  return { valid: true };
}
