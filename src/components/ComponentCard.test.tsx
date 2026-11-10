import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ComponentCard } from './ComponentCard';
import type { GeneratedComponent } from '../types';

const base: GeneratedComponent = {
  id: 'a',
  prompt: '버튼',
  code: 'const A = () => <b>hi</b>;\nrender(<A />);',
  createdAt: new Date('2026-01-02T03:04:05.000Z'),
};

function renderCard(component: GeneratedComponent, isStreaming: boolean) {
  const props = { onRemove: vi.fn(), onRegenerate: vi.fn(), isLoading: isStreaming };
  const view = render(<ComponentCard component={component} isStreaming={isStreaming} {...props} />);
  return {
    rerender: (next: GeneratedComponent, streaming: boolean) =>
      view.rerender(<ComponentCard component={next} isStreaming={streaming} {...props} isLoading={streaming} />),
  };
}

describe('ComponentCard 스트리밍', () => {
  it('스트리밍 중에는 코드 탭이 선택되고 누적된 코드를 보여준다', () => {
    renderCard({ ...base, code: 'const A = 1' }, true);

    expect(screen.getByRole('tab', { name: '코드' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('const A = 1')).toBeInTheDocument();
  });

  it('스트리밍이 끝나면 미리보기 탭으로 전환된다', () => {
    const { rerender } = renderCard({ ...base, code: 'const A = 1' }, true);

    rerender(base, false);

    expect(screen.getByRole('tab', { name: '미리보기' })).toHaveAttribute('aria-selected', 'true');
  });

  it('스트리밍 중에는 미리보기 탭이 비활성화된다', () => {
    renderCard({ ...base, code: 'const A = 1' }, true);

    expect(screen.getByRole('tab', { name: '미리보기' })).toBeDisabled();
  });

  it('스트리밍이 아닌 카드는 미리보기 탭으로 시작한다', () => {
    renderCard(base, false);

    expect(screen.getByRole('tab', { name: '미리보기' })).toHaveAttribute('aria-selected', 'true');
  });
});
