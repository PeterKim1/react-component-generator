import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PromptInput } from './PromptInput';

describe('PromptInput', () => {
  it('프롬프트가 비어 있으면 생성 버튼이 비활성이다', () => {
    render(<PromptInput onGenerate={vi.fn()} isLoading={false} />);
    expect(screen.getByRole('button', { name: '컴포넌트 생성' })).toBeDisabled();
  });

  it('입력하면 버튼이 활성화되고 클릭 시 입력값으로 onGenerate가 호출된다', async () => {
    const onGenerate = vi.fn();
    const user = userEvent.setup();
    render(<PromptInput onGenerate={onGenerate} isLoading={false} />);

    await user.type(screen.getByRole('textbox'), '프로필 카드');
    const submit = screen.getByRole('button', { name: '컴포넌트 생성' });
    expect(submit).toBeEnabled();

    await user.click(submit);
    expect(onGenerate).toHaveBeenCalledWith('프로필 카드');
  });

  it('로딩 중에는 생성 버튼이 비활성이고 "생성 중..." 을 보여준다', () => {
    render(<PromptInput onGenerate={vi.fn()} isLoading={true} />);
    expect(screen.getByRole('button', { name: '생성 중...' })).toBeDisabled();
  });

  describe('프롬프트 히스토리', () => {
    const HISTORY_KEY = 'rcg:prompt-history';

    beforeEach(() => {
      localStorage.clear();
    });

    it('생성하면 프롬프트가 localStorage 히스토리에 저장된다', async () => {
      const user = userEvent.setup();
      render(<PromptInput onGenerate={vi.fn()} isLoading={false} />);

      await user.type(screen.getByRole('textbox'), '프로필 카드');
      await user.click(screen.getByRole('button', { name: '컴포넌트 생성' }));

      expect(JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')).toEqual(['프로필 카드']);
    });

    it('저장된 히스토리를 마운트 시 보여주고 클릭하면 입력창에 채운다', async () => {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(['지난 프롬프트']));
      const user = userEvent.setup();
      render(<PromptInput onGenerate={vi.fn()} isLoading={false} />);

      await user.click(screen.getByRole('button', { name: '지난 프롬프트' }));

      expect(screen.getByRole('textbox')).toHaveValue('지난 프롬프트');
    });

    it('같은 프롬프트를 다시 생성하면 중복 없이 맨 앞으로 옮긴다', async () => {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(['B', 'A']));
      const user = userEvent.setup();
      render(<PromptInput onGenerate={vi.fn()} isLoading={false} />);

      await user.type(screen.getByRole('textbox'), 'A');
      await user.click(screen.getByRole('button', { name: '컴포넌트 생성' }));

      expect(JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')).toEqual(['A', 'B']);
    });

    it('히스토리는 최근 10개까지만 유지한다', async () => {
      const old = Array.from({ length: 10 }, (_, i) => `old${i}`);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(old));
      const user = userEvent.setup();
      render(<PromptInput onGenerate={vi.fn()} isLoading={false} />);

      await user.type(screen.getByRole('textbox'), 'new');
      await user.click(screen.getByRole('button', { name: '컴포넌트 생성' }));

      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
      expect(saved).toHaveLength(10);
      expect(saved[0]).toBe('new');
      expect(saved).not.toContain('old9');
    });
  });

  describe('500자 제한', () => {
    const pasteInto = async (text: string) => {
      const user = userEvent.setup();
      await user.click(screen.getByRole('textbox'));
      await user.paste(text);
      return user;
    };

    it('500자까지는 에러 없이 생성 버튼이 활성이다', async () => {
      render(<PromptInput onGenerate={vi.fn()} isLoading={false} />);
      await pasteInto('가'.repeat(500));

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '컴포넌트 생성' })).toBeEnabled();
    });

    it('500자를 넘으면 에러 메시지를 보여주고 생성 버튼이 비활성이다', async () => {
      render(<PromptInput onGenerate={vi.fn()} isLoading={false} />);
      await pasteInto('가'.repeat(501));

      expect(screen.getByRole('alert')).toHaveTextContent('프롬프트는 500자까지 입력할 수 있습니다.');
      expect(screen.getByRole('button', { name: '컴포넌트 생성' })).toBeDisabled();
    });

    it('500자를 넘은 상태에서 Ctrl+Enter를 눌러도 onGenerate가 호출되지 않는다', async () => {
      const onGenerate = vi.fn();
      render(<PromptInput onGenerate={onGenerate} isLoading={false} />);
      const user = await pasteInto('가'.repeat(501));

      await user.keyboard('{Control>}{Enter}{/Control}');
      expect(onGenerate).not.toHaveBeenCalled();
    });
  });
});
