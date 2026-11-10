import { describe, it, expect, vi } from 'vitest';
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
